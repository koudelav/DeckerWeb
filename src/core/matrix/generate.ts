// Generování systému pro kontrakt. Originál: System.cpp Generate, Area.cpp GenerateArea, Node.cpp
// (CreateClusters, GenerateICE, CreateFileList), DSFile.cpp Generate.
// Kuchařka: docs/pravidla/08-generovani-systemu.md

import {
  Alert, AttackSubtype, ContractType, DIR_COORD, Dir, FileState, FileType, IceState, IceType, NUM_CHIPS,
  NUM_PROGRAMS, NodeSubtype, NodeType, ProgramClass, TapewormSubtype, TargetObject, TraceSubtype, oppDir,
} from "../constants";
import type { Ctx } from "../context";
import { fileTypeForCorp, hintAvailable } from "../contract";
import { USELESS_FILE_CONTENTS } from "../data/fileContents";
import { applyVariance } from "../dice";
import { programSize } from "../program";
import type { Contract } from "../state";
import { hex, idiv } from "../util";
import { createIce, loadIceInitData } from "./ice";
import { ENTRY_POINT, chooseLocation, nodeName } from "./node";
import type { Area, DSFile, MNode, MatrixSystem } from "./types";

interface Gen {
  ctx: Ctx;
  sys: MatrixSystem;
  contract: Contract;
  nodeNumber: number;
  /** Junctiony vzniklé při dodatečném přidání cílového nodu – originál je nezařadil do seznamu nodů systému, takže pro ně negeneroval ICE. */
  noIce: Set<number>;
}

export interface GenerateOptions {
  /** Korporace má zvýšenou pohotovost po předchozím útoku → začíná se na žlutém alarmu. */
  alert: boolean;
}

/** System.cpp CSystem::Generate */
export function generateSystem(ctx: Ctx, contract: Contract, opts: GenerateOptions): MatrixSystem {
  const sys: MatrixSystem = {
    corporation: contract.corporation,
    rating: contract.systemSize,
    alert: opts.alert ? Alert.Yellow : Alert.Green,
    areas: [],
    nodes: [],
    ice: [],
    iceList: [],
    deadIce: [],
    cpuNodeId: -1,
    portalOutNodeId: -1,
    turnsUntilCrash: 0,
    externalAlarmsDeactivated: false,
    backdoor: false,
    iceReactivateTime: 0,
    passcodeAccessed: false,
    targetObject: contract.targetObject,
    nextFileId: 0,
  };
  const g: Gen = { ctx, sys, contract, nodeNumber: 0, noIce: new Set() };
  const size = contract.systemSize;

  let areaCount = idiv(size + 3, 4);
  let areaSize = ((size - 1) % 4) + areaCount;
  let areaNumber = 0;
  while (areaCount--) generateArea(g, areaSize++, areaNumber++);
  sys.portalOutNodeId = sys.areas[sys.areas.length - 1]!.portalOutId;

  placeQuestTargets(g);

  for (const node of sys.nodes) if (!g.noIce.has(node.id)) generateNodeIce(g, node);
  return sys;
}

// ---------------------------------------------------------------------------
// Oblasti a nody (Area.cpp)
// ---------------------------------------------------------------------------

function newNode(g: Gen, area: number, type: NodeType): MNode {
  const node: MNode = {
    id: g.sys.nodes.length,
    area,
    name: "",
    type,
    subType: 0,
    cluster: 0,
    number: g.nodeNumber++,
    adj: [null, null, null, null],
    x: 0,
    y: 0,
    files: [],
    smokeLevel: 0,
    silenceLevel: 0,
    activated: false,
    mapped: false,
    specialImage: -1,
  };
  g.sys.nodes.push(node);
  g.sys.areas[area]!.nodeIds.push(node.id);
  return node;
}

function findNode(g: Gen, area: Area, x: number, y: number): MNode | null {
  for (const id of area.nodeIds) {
    const n = g.sys.nodes[id]!;
    if (n.x === x && n.y === y) return n;
  }
  return null;
}

/** Area.cpp AddNode: připojí nový node k rodiči v náhodném směru. */
export function addNode(g: Gen, areaIndex: number, parent: MNode, type: NodeType): MNode {
  const node = newNode(g, areaIndex, type);
  let dir = g.ctx.rng.random(4);
  const rot = g.ctx.rng.chooseRot();
  for (let i = 0; i < 4; i++) {
    if (addNodeDir(g, areaIndex, parent, node, dir)) return node;
    dir = (dir + rot) & 3;
  }
  // Originál zde ukázal "Error - Could not add node" a nechal node nepřipojený na pozici (0,0)
  // (stává se zhruba u 0,4 % systémů). Remaster zkusí node připojit přes junction oblasti,
  // případně přes jiný node, aby byl vždy dosažitelný.
  const area = g.sys.areas[areaIndex]!;
  const candidates = area.nodeIds
    .map((id) => g.sys.nodes[id]!)
    .filter((n) => n.id !== node.id && n.id !== parent.id)
    .sort((a, b) => Number(b.type === NodeType.Junction) - Number(a.type === NodeType.Junction));
  for (const other of candidates) {
    for (let d = 0; d < 4; d++) if (addNodeDir(g, areaIndex, other, node, d)) return node;
  }
  throw new Error("Error - Could not add node");
}

/** Area.cpp AddNodeDir: volné místo, pokračování přes junction, nebo vytvoření nového junction. */
function addNodeDir(g: Gen, areaIndex: number, parent: MNode, node: MNode, dir: number): boolean {
  const { sys, ctx } = g;
  const area = sys.areas[areaIndex]!;
  const opp = oppDir(dir);
  const adjId = parent.adj[dir];
  if (adjId === null || adjId === undefined) {
    const x = parent.x + DIR_COORD[dir]!.x, y = parent.y + DIR_COORD[dir]!.y;
    if (findNode(g, area, x, y)) return false;
    parent.adj[dir] = node.id;
    node.adj[opp] = parent.id;
    node.x = x;
    node.y = y;
    return true;
  }
  const adj = sys.nodes[adjId]!;
  if (adj.type === NodeType.Junction) {
    let nd = ctx.rng.random(4);
    const rot = ctx.rng.chooseRot();
    for (let i = 0; i < 4; i++) {
      if (nd !== opp && addNodeDir(g, areaIndex, adj, node, nd)) return true;
      nd = (nd + rot) & 3;
    }
    return false;
  }
  // Na místě starého nodu vznikne junction, starý i nový node se k němu připojí.
  const old = adj;
  const lx = old.x, ly = old.y;
  const open = [false, false, false, false];
  const loc: { x: number; y: number }[] = [];
  let count = 0;
  for (let d = 0; d < 4; d++) {
    loc[d] = { x: lx + DIR_COORD[d]!.x, y: ly + DIR_COORD[d]!.y };
    if (d === opp) continue;
    if (findNode(g, area, loc[d]!.x, loc[d]!.y)) continue;
    open[d] = true;
    count++;
  }
  if (count < 2) return false;
  const junction = newNode(g, areaIndex, NodeType.Junction);
  junction.x = lx;
  junction.y = ly;
  for (let d = 0; d < 4; d++) {
    junction.adj[d] = old.adj[d]!;
    const o = old.adj[d];
    if (o !== null && o !== undefined) {
      sys.nodes[o]!.adj[oppDir(d)] = junction.id;
      old.adj[d] = null;
    }
  }
  const place = (n: MNode) => {
    let d = ctx.rng.random(4);
    const rot = ctx.rng.chooseRot();
    while (!open[d]) d = (d + rot) & 3;
    n.x = loc[d]!.x;
    n.y = loc[d]!.y;
    junction.adj[d] = n.id;
    n.adj[oppDir(d)] = junction.id;
    open[d] = false;
  };
  place(old);
  place(node);
  return true;
}

/** Area.cpp CArea::GenerateArea */
function generateArea(g: Gen, areaSize: number, areaNumber: number): void {
  const { sys, ctx } = g;
  const cfg = ctx.cfg.system;
  const rng = ctx.rng;
  const areaIndex = sys.areas.length;
  const area: Area = {
    number: areaNumber,
    nodeIds: [],
    spuId: -1,
    portalInId: null,
    portalOutId: -1,
    iceIoNodeId: -1,
    highSpeedIoNodeId: null,
    sizeX: 0,
    sizeY: 0,
  };
  sys.areas.push(area);

  const spu = newNode(g, areaIndex, areaNumber === 0 ? NodeType.Cpu : NodeType.Spu);
  area.spuId = spu.id;
  if (areaNumber === 0) sys.cpuNodeId = spu.id;

  addNode(g, areaIndex, spu, NodeType.Cop).subType = NodeSubtype.CopSecurity;

  let basicNodes = 0;
  const maybeCop = (node: MNode) => {
    basicNodes++;
    if (basicNodes % cfg.copEvery === 0) addNode(g, areaIndex, node, NodeType.Cop);
  };

  let n = cfg.dsBase + rng.random2(cfg.dsDice, areaSize + 1);
  while (n--) maybeCop(addNode(g, areaIndex, spu, NodeType.DataStore));
  n = cfg.ioBase + rng.random2(cfg.ioDice, areaSize + 1);
  while (n--) maybeCop(addNode(g, areaIndex, spu, NodeType.IO));

  const icePort = addNode(g, areaIndex, spu, NodeType.IO);
  icePort.subType = NodeSubtype.IoIcePort;
  area.iceIoNodeId = icePort.id;
  maybeCop(icePort);

  if (areaNumber === 0) {
    const alarm = addNode(g, areaIndex, spu, NodeType.IO);
    alarm.subType = NodeSubtype.IoAlarm;
    maybeCop(alarm);
  }

  if (rng.random(cfg.highSpeedIoDie) < sys.rating) {
    const hs = addNode(g, areaIndex, spu, NodeType.IO);
    hs.subType = NodeSubtype.IoMatrix;
    area.highSpeedIoNodeId = hs.id;
    maybeCop(hs);
  }

  if (areaNumber !== 0) area.portalInId = addNode(g, areaIndex, spu, NodeType.PortalIn).id;
  area.portalOutId = addNode(g, areaIndex, spu, NodeType.PortalOut).id;

  // Rozdělení na clustery (gateway ICE hlídá přechody mezi clustery)
  const cl = { next: 1 };
  for (let d = 0; d < 4; d++) {
    const a = spu.adj[d];
    if (a !== null && a !== undefined) createClusters(g, sys.nodes[a]!, cl, oppDir(d), { subNodes: 0, hasCop: false });
  }

  // Pomocná propojení DS a COP se sousedy
  for (const id of area.nodeIds) {
    const node = sys.nodes[id]!;
    if (node.type !== NodeType.DataStore && node.type !== NodeType.Cop) continue;
    for (let d = 0; d < 4; d++) {
      if (node.adj[d] !== null) continue;
      const other = findNode(g, area, node.x + DIR_COORD[d]!.x, node.y + DIR_COORD[d]!.y);
      if (
        other && other.type !== NodeType.PortalIn && other.type !== NodeType.PortalOut &&
        rng.random(cfg.auxConnectionChanceDie) === 1
      ) {
        node.adj[d] = other.id;
        other.adj[oppDir(d)] = node.id;
      }
    }
  }

  for (const id of area.nodeIds) {
    const node = sys.nodes[id]!;
    node.name = nodeName(node.type, areaNumber, node.cluster, node.number);
    if (node.type === NodeType.DataStore) createFileList(g, node);
  }

  normalizeArea(g, area);
}

/** Posun souřadnic oblasti do kladných hodnot a výpočet velikosti (konec GenerateArea). */
function normalizeArea(g: Gen, area: Area): void {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const id of area.nodeIds) {
    const n = g.sys.nodes[id]!;
    // Originál používá "else if" – zachováno (výsledek je stejný, protože min ≤ 0 ≤ max).
    if (n.x < minX) minX = n.x;
    else if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    else if (n.y > maxY) maxY = n.y;
  }
  for (const id of area.nodeIds) {
    const n = g.sys.nodes[id]!;
    n.x -= minX;
    n.y -= minY;
  }
  area.sizeX = maxX - minX + 1;
  area.sizeY = maxY - minY + 1;
}

/**
 * Node.cpp CreateClusters. Do hloubky se jde jen přes junction (v té chvíli mají víc spojení jen
 * junction a CPU/SPU). Cluster vznikne, když větev má koprocesor a aspoň 4 nody.
 * Pozor, věrně z originálu: počitadlo nodů se zvyšuje u každého nodu včetně junction a portálu.
 */
function createClusters(
  g: Gen, node: MNode, cl: { next: number }, dirFrom: number, acc: { subNodes: number; hasCop: boolean },
): void {
  if (node.type === NodeType.Junction) {
    for (let d = 0; d < 4; d++) {
      if (d === dirFrom) continue;
      const a = node.adj[d];
      if (a !== null && a !== undefined) createClusters(g, g.sys.nodes[a]!, cl, oppDir(d), acc);
    }
    if (acc.hasCop && acc.subNodes >= 4) {
      markNewCluster(g, node, cl.next, dirFrom);
      cl.next++;
      acc.hasCop = false;
      acc.subNodes = 0;
    }
  } else if (node.type === NodeType.PortalIn || node.type === NodeType.PortalOut) {
    node.cluster = cl.next++;
  } else if (node.type === NodeType.Cop) {
    acc.hasCop = true;
  }
  acc.subNodes++;
}

/** Node.cpp MarkNewCluster */
function markNewCluster(g: Gen, node: MNode, cluster: number, dirFrom: number): void {
  for (let d = 0; d < 4; d++) {
    if (d === dirFrom) continue;
    const a = node.adj[d];
    if (a !== null && a !== undefined && g.sys.nodes[a]!.cluster === node.cluster) {
      markNewCluster(g, g.sys.nodes[a]!, cluster, oppDir(d));
    }
  }
  node.cluster = cluster;
}

// ---------------------------------------------------------------------------
// Soubory (Node.cpp CreateFileList, DSFile.cpp Generate)
// ---------------------------------------------------------------------------

function createFileList(g: Gen, node: MNode): void {
  const f = g.ctx.cfg.files;
  const rng = g.ctx.rng;
  const count = f.countBase + rng.random2(f.countDice, f.countDie);
  for (let i = 0; i < count; i++) {
    let type = FileType.Useless;
    const roll = rng.random(100);
    if (roll < f.valuablePercent) type = FileType.Valuable;
    else if (hintAvailable(g.contract) && roll === f.clueRoll) type = FileType.Clue;
    else if (roll === f.passcodeRoll) type = FileType.Passcode;
    else if (roll === f.programRoll) {
      const r2 = rng.random(100);
      if (r2 < f.programPercent) type = FileType.Program;
      else if (r2 < f.programPercent + f.programSourcePercent) type = FileType.ProgramSource;
      else type = FileType.ChipSource;
    }
    node.files.push(generateFile(g, node, type));
  }
}

/** DSFile.cpp CDSFile::Generate */
export function generateFile(g: Gen, node: MNode, initialType: FileType): DSFile {
  const { ctx, sys, contract } = g;
  const f = ctx.cfg.files;
  const rng = ctx.rng;
  let type = initialType;
  let contents = 0;
  let value = 0;
  switch (type) {
    case FileType.Useless:
      if (rng.random(f.fakeValuableChanceDie) === 0) {
        type = FileType.Valuable;
        contents = fileTypeForCorp(ctx, contract);
      } else {
        contents = rng.random(USELESS_FILE_CONTENTS.length);
      }
      break;
    case FileType.Valuable:
      contents = fileTypeForCorp(ctx, contract);
      value = f.valueBase + rng.random2(f.valueDice, f.valueDie) + f.valuePerRating * sys.rating;
      value = applyVariance(ctx, value, f.valueVariancePercent);
      break;
    case FileType.Quest:
      contents = contract.targetObject;
      break;
    case FileType.Program:
    case FileType.ProgramSource:
    case FileType.ChipSource: {
      if (type === FileType.ChipSource) contents = rng.random(NUM_CHIPS);
      else {
        do contents = rng.random(NUM_PROGRAMS);
        while (contents === ProgramClass.Client);
      }
      const roll = rng.random(100);
      const idx = f.programRatingThresholds.findIndex((t) => roll < t);
      value = Math.max(1, sys.rating + f.programRatingOffsets[idx === -1 ? f.programRatingOffsets.length - 1 : idx]!);
      break;
    }
    default:
      break;
  }
  let size: number;
  if (type === FileType.Program) size = programSize(ctx.cfg, contents, value);
  else if (type === FileType.ProgramSource) size = f.sourceSizeMultiplier * programSize(ctx.cfg, contents, value);
  else if (type === FileType.ChipSource) size = f.sourceSizeMultiplier * ctx.cfg.chips.complexity[contents]! * value;
  else {
    const base = f.sizePerRating * sys.rating;
    size = base + rng.random2(base, f.sizeDie);
  }
  return {
    id: sys.nextFileId++,
    name: `${node.name}-${hex(rng.random(0x10000), 4)}`,
    type,
    value,
    contents,
    state: FileState.InNode,
    tapewormId: null,
    size,
  };
}

// ---------------------------------------------------------------------------
// Cíle kontraktu (System.cpp Generate, část "Add the Quest data")
// ---------------------------------------------------------------------------

function placeQuestTargets(g: Gen): void {
  const { sys, contract, ctx } = g;
  const rng = ctx.rng;
  const randomArea = () => rng.random(sys.areas.length);
  const nodesOf = (ai: number, pred: (n: MNode) => boolean) =>
    sys.areas[ai]!.nodeIds.map((id) => sys.nodes[id]!).filter(pred);

  const addExtraNode = (ai: number, type: NodeType): MNode => {
    // Nový node dostane číslo podle počtu nodů v oblasti (jako originál, může se opakovat).
    const area = sys.areas[ai]!;
    const saved = g.nodeNumber;
    g.nodeNumber = area.nodeIds.length;
    const before = sys.nodes.length;
    const node = addNode(g, ai, sys.nodes[area.spuId]!, type);
    for (let id = before; id < sys.nodes.length; id++) {
      const n = sys.nodes[id]!;
      if (id !== node.id) g.noIce.add(id);
      // Originál pojmenoval jen cílový node; remaster pojmenuje i případný nový junction.
      n.name = nodeName(n.type, area.number, n.cluster, n.number);
    }
    g.nodeNumber = saved;
    // Remaster: oblast se znovu posune do kladných souřadnic (originál to neudělal a node mohl
    // ležet mimo mapu).
    normalizeArea(g, area);
    return node;
  };

  switch (contract.type) {
    case ContractType.Steal:
    case ContractType.StealErase:
    case ContractType.Erase:
    case ContractType.Edit:
      for (let t = 0; t < contract.numTargets; t++) {
        const list = nodesOf(randomArea(), (n) => n.type === NodeType.DataStore);
        const node = list[rng.random(list.length)]!;
        const file = generateFile(g, node, FileType.Quest);
        const pos = rng.random(node.files.length + 1);
        node.files.splice(pos, 0, file);
        node.subType = NodeSubtype.DsQuest;
      }
      break;
    case ContractType.DeactivateIO:
    case ContractType.ActivateIO:
    case ContractType.SabotageIO:
      for (let t = 0; t < contract.numTargets; t++) {
        const ai = randomArea();
        const list = nodesOf(ai, (n) => n.type === NodeType.IO && n.subType === NodeSubtype.IoUseless);
        const node = list.length === 0 ? addExtraNode(ai, NodeType.IO) : list[rng.random(list.length)]!;
        node.subType = NodeSubtype.IoQuest;
      }
      break;
    case ContractType.RunProgram:
      if (contract.targetObject !== TargetObject.NodeCpu) {
        const type = contract.targetObject === TargetObject.NodeIO ? NodeType.IO : NodeType.DataStore;
        for (let t = 0; t < contract.numTargets; t++) {
          const ai = randomArea();
          const list = nodesOf(ai, (n) => n.type === type && n.subType === 0);
          const node = list.length === 0 ? addExtraNode(ai, type) : list[rng.random(list.length)]!;
          node.subType = 1;
        }
      }
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// ICE (Node.cpp GenerateICE)
// ---------------------------------------------------------------------------

function bumpRating(g: Gen, rating: number, difficulty: number): number {
  const c = g.ctx.cfg.iceGeneration;
  const roll = g.ctx.rng.random(c.bumpDie);
  if (roll < c.bumpPlus1Chance) {
    if (difficulty >= c.bumpPlus1MinDifficulty) return rating + 1;
  } else if (roll < c.bumpPlus1Chance + c.bumpPlus2Chance) {
    if (difficulty >= c.bumpPlus2MinDifficulty) return rating + 2;
  }
  return rating;
}

function generateNodeIce(g: Gen, node: MNode): void {
  const { ctx, sys } = g;
  const cfg = ctx.cfg;
  const c = cfg.iceGeneration;
  const rng = ctx.rng;
  const difficulty = sys.rating;
  const isImportant = (n: MNode) => n.type === NodeType.Cpu || n.type === NodeType.Spu;

  // Gateway na každém přechodu mezi clustery
  for (let d = 0; d < 4; d++) {
    const a = node.adj[d];
    if (a === null || a === undefined) continue;
    const other = sys.nodes[a]!;
    if (other.cluster === node.cluster) continue;
    const ice = createIce(cfg, sys, IceType.Gateway, node.id);
    ice.subType = d;
    ice.rating = difficulty;
    ice.state = IceState.Guarding;
    if (isImportant(node) || isImportant(other)) ice.rating += c.importantNodeBonus;
    ice.rating = bumpRating(g, ice.rating, difficulty);
    loadIceInitData(ctx, ice);
    const p = ENTRY_POINT[d]!;
    ice.x = p.x;
    ice.y = p.y;
    sys.ice.push(ice);
    sys.iceList.push(ice.id);
  }

  if (node.type === NodeType.Junction) return;

  // Počet dalších ICE
  let roll = rng.random(c.countDie);
  if (node.type === NodeType.Spu || node.type === NodeType.PortalIn || node.type === NodeType.PortalOut) {
    roll += c.countBonusSpuPortal;
  } else if (node.type === NodeType.Cpu || node.type === NodeType.Cop) {
    roll += c.countBonusCpuCop;
  }
  let numIce: number;
  if (c.fixThirdIceBug) numIce = c.countTable[Math.min(roll, c.countTable.length - 1)]!;
  else numIce = roll === 0 ? 0 : roll === 1 ? 1 : 2; // 1.12: `(nRoll == 2) || (nRoll = 3)` je vždy pravda
  if (sys.portalOutNodeId === node.id && numIce > c.systemPortalMaxIce) numIce = c.systemPortalMaxIce;

  const area = sys.areas[node.area]!;
  const isCopNormal = node.type === NodeType.Cop && node.subType !== NodeSubtype.CopSecurity;
  const isSecurity = node.type === NodeType.Cop && node.subType === NodeSubtype.CopSecurity;

  while (numIce--) {
    let type: IceType;
    let state: number;
    let response = false;
    let dir = Dir.None;
    if (numIce === 0) {
      // První ICE je bílé: v koprocesoru probe, ve výstupním portálu oblasti response attack, jinak guardian
      if (isCopNormal) {
        type = IceType.Probe;
        state = IceState.Searching;
      } else if (node.id === area.portalOutId) {
        type = IceType.Attack;
        state = IceState.Inactive;
        response = true;
      } else {
        type = IceType.Guardian;
        state = IceState.Guarding;
        dir = Dir.Center;
      }
    } else {
      // Druhé ICE: trace (jen od obtížnosti 3) nebo attack; třetí vždy attack
      if (numIce === 1 && difficulty >= c.traceMinDifficulty && rng.random(c.traceChanceDie) === 0) {
        type = IceType.Trace;
      } else {
        type = IceType.Attack;
      }
      if (isCopNormal) response = true;
      state = IceState.Inactive;
    }
    const ice = createIce(cfg, sys, type, node.id);
    ice.state = state;
    ice.response = response;

    if (type === IceType.Attack) {
      ice.subType = rng.random(100) + 1 < (difficulty - c.killerBaseLevel) * c.killerPercentPerLevel
        ? AttackSubtype.Killer : AttackSubtype.Normal;
      if (rng.random(100) + 1 < (difficulty - c.optionBaseLevel) * c.optionPercentPerLevel) {
        const w = c.optionWeights;
        let r = rng.random(w[0]! + w[1]! + w[2]!);
        if (r < w[0]!) ice.subType |= AttackSubtype.Hardened;
        else if ((r -= w[0]!) < w[1]!) ice.subType |= AttackSubtype.Phasing;
        else ice.subType |= AttackSubtype.Crash;
      }
    } else if (type === IceType.Trace) {
      const normal = c.traceNormalPercentPerLevel * (c.traceNormalBase - difficulty);
      const fry = c.traceFryPercentPerLevel * (difficulty - c.traceFryBaseLevel);
      const r = rng.random(100);
      ice.subType = r < normal ? TraceSubtype.Normal : r < fry + normal ? TraceSubtype.Fry : TraceSubtype.Dump;
    }

    ice.rating = difficulty;
    if (isImportant(node) || isSecurity) ice.rating += c.importantNodeBonus;
    ice.rating = bumpRating(g, ice.rating, difficulty);
    loadIceInitData(ctx, ice);
    const loc = chooseLocation(ctx, sys, node, dir);
    if (!loc) throw new Error("Error placing initial ice!");
    ice.x = loc.x;
    ice.y = loc.y;
    sys.ice.push(ice);
    sys.iceList.push(ice.id);
  }

  // Tapewormy hlídající soubory
  if (node.type === NodeType.DataStore) {
    let target = 0;
    for (const file of node.files) {
      const chance = c.tapewormChance[file.type] ?? -1;
      if (chance >= 0) target = chance; // −1: originál nedefinováno, drží předchozí hodnotu
      if (rng.random(c.tapewormChanceDie) >= target) continue;
      const tw = createIce(cfg, sys, IceType.Tapeworm, node.id);
      tw.subType = rng.random(100) + 1 < (difficulty - c.dataBombBaseLevel) * c.dataBombPercentPerLevel
        ? TapewormSubtype.DataBomb : TapewormSubtype.Normal;
      tw.rating = bumpRating(g, difficulty, difficulty);
      tw.state = IceState.Guarding;
      tw.fileId = file.id;
      loadIceInitData(ctx, tw);
      const loc = chooseLocation(ctx, sys, node, Dir.None);
      if (!loc) continue; // originál: "Error placing initial ice!" a soubor zůstane bez tapewormu
      tw.x = loc.x;
      tw.y = loc.y;
      file.tapewormId = tw.id;
      sys.ice.push(tw);
      sys.iceList.push(tw.id);
    }
  }
}
