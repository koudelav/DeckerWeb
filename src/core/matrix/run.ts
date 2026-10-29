// Run v Matrixu – pravidla bez UI.
// Originál: MatrixView.cpp (DoMove, DoEnterNode, DoRunProgram, DoRunProgramVsIce, akce v nodech,
// DoEndPlayerTurn, DoSetAlert, DoCrashIce, DoDumpDecker…), Ice.cpp (DoAction, DoQuery, DoMove,
// DoWander, NoticedPlayer), TransferDlg.cpp, FileAccessDlg.cpp, Contract.cpp GetContractStatus.
// Rozbor: docs/matrix-analyza.md. Kuchařka: docs/pravidla/10-matrix.md, 11-programy-v-matrixu.md, 12-konec-runu.md
//
// UI volá akce (move, runProgram, …). Jádro mění stav a do `out` hlásí zprávy, zvuky a efekty.

import {
  calcCurrentLoad, clearCurrentContract, effectiveLevel, effectiveRating, findProgram, loadRatings, passTime,
  type GameEvent, type RatingEnv,
} from "../character";
import {
  Alert, AttackSubtype, CharRating, ChipType, ContractFlag, ContractType, Dir, FileState, FileType, HardwareType,
  IceRating, IceState, IceType, ItemType, NodeSubtype, NodeType, NUM_CHIPS, ProgramClass, TapewormSubtype, TargetObject,
  TraceSubtype, oppDir,
} from "../constants";
import type { Ctx } from "../context";
import { contractTypeText, generateContract, targetObjectText } from "../contract";
import { CHIP_NAMES, REP_LEVEL_NAMES } from "../data/texts";
import { SOUND_ID } from "../data/sounds";
import { FILE_SCAN_STRINGS } from "../data/fileContents";
import { computeDamage, doDieRoll, repPointsForNextLevel } from "../dice";
import { createProgram, programSize, softwareText } from "../program";
import type { Character, Program } from "../state";
import { idiv } from "../util";
import { generateSystem } from "./generate";
import { iceEffectiveRating } from "./ice";
import { chooseLocation, pathDistances, type PlayerPresence } from "./node";
import type { DSFile, Ice, MatrixSystem, MNode } from "./types";

export type MsgColor = "black" | "blue" | "red" | "orange" | "dkblue";
export interface RunMessage { text: string; color: MsgColor }
export type RunFx =
  | { kind: "damage" | "query" | "alert" | "bypass" | "crash" | "enter" | "leave"; iceId: number | null }
  | { kind: "playerHit" | "decoy" | "viewIce" | "map" };

/** MatrixView.h DUMP_* */
export enum DumpCause {
  DeckDamage = 0,
  Unconscious = 1,
  Death = 2,
  Trace = 3,
  TraceFry = 4,
  SysCrash = 5,
  SysOffline = 6,
  Disconnect = 7,
}

export type FileOp = "get" | "edit" | "erase";

export interface ContractStatus {
  /** 1 splněno, 0 nedokončeno, −1 neúspěch */
  code: -1 | 0 | 1;
  overall: "Complete" | "Incomplete" | "Failed";
  lines: string[];
}

export interface RunEnd {
  cause: DumpCause;
  /** Hláška při odpojení (MessageBox originálu) a další hlášky (policie, proxy). */
  messages: string[];
  /** Postava zemřela – konec hry. */
  death: boolean;
  contract: string;
  status: ContractStatus | null;
  pay: number;
  fileValue: number;
  total: number;
  skillPoints: number;
  repText: string;
  /** Programy a zdrojáky získané ze stažených souborů. */
  loot: string[];
  /** Události z 1 dne po runu (nájem, nový týden…). */
  timeEvents: GameEvent[];
  gameOver: boolean;
}

export interface RunState {
  system: MatrixSystem;
  /** CRF_ALARMS_SET – během runu byl červený alarm. */
  alarmsSet: boolean;
  nodeId: number;
  x: number;
  y: number;
  targetIceId: number | null;
  /** ICE v nodu hráče, v pořadí originálu (m_olCurrentIceList). */
  currentIce: number[];
  highestDeceivedIce: number;
  active: { armor: number | null; shield: number | null; hide: number | null; scan: number | null; reflect: number | null; boost: number | null };
  decoys: { x: number; y: number }[];
  clientProgramStatus: number;
  traceIceId: number | null;
  traceInitialTime: number;
  traceTurnsLeft: number;
  traceType: TraceSubtype;
  traced: boolean;
  transferProgramId: number | null;
  transferFileId: number | null;
  transferInitialTime: number;
  transferTurnsLeft: number;
  fileOp: FileOp;
  scanMP: number;
  /** Index souboru v nodu, který se právě skenuje (originál m_posScanFile). */
  scanFileIndex: number | null;
  /** Čas runu v tazích (sekundách). */
  runTime: number;
  damageMental: number;
  damageDeck: number;
  /** Výpis zpráv (posledních 300). */
  log: RunMessage[];
  end: RunEnd | null;
}

export interface RunOutput {
  messages: RunMessage[];
  sounds: number[];
  fx: RunFx[];
}

const MAX_LOG = 300;

/** HomeView::OnMatrix – vstup do Matrixu. */
export function startRun(ctx: Ctx, ch: Character, useBackdoor: boolean): Run {
  const c = ch.currentContract;
  if (!c) throw new Error("No contract has been accepted.");
  const cfg = ctx.cfg;
  const system = generateSystem(ctx, c, { alert: ch.systemAlerts[c.corporation]! > 0 });
  ch.health.mental = cfg.health.max;
  ch.health.deck = cfg.health.max;
  const def = ch.software.find((p) => p.id === ch.defaults.attack);
  if (def) def.loadByDefault = true;
  ch.onRun = false;
  calcCurrentLoad(cfg, ch);
  let entry = system.portalOutNodeId;
  if (useBackdoor && ch.backdoor[c.corporation]! > 0) entry = system.cpuNodeId;
  const state: RunState = {
    system,
    alarmsSet: false,
    nodeId: entry,
    x: 4,
    y: 4,
    targetIceId: null,
    currentIce: [],
    highestDeceivedIce: 0,
    active: {
      armor: ch.defaults.armor, shield: ch.defaults.shield, hide: ch.defaults.hide, scan: null,
      reflect: ch.defaults.reflect, boost: null,
    },
    decoys: [],
    clientProgramStatus: 0,
    traceIceId: null,
    traceInitialTime: 0,
    traceTurnsLeft: 0,
    traceType: TraceSubtype.Normal,
    traced: false,
    transferProgramId: null,
    transferFileId: null,
    transferInitialTime: 0,
    transferTurnsLeft: 0,
    fileOp: "get",
    scanMP: 0,
    scanFileIndex: null,
    runTime: 0,
    damageMental: 0,
    damageDeck: 0,
    log: [],
    end: null,
  };
  // Neplatné výchozí programy (nenahrané) se nepoužijí
  for (const k of Object.keys(state.active) as (keyof RunState["active"])[]) {
    const id = state.active[k];
    if (id !== null && !(ch.software.find((p) => p.id === id)?.loadedRating)) state.active[k] = null;
  }
  ch.onRun = true;
  const run = new Run(ctx, ch, state);
  run.sound(SOUND_ID.EnterMatrix);
  run.enterNode(entry, Dir.Center);
  return run;
}

/** Ovládací prvky dostupné v aktuálním stavu (UpdateControls, UpdateNodeAccessButtons). */
export interface RunControls {
  move: [boolean, boolean, boolean, boolean];
  attack: boolean;
  deceive: boolean;
  analyze: boolean;
  scan: boolean;
  /** Akce v nodu: viditelné podle typu nodu, enabled podle situace. */
  node: {
    files: boolean; // DS: get/edit/erase
    useIo: boolean | null;
    crash: boolean | null;
    getMap: boolean | null;
    backdoor: boolean | null;
    killShutdown: boolean | null;
    killAlarm: boolean | null;
    killTrace: boolean | null;
    enterPortal: boolean | null;
  };
  isDataStore: boolean;
}

export class Run {
  readonly ctx: Ctx;
  readonly ch: Character;
  readonly s: RunState;
  out: RunOutput = { messages: [], sounds: [], fx: [] };

  constructor(ctx: Ctx, ch: Character, state: RunState) {
    this.ctx = ctx;
    this.ch = ch;
    this.s = state;
  }

  /** Vybere a vyprázdní výstup pro UI. */
  drain(): RunOutput {
    const o = this.out;
    this.out = { messages: [], sounds: [], fx: [] };
    return o;
  }

  // -------------------------------------------------------------------------
  // Pomocné
  // -------------------------------------------------------------------------

  get cfg() {
    return this.ctx.cfg;
  }
  get m() {
    return this.ctx.cfg.matrix;
  }
  get sys(): MatrixSystem {
    return this.s.system;
  }
  get node(): MNode {
    return this.sys.nodes[this.s.nodeId]!;
  }
  get ended(): boolean {
    return this.s.end !== null;
  }
  ice(id: number): Ice {
    return this.sys.ice[id]!;
  }
  currentIce(): Ice[] {
    return this.s.currentIce.map((id) => this.ice(id));
  }
  get target(): Ice | null {
    return this.s.targetIceId === null ? null : this.ice(this.s.targetIceId);
  }
  prog(id: number | null): Program | null {
    if (id === null) return null;
    return this.ch.software.find((p) => p.id === id) ?? null;
  }
  get defAttack(): Program | null {
    return this.prog(this.ch.defaults.attack);
  }
  get activeHide(): Program | null {
    return this.prog(this.s.active.hide);
  }
  get activeArmor(): Program | null {
    return this.prog(this.s.active.armor);
  }
  get activeShield(): Program | null {
    return this.prog(this.s.active.shield);
  }
  get activeReflect(): Program | null {
    return this.prog(this.s.active.reflect);
  }
  get activeScan(): Program | null {
    return this.prog(this.s.active.scan);
  }
  get activeBoost(): Program | null {
    return this.prog(this.s.active.boost);
  }
  msg(text: string, color: MsgColor = "black"): void {
    const m = { text, color };
    this.out.messages.push(m);
    this.s.log.push(m);
    if (this.s.log.length > MAX_LOG) this.s.log.splice(0, this.s.log.length - MAX_LOG);
  }
  sound(id: number): void {
    if (id >= 0) this.out.sounds.push(id);
  }
  fx(f: RunFx): void {
    this.out.fx.push(f);
  }
  roll(target: number): number {
    return doDieRoll(this.ctx, target);
  }
  rnd(n: number): number {
    return this.ctx.rng.random(n);
  }
  env(): RatingEnv {
    return {
      smoke: this.node.smokeLevel > 0,
      boostClass: this.activeBoost?.cls ?? null,
      traced: this.s.traced,
      clientProgramActive: this.s.clientProgramStatus !== 0,
    };
  }
  charRating(type: CharRating): number {
    return effectiveRating(this.cfg, this.ch, type, this.env());
  }
  iceRating(ice: Ice, type: IceRating, includeAnalyze = true): number {
    return iceEffectiveRating(this.cfg, this.sys.alert, ice, type, includeAnalyze);
  }
  presence(nodeId: number): PlayerPresence | undefined {
    if (nodeId !== this.s.nodeId) return undefined;
    return { nodeId, x: this.s.x, y: this.s.y, decoys: this.s.decoys };
  }
  hasQueried(ice: Ice): boolean {
    return ice.state === IceState.Queried1 || ice.state === IceState.Queried2 || ice.state === IceState.Queried3;
  }
  isActive(ice: Ice): boolean {
    return this.sys.iceList.includes(ice.id);
  }
  fileById(node: MNode, id: number | null): DSFile | null {
    if (id === null) return null;
    return node.files.find((f) => f.id === id) ?? null;
  }
  findFile(id: number): DSFile | null {
    for (const n of this.sys.nodes) {
      const f = n.files.find((x) => x.id === id);
      if (f) return f;
    }
    return null;
  }
  /** Program.cpp / DSFile.cpp GetLoadTime */
  loadTime(size: number): number {
    const hs = this.sys.areas[this.node.area]!.highSpeedIoNodeId;
    if (hs !== null && this.sys.nodes[hs]!.activated) return 1;
    const rate = 1 << this.ch.hardware[HardwareType.HighBandwidthBus]!;
    return Math.max(1, idiv(size + rate - 1, rate));
  }
  programLoadTime(p: Program): number {
    return this.loadTime(programSize(this.cfg, p.cls, p.rating));
  }
  get transferInProgress(): boolean {
    return this.s.transferProgramId !== null || this.s.transferFileId !== null;
  }
  /** Systémový rating × násobek (častý člen v cílových číslech). */
  get sr(): number {
    return this.m.sysMult * this.sys.rating;
  }

  // -------------------------------------------------------------------------
  // Ovládání
  // -------------------------------------------------------------------------

  controls(): RunControls {
    const s = this.s;
    const guard = [false, false, false, false];
    let hostile = false, guardian = false, black = false, queried = false;
    for (const ice of this.currentIce()) {
      if (ice.state & IceState.MaskHostile) hostile = true;
      if (this.hasQueried(ice)) queried = true;
      if (ice.type === IceType.Gateway) guard[ice.subType] = true;
      else if (ice.type === IceType.Guardian) guardian = true;
      else if (ice.type === IceType.Attack || ice.type === IceType.Trace) black = true;
    }
    const node = this.node;
    const move = [0, 1, 2, 3].map((d) => node.adj[d] !== null && (!guard[d] || (!hostile && !queried))) as RunControls["move"];
    const blocked = (queried || hostile) && (guardian || black);
    const t = s.targetIceId !== null;
    const ok = (v: boolean) => !blocked && v;
    const type = node.type;
    const isCpu = type === NodeType.Cpu;
    const isSpu = isCpu || type === NodeType.Spu;
    const isSec = type === NodeType.Cop && node.subType === NodeSubtype.CopSecurity;
    const isPortal = type === NodeType.PortalIn || type === NodeType.PortalOut;
    return {
      move,
      attack: t && this.defAttack !== null,
      deceive: t && findProgram(this.ch, ProgramClass.Deceive) !== null,
      analyze: t && findProgram(this.ch, ProgramClass.Analyze) !== null,
      scan: (type === NodeType.DataStore || type === NodeType.IO) && findProgram(this.ch, ProgramClass.Scan) !== null,
      isDataStore: type === NodeType.DataStore,
      node: {
        files: type === NodeType.DataStore && !blocked,
        useIo: type === NodeType.IO ? ok(!node.activated) : null,
        crash: isCpu ? ok(!this.sys.turnsUntilCrash && !guardian) : null,
        getMap: isSpu ? ok(true) : null,
        backdoor: isCpu ? ok(true) : null,
        killShutdown: isSpu ? ok(this.sys.turnsUntilCrash !== 0) : null,
        killAlarm: isSec ? ok(this.sys.alert === Alert.Yellow || (this.sys.alert === Alert.Red && !guardian)) : null,
        killTrace: isSec ? ok(s.traced) : null,
        enterPortal: isPortal ? ok(node.id !== this.sys.portalOutNodeId) : null,
      },
    };
  }

  /** Klik na ICE v nodu (CNodeView) – bez tahu. */
  setTarget(iceId: number | null): void {
    if (iceId === null || this.s.currentIce.includes(iceId)) this.s.targetIceId = iceId;
  }

  /** OnNextTarget – bez tahu. */
  nextTarget(): void {
    const list = this.s.currentIce;
    if (this.s.targetIceId !== null) {
      const i = list.indexOf(this.s.targetIceId);
      if (i >= 0 && i + 1 < list.length) {
        this.s.targetIceId = list[i + 1]!;
        return;
      }
    }
    if (list.length) this.s.targetIceId = list[0]!;
  }

  // -------------------------------------------------------------------------
  // Vstup do nodu a pohyb hráče
  // -------------------------------------------------------------------------

  /** MatrixView DoEnterNode */
  enterNode(nodeId: number, dirFrom: Dir): void {
    const s = this.s;
    const node = this.sys.nodes[nodeId]!;
    const loc = chooseLocation(this.ctx, this.sys, node, dirFrom, this.presence(nodeId)) ?? { x: 4, y: 4 };
    s.nodeId = nodeId;
    s.x = loc.x;
    s.y = loc.y;
    for (let i = 0; i < s.decoys.length; i++) {
      const d = chooseLocation(this.ctx, this.sys, node, dirFrom, this.presence(nodeId));
      if (d) s.decoys[i] = d;
    }
    s.targetIceId = null;
    s.highestDeceivedIce = 0;
    node.mapped = true;
    if (this.ch.hardware[HardwareType.ProximityMapper]! > 0) {
      for (const a of node.adj) if (a !== null) this.sys.nodes[a]!.mapped = true;
    }
    s.currentIce = [];
    for (const id of this.sys.iceList) {
      const ice = this.ice(id);
      if (ice.nodeId === nodeId) {
        s.currentIce.push(id);
        ice.wasAccessed = false;
        ice.bypassed = false;
      }
    }
    if (s.traced) this.markIceAsHostile();
    this.msg(`Entering node ${node.name}.`);
    this.fx({ kind: "map" });
  }

  /** MatrixView DoMove */
  move(dir: 0 | 1 | 2 | 3): void {
    if (this.ended) return;
    const s = this.s;
    const dest = this.node.adj[dir];
    if (dest === null || dest === undefined) return;
    if (!this.controls().move[dir]) return;
    for (const ice of this.currentIce()) {
      if (ice.type === IceType.Gateway && ice.subType === dir && !ice.bypassed) {
        const hide = this.activeHide;
        if (hide) {
          if (this.programVsIce(hide, ice)) {
            this.msg(`${ice.name} was successfully bypassed by the ${hide.name} program.`);
            break;
          }
          this.msg(`${ice.name} was not fooled by ${hide.name} program.`);
          ice.wasAccessed = true;
        } else {
          this.msg(`${ice.name} blocks you passage.`);
        }
        this.endTurn();
        return;
      }
    }
    if (s.transferFileId !== null) {
      s.transferFileId = null;
      this.msg("File transfer cancelled.");
    }
    if (s.active.scan !== null) s.active.scan = null;
    if (s.clientProgramStatus !== 0) {
      s.clientProgramStatus = 0;
      this.msg("Client program execution cancelled.");
    }
    for (const ice of this.currentIce()) {
      if (ice.state === IceState.Moving) {
        if (!ice.bypassed) ice.state = IceState.Searching;
      } else if (ice.state === IceState.GuardingHostile) {
        ice.state = IceState.Guarding;
      }
    }
    this.sound(SOUND_ID.Move);
    this.enterNode(dest, oppDir(dir));
    this.endTurn();
  }

  wait(): void {
    if (!this.ended) this.endTurn();
  }

  disconnect(): void {
    if (!this.ended) this.dump(DumpCause.Disconnect);
  }

  // -------------------------------------------------------------------------
  // Programy
  // -------------------------------------------------------------------------

  /** OnAttack: výchozí útočný program. */
  attack(): void {
    const p = this.defAttack;
    if (!p) throw new Error("No default attack program specified.");
    this.runProgram(p.id);
  }

  /** OnDeceive, OnAnalyze, OnScan, OnSilence, … – nejlepší nahraný program dané třídy. */
  runBest(cls: ProgramClass, label: string): void {
    const p = findProgram(this.ch, cls);
    if (!p) throw new Error(`No ${label} program loaded.`);
    this.runProgram(p.id);
  }

  /** OnSetDefProgram – bez tahu. */
  setDefaultAttack(progId: number): void {
    const p = this.prog(progId);
    if (p && (p.cls === ProgramClass.Attack || p.cls === ProgramClass.AttackArea || p.cls === ProgramClass.AttackPiercing)) {
      this.ch.defaults.attack = p.id;
    }
  }

  /** OnUnloadProgram – bez tahu. */
  unloadProgram(progId: number): void {
    const p = this.prog(progId);
    if (!p || p.loadedRating === 0) return;
    this.sound(SOUND_ID.UnloadProgram);
    p.loadedRating = 0;
    this.removeProgram(p);
  }

  /** CTransferDlg – programy, které jde nahrát (nejsou plně nahrané). */
  loadablePrograms(): Program[] {
    return this.ch.software.filter((p) => p.loadedRating !== p.rating);
  }

  /** CTransferDlg OnOK + OnLoadProgram */
  loadProgram(progId: number): void {
    if (this.ended) return;
    const p = this.prog(progId);
    if (!p) return;
    const max = loadRatings(this.cfg, this.ch).max;
    if (this.ch.currentLoad + programSize(this.cfg, p.cls, p.rating) > max) throw new Error("This would overload the deck.");
    this.s.transferFileId = null;
    this.s.transferProgramId = p.id;
    this.s.transferInitialTime = this.programLoadTime(p);
    this.s.transferTurnsLeft = 1 + this.s.transferInitialTime;
    this.msg("Transfer started.");
    this.endTurn();
  }

  /** MatrixView DoRemoveProgram */
  removeProgram(p: Program): void {
    const a = this.s.active;
    if (p.id === this.ch.defaults.attack) this.ch.defaults.attack = null;
    else if (p.id === a.armor) a.armor = null;
    else if (p.id === a.shield) a.shield = null;
    else if (p.id === a.hide) a.hide = null;
    else if (p.id === a.scan) a.scan = null;
    else if (p.id === a.reflect) a.reflect = null;
    else if (p.id === a.boost) a.boost = null;
    else if (p.cls === ProgramClass.Client && this.s.clientProgramStatus !== 0) this.s.clientProgramStatus = 0;
    calcCurrentLoad(this.cfg, this.ch);
  }

  /** Program je aktivní (zvýrazněný v seznamu). */
  isActiveProgram(p: Program): boolean {
    const a = this.s.active;
    return p.id === this.ch.defaults.attack || p.id === a.armor || p.id === a.hide || p.id === a.shield ||
      p.id === a.reflect || p.id === a.boost || (p.cls === ProgramClass.Client && this.s.clientProgramStatus !== 0);
  }

  private activate(slot: "shield" | "armor" | "hide" | "reflect" | "boost", p: Program): void {
    if (this.s.active[slot] === p.id) {
      this.msg(`${p.name} already active.`);
      return;
    }
    this.sound(p.sound);
    this.s.active[slot] = p.id;
    this.msg(`${p.name} activated.`, "blue");
  }

  /** MatrixView DoRunProgram */
  runProgram(progId: number): void {
    if (this.ended) return;
    const p = this.prog(progId);
    if (!p || p.loadedRating === 0) return;
    const s = this.s;
    const m = this.m;
    const node = this.node;
    const needsTarget = [
      ProgramClass.Attack, ProgramClass.AttackPiercing, ProgramClass.Virus, ProgramClass.Confuse, ProgramClass.Weaken,
      ProgramClass.Deceive, ProgramClass.Decrypt,
    ];
    if (needsTarget.includes(p.cls) && !this.target) {
      this.msg(`${p.name} cannot run without a target selected.`);
      return;
    }
    switch (p.cls) {
      case ProgramClass.Attack:
      case ProgramClass.AttackPiercing:
      case ProgramClass.Virus:
      case ProgramClass.Confuse:
      case ProgramClass.Weaken:
      case ProgramClass.Deceive:
      case ProgramClass.Decrypt:
      case ProgramClass.AttackArea:
      case ProgramClass.Slow:
        this.programVsIce(p, this.target);
        break;
      case ProgramClass.Relocate:
        if (s.traceIceId === null) {
          this.msg(`${p.name} cannot run without an active trace.`);
          return;
        }
        this.programVsIce(p, this.ice(s.traceIceId));
        break;
      case ProgramClass.Analyze:
        if (!this.target) {
          this.msg(`${p.name} cannot run without a target selected.`);
          return;
        }
        if (this.programVsIce(p, this.target)) this.fx({ kind: "viewIce" });
        break;
      case ProgramClass.Shield:
        this.activate("shield", p);
        break;
      case ProgramClass.Armor:
        this.activate("armor", p);
        break;
      case ProgramClass.Hide:
        this.activate("hide", p);
        break;
      case ProgramClass.Reflect:
        this.activate("reflect", p);
        break;
      case ProgramClass.AttackBoost:
      case ProgramClass.DefenseBoost:
      case ProgramClass.StealthBoost:
      case ProgramClass.AnalysisBoost:
        this.activate("boost", p);
        break;
      case ProgramClass.Silence:
      case ProgramClass.Smoke: {
        const target = m.nodeProgramBase + m.nodeProgramSysMult * this.sys.rating - (this.charRating(CharRating.Stealth) + p.loadedRating);
        const success = this.roll(target);
        if (success >= 0) {
          this.sound(p.sound);
          const turns = m.nodeProgramMinTurns + m.nodeProgramTurnsPerSuccess * success;
          if (p.cls === ProgramClass.Silence) {
            this.msg(`${p.name} program succeeds. Node is silenced.`, "blue");
            node.silenceLevel = turns;
          } else {
            this.msg(`${p.name} program succeeds. Node is smoked.`, "blue");
            node.smokeLevel = turns;
          }
        } else {
          this.msg(`${p.name} program failed.`, "red");
        }
        break;
      }
      case ProgramClass.Decoy: {
        const target = m.decoyBase + m.decoySysMult * this.sys.rating - (this.charRating(CharRating.Stealth) + p.loadedRating);
        let success = this.roll(target);
        if (success > 0) {
          success = Math.min(success, 5);
          this.sound(p.sound);
          this.msg(`${p.name} program succeeds. ${success} duplicates created.`);
          while (s.decoys.length < success) {
            const loc = chooseLocation(this.ctx, this.sys, node, Dir.None, this.presence(node.id));
            if (!loc) break;
            s.decoys.push(loc);
            this.fx({ kind: "decoy" });
          }
        } else {
          this.msg(`${p.name} program failed.`, "blue");
        }
        break;
      }
      case ProgramClass.Medic:
        this.runMedic(p);
        break;
      case ProgramClass.Scan:
        this.runScan(p);
        break;
      case ProgramClass.Evaluate:
        this.startScanEval(p, "Evaluation started.");
        break;
      case ProgramClass.Client:
        this.runClient(p);
        break;
    }
    this.endTurn();
  }

  private runMedic(p: Program): void {
    const m = this.m;
    const max = this.cfg.health.max;
    if (this.ch.health.deck === max) {
      this.msg(`${p.name} failed because you are not damaged.`);
      return;
    }
    const target = m.medicBase + m.medicSysMult * this.sys.rating - (p.loadedRating + this.charRating(CharRating.Defense));
    const success = this.roll(target);
    if (success > 0) {
      this.sound(p.sound);
      this.ch.health.deck = Math.min(max, this.ch.health.deck + m.medicHealPerSuccess * success);
      this.msg(`${p.name} restored your deck to ${idiv(100, max) * this.ch.health.deck}% health.`);
      p.loadedRating--;
    } else if (success === -1) {
      p.loadedRating = 0;
    } else {
      this.msg(`${p.name} failed.`);
    }
    if (p.loadedRating === 0) {
      this.msg(`${p.name} has crashed.`);
      this.removeProgram(p);
    }
  }

  private firstValidFile(cls: ProgramClass): number | null {
    const files = this.node.files;
    for (let i = 0; i < files.length; i++) if (this.validForScan(files[i]!, cls)) return i;
    return null;
  }

  /** DSFile.cpp IsValidForScanEval */
  validForScan(f: DSFile, cls: ProgramClass): boolean {
    const tw = f.tapewormId === null ? null : this.ice(f.tapewormId);
    if (cls === ProgramClass.Scan) {
      return (f.state & FileState.Scanned) === 0 && (f.state & FileState.InNode) !== 0 && (tw === null || tw.bypassed);
    }
    return (f.state & FileState.Scanned) !== 0 && (f.state & FileState.Evaluated) === 0 && (f.state & FileState.InNode) !== 0 &&
      f.type !== FileType.Useless && f.type !== FileType.Quest && tw === null;
  }

  private startScanEval(p: Program, started: string): void {
    const idx = this.firstValidFile(p.cls);
    this.s.scanFileIndex = idx;
    if (idx === null) {
      this.msg(`There are no valid targets for the ${p.name} program in this node.`);
      this.s.active.scan = null;
    } else {
      this.s.active.scan = p.id;
      this.s.scanMP = 0;
      this.sound(p.sound);
      this.msg(started);
    }
  }

  private runScan(p: Program): void {
    const node = this.node;
    const c = this.ch.currentContract!;
    if (node.type === NodeType.DataStore) {
      this.startScanEval(p, "Scan started.");
    } else if (node.type === NodeType.IO) {
      this.sound(p.sound);
      switch (node.subType) {
        case NodeSubtype.IoQuest:
          if (c.type !== ContractType.RunProgram) {
            node.specialImage = SpecialImage.IoQuest;
            this.msg(`This node controls the ${targetObjectText(c.targetObject)} you are searching for.`);
            break;
          }
          this.msg("This node controls unimportant IO.");
          break;
        case NodeSubtype.IoUseless:
          this.msg("This node controls unimportant IO.");
          break;
        case NodeSubtype.IoAlarm:
          this.msg("This node handles system administrator alarm notification.");
          node.specialImage = SpecialImage.IoAlarm;
          break;
        case NodeSubtype.IoIcePort:
          this.msg("This node is the entry point for ICE into the system.");
          node.specialImage = SpecialImage.IoIcePort;
          break;
        case NodeSubtype.IoMatrix:
          this.msg("This node contains a high-speed connection to cyberspace.");
          node.specialImage = SpecialImage.IoMatrix;
          break;
      }
      this.fx({ kind: "map" });
    } else {
      // Originál: větev pro koprocesor je nedosažitelná (testuje NT_IO podruhé)
      this.sound(p.sound);
      this.msg("There is nothing in this node to scan.");
    }
  }

  private runClient(p: Program): void {
    const c = this.ch.currentContract!;
    const node = this.node;
    const inTarget =
      (c.targetObject === TargetObject.NodeCpu && node.type === NodeType.Cpu) ||
      (c.targetObject === TargetObject.NodeIO && node.type === NodeType.IO && node.subType === NodeSubtype.IoQuest) ||
      (c.targetObject === TargetObject.NodeDS && node.type === NodeType.DataStore && node.subType === NodeSubtype.DsQuest);
    if (inTarget) {
      if (this.s.clientProgramStatus !== 0) {
        this.msg("Client program is already running.", "blue");
      } else {
        this.s.clientProgramStatus = this.m.clientProgramBaseTurns + idiv(p.rating, 2);
        this.sound(p.sound);
        this.msg(`Client program activated. ${this.s.clientProgramStatus - 1} rounds until completion.`, "blue");
      }
      return;
    }
    for (const n of this.contractNodes()) {
      if (!n.activated) this.msg(`Target node ${n.name} located`, "blue");
      n.mapped = true;
      if (n.type === NodeType.IO) n.specialImage = SpecialImage.IoQuest;
      else if (n.type === NodeType.DataStore) n.specialImage = SpecialImage.DsQuest;
    }
    this.fx({ kind: "map" });
  }

  /** Cílové nody mise Run Program (System BuildNodeList(…, TRUE) / CPU). */
  private contractNodes(): MNode[] {
    const c = this.ch.currentContract!;
    if (c.targetObject === TargetObject.NodeIO) return this.questNodes(NodeType.IO);
    if (c.targetObject === TargetObject.NodeDS) return this.questNodes(NodeType.DataStore);
    return [this.sys.nodes[this.sys.cpuNodeId]!];
  }

  /** System BuildNodeList(olNodes, type, TRUE) */
  questNodes(type: NodeType): MNode[] {
    const out: MNode[] = [];
    for (const area of this.sys.areas) {
      for (const id of area.nodeIds) {
        const n = this.sys.nodes[id]!;
        if (n.type !== type) continue;
        if (type === NodeType.IO && n.subType === NodeSubtype.IoQuest) out.push(n);
        else if (type === NodeType.DataStore && n.subType === NodeSubtype.DsQuest) out.push(n);
      }
    }
    return out;
  }

  /** MatrixView DoRunProgramVsIce */
  programVsIce(p: Program, maybeIce: Ice | null): boolean {
    const areaEffect = p.cls === ProgramClass.AttackArea || p.cls === ProgramClass.Slow;
    if (!maybeIce && !areaEffect) return false;
    // Plošné programy cíl nepotřebují; `ice` se u nich nepoužije.
    const ice = (maybeIce ?? this.currentIce()[0] ?? null) as Ice;
    const m = this.m;
    const sr = this.sr;
    const attack = () => this.charRating(CharRating.Attack);
    const combatTarget = (i: Ice, progRating = p.loadedRating) =>
      m.attackBase + (sr + this.iceRating(i, IceRating.Combat)) - (attack() + progRating);
    const hit = (target: Ice, success: number, less: boolean) => {
      let dmg = computeDamage(this.cfg, success);
      if (less) dmg = idiv(dmg + 1, 2);
      this.sound(p.sound);
      this.msg(`${p.name} program does ${dmg * 5}% damage to ${target.name}.`);
      this.fx({ kind: "damage", iceId: target.id });
      target.health -= dmg;
      if (target.health <= 0) this.crashIce(target);
    };
    const tapewormDestroy = (i: Ice) => {
      if (i.type === IceType.Tapeworm) i.state = IceState.Destroying;
    };
    const effect = (i: Ice, success: number, key: "slowLevel" | "virusLevel" | "confusionLevel" | "weakenLevel", verb: string) => {
      const turns = success * m.effectTurnsPerSuccess;
      this.sound(p.sound);
      this.msg(`${p.name} program succeeds. ${i.name} is ${verb} for ${turns} turns.`);
      if (turns + 1 > i[key]) i[key] = turns + 1;
    };

    switch (p.cls) {
      case ProgramClass.Attack: {
        let target = combatTarget(ice);
        if (ice.type === IceType.Attack && ice.subType & (AttackSubtype.Hardened | AttackSubtype.Phasing)) target += m.attackArmoredPenalty;
        const success = this.roll(target);
        if (success > 0) hit(ice, success, false);
        else this.msg(`${p.name} program missed.`);
        this.markIceAsHostile();
        tapewormDestroy(ice);
        return true;
      }
      case ProgramClass.AttackArea: {
        for (const i of this.currentIce()) {
          let less = false;
          let target = combatTarget(i);
          if (i.type === IceType.Attack) {
            if (i.subType & AttackSubtype.Hardened) {
              target += m.areaHardenedPenalty;
              less = true;
            } else if ((i.subType & AttackSubtype.Phasing) === 0) {
              target += m.areaNormalPenalty;
            }
          } else {
            target += m.areaNormalPenalty;
          }
          const success = this.roll(target);
          if (success > 0) hit(i, success, less);
          else this.msg(`${p.name} program missed.`);
          tapewormDestroy(i);
        }
        this.markIceAsHostile();
        return true;
      }
      case ProgramClass.AttackPiercing: {
        let less = false;
        let target = combatTarget(ice);
        if (ice.type === IceType.Attack) {
          if (ice.subType & AttackSubtype.Phasing) {
            target += m.piercingPhasingPenalty;
            less = true;
          } else if ((ice.subType & AttackSubtype.Hardened) === 0) {
            target -= m.piercingNormalBonus;
            less = true;
          }
        } else {
          target -= m.piercingNormalBonus;
          less = true;
        }
        const success = this.roll(target);
        if (success > 0) hit(ice, success, less);
        else this.msg(`${p.name} program missed.`);
        tapewormDestroy(ice);
        this.markIceAsHostile();
        return true;
      }
      case ProgramClass.Slow: {
        for (const i of this.currentIce()) {
          const success = this.roll(combatTarget(i));
          if (success > 0) effect(i, success, "slowLevel", "slowed");
          else this.msg(`${i.name} is unaffected by ${p.name}.`);
          tapewormDestroy(i);
        }
        this.markIceAsHostile();
        return true;
      }
      case ProgramClass.Virus: {
        // Originál: první hod počítá s plným ratingem programu (m_nRating)
        const success = this.roll(combatTarget(ice, p.rating));
        if (success > 0) effect(ice, success, "virusLevel", "infected");
        else this.msg(`${p.name} program failed.`);
        if (!(ice.state & IceState.MaskHostile)) {
          const t = m.virusNoticeBase + (sr + this.iceRating(ice, IceRating.Sensors)) - (this.charRating(CharRating.Stealth) + p.loadedRating);
          if (this.roll(t) > 0) {
            this.msg("The virus attack goes unnoticed.");
          } else {
            this.msg("The virus attack is noticed!.");
            tapewormDestroy(ice);
            this.markIceAsHostile();
          }
        }
        return true;
      }
      case ProgramClass.Confuse: {
        const success = this.roll(combatTarget(ice));
        if (success > 0) effect(ice, success, "confusionLevel", "confused");
        else this.msg(`${p.name} program failed.`);
        if (this.s.currentIce.length > 1 || success < 1) {
          tapewormDestroy(ice);
          this.markIceAsHostile();
        }
        return true;
      }
      case ProgramClass.Weaken: {
        const success = this.roll(combatTarget(ice));
        if (success > 0) effect(ice, success, "weakenLevel", "weakened");
        else this.msg(`${p.name} program failed.`);
        tapewormDestroy(ice);
        this.markIceAsHostile();
        return true;
      }
      case ProgramClass.Hide: {
        let t = m.hideBase + (sr + this.iceRating(ice, IceRating.Sensors)) - (this.charRating(CharRating.Stealth) + p.loadedRating);
        if (this.s.decoys.length > 0) t += m.hideDecoyPenalty;
        if (this.roll(t) > 0) {
          this.sound(p.sound);
          return true;
        }
        return false;
      }
      case ProgramClass.Deceive: {
        if (ice.state & IceState.MaskHostile) {
          this.msg(`${ice.name} already knows you are hostile. Program  ${p.name} has no effect.`, "blue");
          return false;
        }
        let t = m.deceiveBase + (sr + this.iceRating(ice, IceRating.Sensors)) - (this.charRating(CharRating.Stealth) + p.loadedRating);
        if (this.sys.passcodeAccessed) t -= m.deceivePasscodeBonus;
        if (this.roll(t) > 0) {
          this.sound(p.sound);
          this.msg(`${p.name} program succeeds. ${ice.name} is deceived.`);
          this.fx({ kind: "bypass", iceId: ice.id });
          ice.bypassed = true;
          if (ice.rating > this.s.highestDeceivedIce) this.s.highestDeceivedIce = ice.rating;
          for (const i of this.currentIce()) if (i.rating <= ice.rating) i.bypassed = true;
          return true;
        }
        this.msg(`${p.name} program failed. ${ice.name} was not deceived.`);
        if (this.hasQueried(ice)) {
          ice.state = IceState.Queried3;
        } else {
          this.setAlert(ice, Alert.Yellow);
          if (this.sys.alert === Alert.Red && ice.type === IceType.Tapeworm) ice.state = IceState.Destroying;
        }
        return false;
      }
      case ProgramClass.Relocate: {
        const t = m.relocateBase + (sr + this.iceRating(ice, IceRating.Combat)) - (this.charRating(CharRating.Stealth) + p.loadedRating);
        if (this.roll(t) > 0) {
          this.sound(p.sound);
          this.msg(`${p.name} program succeeds.`);
          this.clearTrace();
          return true;
        }
        this.msg(`${p.name} program failed.`);
        return false;
      }
      case ProgramClass.Analyze: {
        const t = m.analyzeBase + (sr + this.iceRating(ice, IceRating.Normal)) - (this.charRating(CharRating.Analysis) + p.loadedRating);
        const success = this.roll(t);
        if (success > ice.analyzed) {
          this.sound(p.sound);
          this.msg(`${ice.name} analyzed (${success * 20}%)`);
          ice.analyzed = success;
          return true;
        }
        this.msg(`${p.name} program failed.`);
        return false;
      }
      case ProgramClass.Decrypt: {
        if (ice.type !== IceType.Tapeworm) {
          this.msg(`${p.name} program only works against tapeworms.`);
          return false;
        }
        let t = m.decryptBase + (sr + this.iceRating(ice, IceRating.Normal)) - (this.charRating(CharRating.Analysis) + p.loadedRating);
        if (this.sys.passcodeAccessed) t -= m.decryptPasscodeBonus;
        if (this.roll(t) > 0) {
          this.sound(p.sound);
          this.msg(`${p.name} program succeeds. ${ice.name} decrypted.`);
          this.crashIce(ice);
          return true;
        }
        this.msg(`${p.name} program failed.`);
        const n = m.decryptNoticeBase + (sr + this.iceRating(ice, IceRating.Sensors)) - (this.charRating(CharRating.Stealth) + p.loadedRating);
        if (this.roll(n) <= 0) {
          this.msg(`${ice.name} noticed the decrypt attempt!.`, "red");
          this.markIceAsHostile();
          ice.state = IceState.Destroying;
        }
        return false;
      }
      default:
        return true;
    }
  }

  // -------------------------------------------------------------------------
  // Alarmy, nepřátelství, zničení ICE
  // -------------------------------------------------------------------------

  /** MatrixView.cpp MarkIceAsHostile – všechna ICE v nodu hráče. */
  markIceAsHostile(): void {
    for (const ice of this.currentIce()) {
      ice.bypassed = false;
      if (ice.state === IceState.Destroying) continue;
      if (ice.type === IceType.Gateway || ice.type === IceType.Guardian || ice.type === IceType.Tapeworm) {
        if (ice.nodeId === ice.homeNodeId) {
          ice.state = IceState.GuardingHostile;
        } else {
          ice.state = IceState.MovingHostile;
          ice.targetNodeId = ice.homeNodeId;
        }
      } else {
        ice.state = IceState.Attacking;
      }
    }
  }

  /** System.cpp RouteResponseIC */
  routeResponseIC(nodeId: number): void {
    const node = this.sys.nodes[nodeId]!;
    for (const id of this.sys.iceList) {
      const ice = this.ice(id);
      if (!ice.response || ice.state & IceState.MaskHostile) continue;
      if (this.sys.nodes[ice.nodeId]!.area === node.area) {
        if (ice.nodeId !== nodeId) {
          ice.state = IceState.Moving;
          ice.targetNodeId = nodeId;
        } else {
          ice.state = ice.nodeId === this.s.nodeId ? IceState.Attacking : IceState.Searching;
        }
      } else {
        ice.state = IceState.Searching;
      }
    }
  }

  /** MatrixView DoSetAlert */
  setAlert(ice: Ice | null, level: Alert): void {
    const sys = this.sys;
    if (ice && this.sys.nodes[ice.nodeId]!.silenceLevel) {
      if (ice.nodeId === this.s.nodeId) this.markIceAsHostile();
      return;
    }
    if (sys.alert === Alert.Red) {
      if (ice === null || ice.nodeId === this.s.nodeId) {
        this.routeResponseIC(this.s.nodeId);
        this.markIceAsHostile();
      }
      return;
    }
    if (sys.alert === Alert.Green && level === Alert.Yellow) {
      this.sound(SOUND_ID.YellowAlert);
      sys.alert = Alert.Yellow;
      if (ice) this.msg(`${ice.name} in node ${this.sys.nodes[ice.nodeId]!.name} signals a yellow alert.`, "orange");
    } else {
      this.sound(SOUND_ID.RedAlert);
      sys.alert = Alert.Red;
      this.s.alarmsSet = true;
      if (ice) this.msg(`${ice.name} in node ${this.sys.nodes[ice.nodeId]!.name} signals a red alert!`, "red");
      for (const id of sys.iceList) {
        const i = this.ice(id);
        if (i.state === IceState.Inactive) i.state = IceState.Guarding;
      }
      this.routeResponseIC(ice ? ice.nodeId : this.s.nodeId);
      if (ice === null || ice.nodeId === this.s.nodeId) this.markIceAsHostile();
    }
    if (ice && ice.nodeId === this.s.nodeId) this.fx({ kind: "alert", iceId: ice.id });
  }

  /** MatrixView DoClearTrace */
  clearTrace(): void {
    this.msg("Trace has been cancelled.", "blue");
    this.s.traceIceId = null;
  }

  /** System.cpp SetReactivateTime */
  setReactivateTime(alreadyActive: boolean): void {
    const m = this.m;
    const sys = this.sys;
    sys.iceReactivateTime = m.reactivateBase - (sys.rating >> 2);
    if (!alreadyActive) {
      let scan = sys.alert === Alert.Red ? m.reactivateRedScan - sys.rating : m.reactivateNormalScan - sys.rating;
      scan -= this.rnd(Math.max(1, scan));
      sys.iceReactivateTime += scan;
    }
  }

  /** MatrixView DoCrashIce */
  crashIce(ice: Ice): void {
    const s = this.s;
    if (!this.isActive(ice)) return;
    if (ice.nodeId === s.nodeId) {
      if (ice.type !== IceType.Tapeworm) this.sound(SOUND_ID.ICECrash);
      this.msg(`${ice.name} has crashed!`, "dkblue");
      this.fx({ kind: "crash", iceId: ice.id });
    }
    if (s.targetIceId === ice.id) s.targetIceId = null;
    if (s.traceIceId === ice.id) this.clearTrace();
    s.currentIce = s.currentIce.filter((id) => id !== ice.id);
    this.sys.iceList = this.sys.iceList.filter((id) => id !== ice.id);
    if (ice.type === IceType.Tapeworm) {
      const f = ice.fileId === null ? null : this.findFile(ice.fileId);
      if (f) f.tapewormId = null;
    } else {
      this.sys.deadIce.push(ice.id);
    }
  }

  // -------------------------------------------------------------------------
  // Akce v nodu
  // -------------------------------------------------------------------------

  /** MatrixView AttemptNodeAccess */
  attemptNodeAccess(): boolean {
    let guard: Ice | null = null;
    for (const ice of this.currentIce()) {
      if (ice.type === IceType.Guardian) {
        guard = ice;
        break;
      } else if (ice.state === IceState.Guarding && ice.type === IceType.Attack) {
        if (guard === null || this.iceRating(guard, IceRating.Sensors, false) < this.iceRating(ice, IceRating.Sensors, false)) guard = ice;
      }
    }
    if (guard === null || guard.bypassed) return true;
    const hide = this.activeHide;
    if (hide) {
      if (this.programVsIce(hide, guard)) {
        this.msg(`${guard.name} was successfully bypassed by the ${hide.name} program.`);
        return true;
      }
      this.msg(`${guard.name} was not fooled by ${hide.name} program.`);
      guard.wasAccessed = true;
    } else {
      this.msg(`${guard.name} blocks your access.`);
    }
    return false;
  }

  /**
   * OnGetFile/OnEditFile/OnEraseFile, 1. krok: pokus o přístup. Při neúspěchu uplyne tah.
   * Při úspěchu UI ukáže seznam souborů; zrušení výběru tah nestojí.
   */
  accessFiles(): boolean {
    if (this.ended) return false;
    if (this.attemptNodeAccess()) return true;
    this.endTurn();
    return false;
  }

  /** Soubory viditelné v nodu (FileAccessDlg: jen ty, které v nodu jsou). */
  visibleFiles(): DSFile[] {
    return this.node.files.filter((f) => f.state & FileState.InNode);
  }

  /** CFileAccessDlg OnItemchanged – jde soubor pro operaci vybrat? */
  canFileOp(f: DSFile, op: FileOp): boolean {
    if (f.tapewormId !== null) return false;
    if (op === "get") return (f.state & FileState.InDeck) === 0;
    if (op === "edit") return (f.state & FileState.EditedInNode) === 0;
    return true;
  }

  /** 2. krok: provedení operace se souborem (CFileAccessDlg OnOK) a konec tahu. */
  fileOperation(op: FileOp, fileId: number): void {
    if (this.ended) return;
    const f = this.fileById(this.node, fileId);
    if (!f || !this.canFileOp(f, op)) throw new Error("This file can't be used that way.");
    const s = this.s;
    if (op === "erase") {
      f.state &= ~FileState.InNode;
      this.sound(SOUND_ID.EraseFile);
      this.msg("File erased.");
    } else {
      s.transferProgramId = null;
      s.fileOp = op;
      s.transferFileId = f.id;
      let t = this.loadTime(f.size);
      if (op === "edit") t = idiv(t + this.m.editSpeedDivisor - 1, this.m.editSpeedDivisor);
      s.transferInitialTime = Math.max(1, t);
      s.transferTurnsLeft = 1 + s.transferInitialTime;
      this.sound(op === "edit" ? SOUND_ID.EditFile : SOUND_ID.DownloadFile);
      this.msg("Transfer started.");
    }
    this.endTurn();
  }

  /** Doba přenosu souboru (pro zobrazení). */
  fileTime(f: DSFile): number {
    return this.loadTime(f.size);
  }

  /** OnUseIO */
  useIO(): void {
    if (this.ended) return;
    if (this.attemptNodeAccess()) {
      this.sound(SOUND_ID.UseIO);
      const node = this.node;
      const c = this.ch.currentContract!;
      let questDone = false;
      switch (node.subType) {
        case NodeSubtype.IoAlarm:
          this.msg("External alarms have been deactivated.", "blue");
          this.sys.externalAlarmsDeactivated = true;
          node.activated = true;
          questDone = true;
          break;
        case NodeSubtype.IoIcePort:
          this.msg("Ice port has been closed. No reinforcements will appear.", "blue");
          this.sys.areas[node.area]!.iceIoNodeId = null;
          node.activated = true;
          questDone = true;
          break;
        case NodeSubtype.IoMatrix:
          this.msg("Connection made to deck. High speed I/O now available in this area.", "blue");
          node.activated = true;
          questDone = true;
          break;
        case NodeSubtype.IoQuest:
          if (c.type !== ContractType.RunProgram) {
            const obj = targetObjectText(c.targetObject);
            if (c.type === ContractType.DeactivateIO) this.msg(`You have deactivated the ${obj}.`, "blue");
            else if (c.type === ContractType.ActivateIO) this.msg(`You have activated the ${obj}.`, "blue");
            else this.msg(`You have sabotaged the ${obj}.`, "blue");
            node.activated = true;
            questDone = true;
          }
          break;
      }
      if (!questDone) {
        if (this.rnd(this.m.useIoAlarmChanceDie) === 0) {
          this.msg("You have accidentally triggered an alarm!", "red");
          this.setAlert(null, Alert.Red);
        } else {
          this.msg("Nothing happens!", "blue");
        }
      }
    }
    this.endTurn();
  }

  /** OnCrash */
  crashSystem(): void {
    if (this.ended) return;
    if (this.attemptNodeAccess()) {
      const t = this.m.crashBase + this.sr - this.charRating(CharRating.Attack);
      if (this.roll(t) > 0) {
        this.sound(SOUND_ID.CrashSystem);
        this.dump(DumpCause.SysCrash);
        return;
      }
      this.msg("System crash failed. You have triggered an alert.", "red");
      this.setAlert(null, Alert.Red);
    }
    this.endTurn();
  }

  /** OnGetMap */
  getMap(): void {
    if (this.ended) return;
    if (this.attemptNodeAccess()) {
      this.sound(SOUND_ID.GetMap);
      for (const id of this.sys.areas[this.node.area]!.nodeIds) {
        const n = this.sys.nodes[id]!;
        n.mapped = true;
        if (n.type === NodeType.IO) {
          if (n.subType === NodeSubtype.IoAlarm) n.specialImage = SpecialImage.IoAlarm;
          else if (n.subType === NodeSubtype.IoIcePort) n.specialImage = SpecialImage.IoIcePort;
          else if (n.subType === NodeSubtype.IoMatrix) n.specialImage = SpecialImage.IoMatrix;
        } else if (n.type === NodeType.Cop && n.subType === NodeSubtype.CopSecurity) {
          n.specialImage = SpecialImage.CopSecurity;
        }
      }
      this.fx({ kind: "map" });
      this.msg("Area map aquired.");
    }
    this.endTurn();
  }

  /** OnBackdoor */
  createBackdoor(): void {
    if (this.ended) return;
    if (this.attemptNodeAccess()) {
      const t = this.m.backdoorBase + this.sr - this.charRating(CharRating.Analysis);
      const success = this.roll(t);
      if (success > 0) {
        this.sound(SOUND_ID.CreateBackdoor);
        this.msg("Backdoor successfully created.", "blue");
        this.sys.backdoor = true;
        this.ch.backdoor[this.ch.currentContract!.corporation] = success;
      } else {
        this.msg("Backdoor creation failed.");
        if (success === -1) {
          this.msg("Oops! You have triggered an alert.", "red");
          this.setAlert(null, Alert.Red);
        }
      }
    }
    this.endTurn();
  }

  private securityAction(base: number, onSuccess: () => void, failText: string): void {
    if (this.attemptNodeAccess()) {
      const success = this.roll(base + this.sr - this.charRating(CharRating.Attack));
      if (success > 0) onSuccess();
      else {
        this.msg(failText);
        if (success === -1) {
          this.msg("Oops! You have triggered an alert.", "red");
          this.setAlert(null, Alert.Red);
        }
      }
    }
    this.endTurn();
  }

  /** OnKillAlarm */
  killAlarm(): void {
    if (this.ended) return;
    if (this.sys.alert === Alert.Green) {
      this.msg("There is no alert to cancel.");
      return;
    }
    this.securityAction(this.m.killAlarmBase, () => {
      this.sound(SOUND_ID.CancelAlert);
      this.msg("Alert cancelled.", "blue");
      if (this.sys.alert === Alert.Red) {
        for (const id of this.sys.iceList) {
          const ice = this.ice(id);
          if (ice.type === IceType.Attack || ice.type === IceType.Trace) {
            ice.state = IceState.Moving;
            ice.targetNodeId = ice.homeNodeId;
          } else if (ice.type === IceType.Probe) {
            ice.state = IceState.Searching;
          } else {
            ice.state &= ~IceState.MaskHostile;
          }
        }
        this.sys.alert = Alert.Yellow;
      } else {
        this.sys.alert = Alert.Green;
      }
    }, "Failed to cancel alert.");
  }

  /** OnKillShutDown */
  killShutdown(): void {
    if (this.ended) return;
    this.securityAction(this.m.killShutdownBase, () => {
      this.sound(SOUND_ID.CancelShutdown);
      this.msg("System shutdown halted.", "blue");
      this.sys.turnsUntilCrash = 0;
    }, "Failed to cancel shutdown.");
  }

  /** OnKillTrace */
  killTrace(): void {
    if (this.ended) return;
    this.securityAction(this.m.killTraceBase, () => {
      this.sound(SOUND_ID.CancelTrace);
      this.msg("Trace has been removed.", "blue");
      this.s.traced = false;
    }, "Failed to remove trace.");
  }

  /** OnEnterPortal: Portal In → Portal Out vnitřní oblasti, Portal Out → Portal In vnější oblasti. */
  enterPortal(): void {
    if (this.ended) return;
    if (this.attemptNodeAccess()) {
      this.sound(SOUND_ID.EnterPortal);
      const node = this.node;
      const ai = node.area;
      const area = this.sys.areas[ai]!;
      if (node.id === area.portalInId) {
        this.enterNode(this.sys.areas[ai - 1]!.portalOutId, Dir.Center);
      } else {
        const next = this.sys.areas[ai + 1];
        if (next?.portalInId !== null && next?.portalInId !== undefined) this.enterNode(next.portalInId, Dir.Center);
      }
    }
    this.endTurn();
  }

  // -------------------------------------------------------------------------
  // Konec tahu hráče (DoEndPlayerTurn)
  // -------------------------------------------------------------------------

  endTurn(): void {
    if (this.ended) return;
    const s = this.s;
    const ch = this.ch;
    const m = this.m;

    // Přenosy
    if (s.transferProgramId !== null) {
      s.transferTurnsLeft--;
      if (s.transferTurnsLeft === 0) {
        const p = this.prog(s.transferProgramId);
        if (p) {
          this.msg(`Program ${p.name} has finished loading.`, "blue");
          p.loadedRating = p.rating;
          calcCurrentLoad(this.cfg, ch);
          this.sound(SOUND_ID.ProgramLoaded);
        }
        s.transferProgramId = null;
      }
    } else if (s.transferFileId !== null) {
      s.transferTurnsLeft--;
      if (s.transferTurnsLeft === 0) {
        const f = this.fileById(this.node, s.transferFileId);
        if (f) {
          if (s.fileOp === "edit") {
            this.sound(SOUND_ID.EditComplete);
            f.state |= FileState.EditedInNode;
            this.msg(`File ${f.name} has been edited.`, "blue");
          } else {
            this.sound(SOUND_ID.DownloadComplete);
            f.state |= FileState.InDeck;
            if (f.state & FileState.EditedInNode) f.state |= FileState.EditedInDeck;
            this.msg(`File ${f.name} has been downloaded.`, "blue");
          }
        }
        s.transferFileId = null;
      }
    }

    // Scan / Evaluate
    this.scanStep();

    // Klientský program
    if (s.clientProgramStatus !== 0) {
      s.clientProgramStatus--;
      if (s.clientProgramStatus === 0) {
        this.msg("Client program has completed execution.", "blue");
        this.node.activated = true;
      }
    }

    // Trace
    if (s.traceIceId !== null) {
      s.traceTurnsLeft--;
      if (s.traceTurnsLeft === 0) {
        const tr = this.ice(s.traceIceId);
        if (s.traceType === TraceSubtype.Normal) {
          this.msg(`${tr.name} has completed its trace. All ice will now be hostile.`, "red");
          s.traced = true;
          s.traceIceId = null;
          this.markIceAsHostile();
        } else if (s.traceType === TraceSubtype.Dump) {
          this.dump(DumpCause.Trace);
          return;
        } else {
          this.dump(DumpCause.TraceFry);
          return;
        }
      }
    }

    // Tahy ICE – seřazení podle senzorů (originál řadí VZESTUPNĚ, ICE s dotazem jde první)
    const sorted: number[] = [];
    for (const id of this.sys.iceList) {
      const ice = this.ice(id);
      if (this.hasQueried(ice)) {
        sorted.unshift(id);
        continue;
      }
      const v = this.iceRating(ice, IceRating.Sensors, false);
      let pos = -1;
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (v >= this.iceRating(this.ice(sorted[i]!), IceRating.Sensors, false)) {
          pos = i;
          break;
        }
      }
      sorted.splice(pos + 1, 0, id);
    }
    this.sys.iceList = sorted;
    for (const id of [...sorted]) {
      const ice = this.ice(id);
      if (!this.isActive(ice)) continue; // zničené během tahu jiného ICE
      if (this.iceAction(ice)) return;
      ice.wasAccessed = false;
    }

    // Poškození
    const max = this.cfg.health.max;
    ch.health.mental -= s.damageMental;
    if (ch.health.mental < 1) {
      ch.health.physical += ch.health.mental;
      this.dump(ch.health.physical < 1 ? DumpCause.Death : DumpCause.Unconscious);
      return;
    }
    ch.health.deck -= s.damageDeck;
    if (ch.health.deck < 1) {
      ch.health.physical += ch.health.deck;
      this.dump(ch.health.physical < 1 ? DumpCause.Death : DumpCause.DeckDamage);
      return;
    }
    s.damageMental = 0;
    s.damageDeck = 0;

    // Silence a Smoke v nodech
    for (const area of this.sys.areas) {
      for (const id of area.nodeIds) {
        const n = this.sys.nodes[id]!;
        if (n.silenceLevel) {
          n.silenceLevel--;
          if (n.silenceLevel === 0) this.msg(`Node ${n.name} is no longer silenced.`, "orange");
        }
        if (n.smokeLevel) {
          n.smokeLevel--;
          if (n.smokeLevel === 0) this.msg(`Node ${n.name} is no longer smoked.`, "orange");
        }
      }
    }

    // Boost
    const boost = this.activeBoost;
    if (boost) {
      boost.loadedRating--;
      if (boost.loadedRating === 0) {
        this.msg(`Your boost program ${boost.name} has expired.`, "red");
        this.removeProgram(boost);
      }
    }

    // Vypnutí systému
    const sys = this.sys;
    if (sys.alert === Alert.Red && sys.turnsUntilCrash === 0 && !sys.externalAlarmsDeactivated) {
      if (this.rnd(m.shutdownChanceDie) < sys.rating) {
        this.sound(SOUND_ID.Shutdown);
        sys.turnsUntilCrash = idiv(sys.rating + 3, 4) * m.shutdownTurnsPerArea;
        this.msg(`System shutdown commencing. System will be offline in ${sys.turnsUntilCrash} seconds.`, "red");
      }
    } else if (sys.turnsUntilCrash) {
      sys.turnsUntilCrash--;
      if (sys.turnsUntilCrash === 30) this.msg("30 seconds until system shutdown.", "red");
      else if (sys.turnsUntilCrash === 10) this.msg("10 seconds until system shutdown.", "red");
      else if (sys.turnsUntilCrash === 0) {
        this.dump(DumpCause.SysOffline);
        return;
      }
    }

    // Obnova ICE
    if (sys.deadIce.length) {
      if (sys.iceReactivateTime === 0) {
        this.setReactivateTime(false);
      } else {
        sys.iceReactivateTime--;
        if (sys.iceReactivateTime === 0) {
          while (sys.deadIce.length) {
            const ice = this.ice(sys.deadIce.shift()!);
            const port = sys.areas[sys.nodes[ice.homeNodeId]!.area]!.iceIoNodeId;
            if (port !== null) {
              ice.health = max;
              ice.bypassed = false;
              ice.slowLevel = 0;
              ice.skippedLastTurn = false;
              ice.confusionLevel = 0;
              ice.weakenLevel = 0;
              ice.virusLevel = 0;
              ice.nodeId = port;
              ice.state = ice.type === IceType.Probe || ice.response ? IceState.Searching : IceState.Moving;
              ice.wasAccessed = false;
              ice.targetNodeId = ice.homeNodeId;
              sys.iceList.push(ice.id);
              this.iceMove(ice, Dir.None);
              break;
            }
            // ICE port oblasti je zavřený – toto ICE se už neobnoví
          }
          if (sys.deadIce.length) this.setReactivateTime(true);
        }
      }
    }

    s.runTime++;
  }

  private scanStep(): void {
    const s = this.s;
    const scan = this.activeScan;
    if (!scan || s.scanFileIndex === null) {
      if (scan) s.active.scan = null;
      return;
    }
    const files = this.node.files;
    const original = s.scanFileIndex;
    s.scanMP += this.m.scanMpPerRating * scan.loadedRating;
    let idx: number | null = s.scanFileIndex;
    let file = files[idx]!;
    // Najít další platný soubor (s návratem na začátek)
    const advance = (): boolean => {
      while (!this.validForScan(file, scan.cls)) {
        idx = (idx! + 1) % files.length;
        if (idx === original) {
          idx = null;
          return false;
        }
        file = files[idx]!;
      }
      return true;
    };
    const finish = () => {
      this.sound(scan.cls === ProgramClass.Scan ? SOUND_ID.ScanComplete : SOUND_ID.EvalComplete);
      this.msg(`${scan.name} has completed.`, "blue");
      s.active.scan = null;
      s.scanFileIndex = null;
    };
    if (!advance()) {
      finish();
      return;
    }
    s.scanFileIndex = idx;
    if (file.size <= s.scanMP) {
      if (scan.cls === ProgramClass.Scan) {
        file.state |= FileState.Scanned;
        this.msg(`File ${file.name} has been scanned. (${FILE_SCAN_STRINGS[file.type]})`);
        if (file.type === FileType.Quest) {
          this.node.specialImage = SpecialImage.DsQuest;
          this.fx({ kind: "map" });
        }
      } else {
        file.state |= FileState.Evaluated;
        let text = "";
        if (file.type === FileType.Valuable) text = `File ${file.name} has been evaluated. (${file.value})`;
        else if (file.type === FileType.Clue) {
          this.markContractNodes();
          text = `File ${file.name} has been evaluated. <Clue>`;
        } else if (file.type === FileType.Passcode) {
          this.sys.passcodeAccessed = true;
          this.msg("Passcode file accessed!", "blue");
          text = `File ${file.name} has been evaluated. <Passcode>`;
        } else if (file.type === FileType.Program) {
          text = `File ${file.name} has been evaluated. <${softwareText(file.contents, file.value)}>`;
        } else if (file.type === FileType.ProgramSource) {
          text = `File ${file.name} has been evaluated. <${softwareText(file.contents, file.value)} Source>`;
        } else if (file.type === FileType.ChipSource) {
          text = `File ${file.name} has been evaluated. <${CHIP_NAMES[file.contents]} ${file.value} Source>`;
        }
        this.msg(text);
      }
      if (!advance()) {
        finish();
        return;
      }
      s.scanFileIndex = idx;
      s.scanMP -= file.size;
    }
  }

  /** System.cpp MarkContractNodes (soubor s nápovědou). */
  markContractNodes(): void {
    const c = this.ch.currentContract!;
    const dsMission = c.type <= ContractType.Edit || (c.type === ContractType.RunProgram && c.targetObject === TargetObject.NodeDS);
    const ioMission = (c.type >= ContractType.DeactivateIO && c.type <= ContractType.SabotageIO) ||
      (c.type === ContractType.RunProgram && c.targetObject === TargetObject.NodeIO);
    for (const n of this.sys.nodes) {
      if (dsMission && n.type === NodeType.DataStore && n.subType === NodeSubtype.DsQuest) {
        n.mapped = true;
        n.specialImage = SpecialImage.DsQuest;
        this.msg(`Contract Node: Area ${this.sys.areas[n.area]!.number} Node ${n.name}`, "blue");
      } else if (ioMission && n.type === NodeType.IO && n.subType === NodeSubtype.IoQuest) {
        n.mapped = true;
        n.specialImage = SpecialImage.IoQuest;
        this.msg(`Contract Node: Area ${this.sys.areas[n.area]!.number} Node ${n.name}`, "blue");
      }
    }
    this.fx({ kind: "map" });
  }

  // -------------------------------------------------------------------------
  // ICE (Ice.cpp)
  // -------------------------------------------------------------------------

  /** CIce::DoAction – vrací true, když run skončil. */
  iceAction(ice: Ice): boolean {
    const s = this.s;
    const m = this.m;
    if (ice.nodeId !== s.nodeId) ice.bypassed = false;

    if (ice.slowLevel) {
      ice.slowLevel--;
      if (ice.slowLevel === 0) {
        this.msg(`${ice.name} is no longer slowed`);
      } else if (ice.skippedLastTurn) {
        ice.skippedLastTurn = false;
      } else {
        ice.skippedLastTurn = true;
        return false;
      }
    }
    if (ice.virusLevel > 0) {
      ice.virusLevel--;
      if (ice.virusLevel === 0) {
        this.msg(`${ice.name} is no longer infected`);
      } else {
        ice.health--;
        if (ice.health === 0) {
          this.crashIce(ice);
          return false;
        }
      }
    }
    if (ice.confusionLevel > 0) {
      ice.confusionLevel--;
      if (ice.confusionLevel === 0) this.msg(`${ice.name} is no longer confused`);
    }
    if (ice.weakenLevel > 0) {
      ice.weakenLevel--;
      if (ice.weakenLevel === 0) this.msg(`${ice.name} is no longer weakened`);
    }

    // Zmatené ICE dělá náhodnou akci
    if (ice.confusionLevel > 0) {
      if (s.traceIceId === ice.id && this.rnd(m.confusedCancelTraceChanceDie) === 0) {
        s.traceIceId = null;
        this.msg(`${ice.name} cancels its trace!`, "blue");
      }
      const roll = this.rnd(m.confusedActionDie);
      const black = ice.type === IceType.Attack || ice.type === IceType.Trace || ice.type === IceType.Probe;
      let fallTo = roll;
      if (fallTo === 0) {
        const success = this.roll(m.confusedSelfDamageTarget);
        if (success > 0) {
          const dmg = computeDamage(this.cfg, success);
          this.msg(`${ice.name} does ${dmg * 5}% damage to itself`, "blue");
          ice.health -= dmg;
          if (ice.health < 1) this.crashIce(ice);
        }
        return false;
      }
      if (fallTo === 1) {
        if (black && s.nodeId === ice.nodeId) {
          ice.state = IceState.Attacking;
          fallTo = -1; // pokračuje stavovým automatem níže
        } else {
          this.setAlert(ice, Alert.Red);
          fallTo = 2;
        }
      }
      if (fallTo === 2) {
        if (ice.type === IceType.Attack) {
          const others = this.sys.iceList.filter((id) => id !== ice.id && this.ice(id).nodeId === ice.nodeId).map((id) => this.ice(id));
          if (others.length) {
            const victim = others[this.rnd(others.length)]!;
            const t = m.iceVsIceBase - this.iceRating(ice, IceRating.Combat, false) + this.iceRating(victim, IceRating.Combat, false);
            const success = this.roll(t);
            if (success > 0) {
              const dmg = computeDamage(this.cfg, success);
              this.msg(`${ice.name} attacks ${victim.name} for ${dmg * 5}% damage!`, "blue");
              victim.health -= dmg;
              if (victim.health < 1) this.crashIce(victim);
            } else {
              this.msg(`${ice.name} attacks ${victim.name} but missed.`);
            }
            return false;
          }
        }
        fallTo = 3;
      }
      if (fallTo === 3) {
        if (black && (roll === 3 || this.rnd(2) === 0)) this.iceWander(ice);
        return false;
      }
      if (fallTo === 4) return false;
    }

    for (let guard = 0; guard < 10; guard++) {
      switch (ice.state) {
        case IceState.Following:
          if (ice.nodeId === s.nodeId) {
            if (!this.iceQuery(ice)) {
              ice.state = IceState.Searching;
              this.iceWander(ice);
              return false;
            }
          } else {
            if (this.sys.nodes[ice.nodeId]!.smokeLevel === 0) {
              const d = this.sys.nodes[ice.nodeId]!.adj.indexOf(s.nodeId);
              if (d >= 0) {
                this.iceMove(ice, d);
                return false;
              }
            }
            ice.state = IceState.Searching;
            this.iceWander(ice);
          }
          return false;

        case IceState.MovingHostile:
        case IceState.Moving: {
          if (ice.state === IceState.MovingHostile) this.setAlert(ice, Alert.Red);
          const isBlack = ice.type === IceType.Attack || ice.type === IceType.Trace;
          if (isBlack && this.sys.alert !== Alert.Red && ice.state !== IceState.MovingHostile) {
            // černé ICE vracející se domů mimo červený alarm hráče ignoruje
          } else if (ice.nodeId === s.nodeId && !ice.bypassed &&
            (ice.type === IceType.Attack || ice.type === IceType.Probe || ice.type === IceType.Trace)) {
            if (this.noticedPlayer(ice) && this.iceQuery(ice)) return false;
          }
          if (ice.nodeId === ice.targetNodeId) {
            if (isBlack && this.sys.alert !== Alert.Red) ice.state = IceState.Inactive;
            else if (ice.response) this.iceWander(ice);
            else if (ice.state & IceState.MaskHostile && ice.nodeId === s.nodeId) ice.state = IceState.GuardingHostile;
            else ice.state = IceState.Guarding;
          } else if (ice.targetNodeId !== null) {
            const target = this.sys.nodes[ice.targetNodeId]!;
            const dist = pathDistances(this.sys, target.area, target.id);
            let best = 1000, bestDir = -1;
            const here = this.sys.nodes[ice.nodeId]!;
            for (let d = 0; d < 4; d++) {
              const a = here.adj[d];
              if (a !== null && a !== undefined && (dist.get(a) ?? 255) < best) {
                best = dist.get(a) ?? 255;
                bestDir = d;
              }
            }
            ice.state = IceState.Moving;
            if (bestDir >= 0) this.iceMove(ice, bestDir);
          }
          return false;
        }

        case IceState.Searching:
          if (ice.nodeId === s.nodeId && !ice.bypassed) {
            if (this.noticedPlayer(ice) && this.iceQuery(ice)) return false;
          }
          this.iceWander(ice);
          return false;

        case IceState.Queried1:
        case IceState.Queried2:
        case IceState.Queried3: {
          const mobile = ice.type === IceType.Probe || ice.type === IceType.Attack || ice.type === IceType.Trace;
          if (!ice.bypassed) {
            if (ice.state === IceState.Queried3 || s.nodeId !== ice.nodeId) {
              this.setAlert(ice, Alert.Yellow);
            } else {
              ice.state++;
              return false;
            }
            if (this.sys.alert === Alert.Yellow && this.sys.nodes[ice.nodeId]!.silenceLevel === 0) {
              if (ice.nodeId !== s.nodeId) {
                ice.state = mobile ? IceState.Following : IceState.Guarding;
              } else {
                this.iceQuery(ice);
                if (ice.state !== IceState.Queried1 && !(ice.state & IceState.MaskHostile)) {
                  ice.state = mobile ? IceState.Following : IceState.Guarding;
                }
                return false;
              }
            } else if (ice.nodeId !== s.nodeId) {
              ice.state = mobile ? IceState.Attacking : IceState.Guarding;
            } else {
              this.markIceAsHostile();
              if (ice.type === IceType.Tapeworm) ice.state = IceState.Destroying;
            }
            continue;
          }
          if (ice.type === IceType.Gateway || ice.type === IceType.Guardian || ice.type === IceType.Tapeworm) {
            ice.state = IceState.Guarding;
          } else if (ice.type === IceType.Probe || ice.response) {
            ice.state = IceState.Searching;
            this.iceWander(ice);
          } else {
            ice.state = IceState.Moving;
            ice.targetNodeId = ice.homeNodeId;
            continue;
          }
          return false;
        }

        case IceState.Destroying: {
          this.setAlert(ice, Alert.Red);
          const file = ice.fileId === null ? null : this.findFile(ice.fileId);
          if (file) file.state &= ~FileState.InNode;
          if (ice.subType === TapewormSubtype.DataBomb && ice.nodeId === s.nodeId) {
            const t = m.dataBombBase - (this.sr + this.iceRating(ice, IceRating.Combat)) + this.charRating(CharRating.Defense) +
              (this.activeArmor?.loadedRating ?? 0);
            const success = this.roll(t);
            if (success > 0) {
              let dmg = computeDamage(this.cfg, success);
              this.msg(`${ice.name} explodes for ${dmg * 5}% damage.`);
              this.fx({ kind: "damage", iceId: ice.id });
              this.fx({ kind: "playerHit" });
              dmg = this.absorbByShield(dmg);
              if (dmg > 0) s.damageDeck += dmg;
            } else {
              this.msg(`${ice.name} exploded.`);
            }
          }
          this.sound(SOUND_ID.FileDestroyed);
          this.msg(`${ice.name} destroys file ${file?.name ?? "?"}.`, "orange");
          this.crashIce(ice);
          return false;
        }

        case IceState.Attacking:
          this.setAlert(ice, Alert.Red);
          if (ice.nodeId !== s.nodeId) {
            const here = this.sys.nodes[ice.nodeId]!;
            if (here.smokeLevel === 0) {
              const d = here.adj.indexOf(s.nodeId);
              if (d >= 0) {
                this.iceMove(ice, d);
                return false;
              }
            }
            if (ice.type === IceType.Probe || ice.response) {
              ice.state = IceState.Searching;
              this.iceWander(ice);
              return false;
            }
            ice.state = IceState.Moving;
            ice.targetNodeId = ice.homeNodeId;
            continue;
          }
          if (ice.type === IceType.Attack) this.iceAttack(ice);
          else if (ice.type === IceType.Trace) this.iceTrace(ice);
          return false;

        case IceState.Guarding:
          if (ice.type === IceType.Attack || ice.type === IceType.Trace) {
            if (ice.nodeId === s.nodeId && !ice.bypassed && this.noticedPlayer(ice)) this.iceQuery(ice);
          } else if (ice.wasAccessed) {
            this.iceQuery(ice);
          }
          return false;

        case IceState.GuardingHostile:
          this.setAlert(ice, Alert.Red);
          return false;

        default:
          return false;
      }
    }
    return false;
  }

  /** Štít pohltí poškození (stejný kód v útoku ICE a data bomb). Vrací zbytek. */
  private absorbByShield(dmg: number): number {
    const shield = this.activeShield;
    if (!shield) return dmg;
    if (shield.loadedRating > dmg) {
      shield.loadedRating -= dmg;
      return 0;
    }
    const rest = dmg - shield.loadedRating;
    shield.loadedRating = 0;
    this.msg(`Your shield program ${shield.name} has crashed.`, "red");
    this.removeProgram(shield);
    return rest;
  }

  /** Útok černého ICE (CIce::DoAction, STATE_ATTACKING, ICE_ATTACK) */
  private iceAttack(ice: Ice): void {
    const s = this.s;
    const m = this.m;
    const ch = this.ch;
    let t = m.iceAttackBase - (this.sr + this.iceRating(ice, IceRating.Combat)) + this.charRating(CharRating.Defense) +
      (this.activeArmor?.loadedRating ?? 0);
    const killer = (ice.subType & AttackSubtype.Killer) !== 0;
    if (killer) t += ch.hardware[HardwareType.NeuralDamper]!;
    const success = this.roll(t);
    if (success <= 0) {
      this.msg(`${ice.name} program missed.`);
      return;
    }
    this.sound(SOUND_ID.Attacked);
    if (s.decoys.length > 0 && this.rnd(s.decoys.length + 1) !== 0) {
      this.msg(`${ice.name} hits a decoy and destroys it.`);
      s.decoys.pop();
      return;
    }
    let dmg = computeDamage(this.cfg, success);
    this.msg(`${ice.name} hits for ${dmg * 5}% damage.`);
    const reflect = this.activeReflect;
    if (reflect) {
      const rt = m.iceAttackBase - (this.sr + this.iceRating(ice, IceRating.Combat)) +
        (this.charRating(CharRating.Defense) + reflect.loadedRating);
      const rs = this.roll(rt);
      if (rs === -1) {
        reflect.loadedRating = 0;
        this.msg(`Your reflect program ${reflect.name} has crashed.`, "red");
        this.removeProgram(reflect);
      } else {
        const reflected = idiv(dmg * rs, m.reflectDivisor);
        if (reflected > 0) {
          this.msg(`${reflected * 5}% damage has been reflected.`, "red");
          this.fx({ kind: "damage", iceId: ice.id });
          ice.health -= reflected;
          if (ice.health <= 0) this.crashIce(ice);
          dmg -= reflected;
          if (dmg === 0) return;
        }
      }
    }
    this.fx({ kind: "playerHit" });
    dmg = this.absorbByShield(dmg);
    if (dmg <= 0) return;
    if (killer) s.damageMental += dmg;
    else s.damageDeck += dmg;
    if (ice.subType & AttackSubtype.Crash && this.rnd(m.crashProgramChanceDie) < dmg) {
      const loaded = ch.software.filter((p) => p.loadedRating > 0);
      if (loaded.length) {
        const p = loaded[this.rnd(loaded.length)]!;
        this.msg(`${ice.name} has crashed your ${p.name} program!`, "red");
        p.loadedRating = 0;
        this.removeProgram(p);
      }
    }
  }

  /** Trace ICE (CIce::DoAction, STATE_ATTACKING, ICE_TRACE) */
  private iceTrace(ice: Ice): void {
    const s = this.s;
    const m = this.m;
    if (s.traceIceId !== null) return;
    if (ice.subType === TraceSubtype.Normal && s.traced) return;
    let t = m.iceAttackBase - (this.sr + this.iceRating(ice, IceRating.Combat)) + this.charRating(CharRating.Defense) +
      (this.activeArmor?.loadedRating ?? 0);
    for (const other of this.currentIce()) if (other.id !== ice.id && other.type === IceType.Trace) t--;
    const success = this.roll(t);
    if (success <= 0) return;
    s.traceIceId = ice.id;
    s.traceInitialTime = m.traceTimeBase - m.traceTimePerSuccess * success;
    s.traceTurnsLeft = s.traceInitialTime;
    s.traceType = s.traced ? (ice.subType as TraceSubtype) : TraceSubtype.Normal;
    this.sound(SOUND_ID.TraceStart);
    this.msg(`${ice.name} has started a trace! Trace will complete in ${s.traceInitialTime} turns.`, "red");
  }

  /** CIce::DoQuery – true = dotázal se nebo čeká na jiný dotaz, false = obejito. */
  iceQuery(ice: Ice): boolean {
    const s = this.s;
    if (ice.bypassed) return false;
    if (ice.rating <= s.highestDeceivedIce) {
      ice.bypassed = true;
      return false;
    }
    const list = this.sys.iceList;
    const me = list.indexOf(ice.id);
    for (let i = 0; i < me; i++) {
      if (this.hasQueried(this.ice(list[i]!))) return true;
    }
    if (s.decoys.length > 0) {
      this.setAlert(ice, Alert.Red);
      return true;
    }
    this.sound(SOUND_ID.Queried);
    this.msg(`${ice.name} has queried you.`, "red");
    this.fx({ kind: "query", iceId: ice.id });
    ice.state = IceState.Queried1;
    for (let i = me + 1; i < list.length; i++) {
      const other = this.ice(list[i]!);
      if (!this.hasQueried(other)) continue;
      if (other.type === IceType.Gateway || other.type === IceType.Guardian || other.type === IceType.Tapeworm) {
        // Chyba 1.12: nastavuje stav sobě (m_nState) místo jemu
        if (this.m.fixQueryStateBug) other.state = IceState.Guarding;
        else ice.state = IceState.Guarding;
      } else {
        other.state = IceState.Following;
      }
    }
    return true;
  }

  /** CIce::DoMove */
  iceMove(ice: Ice, dir: number): void {
    const s = this.s;
    if (dir !== Dir.None && dir !== Dir.Center) {
      const next = this.sys.nodes[ice.nodeId]!.adj[dir];
      if (next === null || next === undefined) return;
      if (ice.nodeId === s.nodeId) {
        s.currentIce = s.currentIce.filter((id) => id !== ice.id);
        if (s.currentIce.length === 0) s.highestDeceivedIce = 0;
        this.sound(SOUND_ID.ICELeaveNode);
        this.msg(`${ice.name} has left the node.`);
        this.fx({ kind: "leave", iceId: ice.id });
        if (s.targetIceId === ice.id) s.targetIceId = null;
      }
      ice.nodeId = next;
    }
    ice.lastDir = dir;
    const node = this.sys.nodes[ice.nodeId]!;
    let loc: { x: number; y: number } | null;
    if (ice.nodeId === ice.homeNodeId) {
      loc = chooseLocation(this.ctx, this.sys, node, ice.type === IceType.Gateway ? ice.subType : Dir.Center, this.presence(node.id));
    } else if (dir === Dir.None || dir === Dir.Center) {
      loc = chooseLocation(this.ctx, this.sys, node, dir, this.presence(node.id));
    } else {
      loc = chooseLocation(this.ctx, this.sys, node, oppDir(dir), this.presence(node.id));
    }
    if (loc) {
      ice.x = loc.x;
      ice.y = loc.y;
    }
    if (ice.nodeId === s.nodeId) {
      this.sound(SOUND_ID.ICEEnterNode);
      this.msg(`${ice.name} has entered the node.`);
      s.currentIce.push(ice.id);
      this.fx({ kind: "enter", iceId: ice.id });
      if (ice.state & IceState.MaskHostile || s.traced) {
        this.markIceAsHostile();
      } else {
        const hostile = this.currentIce().some((i) => i.state & IceState.MaskHostile);
        if (hostile) {
          ice.state = ice.type === IceType.Probe || ice.type === IceType.Attack || ice.type === IceType.Trace
            ? IceState.Attacking : IceState.MovingHostile;
        } else if (s.highestDeceivedIce >= ice.rating) {
          ice.bypassed = true;
        }
      }
    }
  }

  /** CIce::NoticedPlayer */
  noticedPlayer(ice: Ice): boolean {
    const hide = this.activeHide;
    if (hide && this.programVsIce(hide, ice)) {
      this.msg(`${ice.name} fails to notice you.`);
      return false;
    }
    return true;
  }

  /** CIce::DoWander */
  iceWander(ice: Ice): void {
    const node = this.sys.nodes[ice.nodeId]!;
    const open: number[] = [];
    for (let d = 0; d < 4; d++) {
      if (ice.lastDir === oppDir(d)) continue;
      if (node.adj[d] !== null) open.push(d);
    }
    if (open.length === 0) this.iceMove(ice, oppDir(ice.lastDir));
    else this.iceMove(ice, open[this.rnd(open.length)]!);
  }

  // -------------------------------------------------------------------------
  // Konec runu (DoDumpDecker, GetContractStatus)
  // -------------------------------------------------------------------------

  /** Contract.cpp GetContractStatus */
  contractStatus(inProgress: boolean, crashed: boolean): ContractStatus {
    const c = this.ch.currentContract!;
    const lines: string[] = [];
    let failed = false, incomplete = false;
    const questFiles = this.sys.nodes.flatMap((n) => n.files.filter((f) => f.type === FileType.Quest));
    const known = (f: DSFile) => (f.state & FileState.Scanned ? f.name : "???");
    const notYet = (f: DSFile, what: string) => {
      incomplete = true;
      if (inProgress) lines.push(`(I) File ${known(f)} has not been ${what}.`);
      else lines.push(`(I) File ${f.name} was not ${what}.`);
    };
    const download = (f: DSFile, okText: string) => {
      if (f.state & FileState.InDeck) {
        if (f.state & FileState.EditedInDeck) {
          failed = true;
          lines.push(`(F) File ${f.name} was edited before download, making it useless.`);
        } else lines.push(okText);
      } else notYet(f, "downloaded");
    };
    const ioNodes = (verb: string) => {
      for (const n of this.questNodes(NodeType.IO)) {
        if (n.activated) lines.push(`(C) IO node ${n.name} was ${verb}`);
        else {
          incomplete = true;
          if (inProgress) lines.push(`(I) IO node ${n.specialImage === -1 ? "???" : n.name} has not been ${verb}`);
          else lines.push(`(I) IO node ${n.name} was not ${verb}`);
        }
      }
    };
    switch (c.type) {
      case ContractType.Steal:
        for (const f of questFiles) download(f, `(C) File ${f.name} was downloaded.`);
        break;
      case ContractType.StealErase:
        for (const f of questFiles) {
          download(f, `(C) File ${f.name} was successfully downloaded.`);
          if (f.state & FileState.InNode) notYet(f, "erased");
          else lines.push(`(C) Mission file ${f.name} was erased.`);
        }
        break;
      case ContractType.Erase:
        for (const f of questFiles) {
          if (f.state & FileState.InNode) notYet(f, "erased");
          else lines.push(`(C) Mission file ${f.name} was erased.`);
        }
        break;
      case ContractType.Edit:
        for (const f of questFiles) {
          if (f.state & FileState.InNode) {
            if (f.state & FileState.EditedInNode) lines.push(`(C) File ${f.name} was edited.`);
            else notYet(f, "edited");
          } else {
            failed = true;
            lines.push(`(F)File ${f.name} was erased.`);
          }
        }
        break;
      case ContractType.DeactivateIO:
        ioNodes("deactivated");
        break;
      case ContractType.ActivateIO:
        ioNodes("activated");
        break;
      case ContractType.SabotageIO:
        ioNodes("sabotaged");
        break;
      case ContractType.CrashSystem:
        if (crashed) lines.push("(C) System was crashed.");
        else {
          incomplete = true;
          lines.push(inProgress ? "(I) System has not been crashed." : "(I) System was not crashed.");
        }
        break;
      case ContractType.Backdoor:
        if (this.sys.backdoor) lines.push("(C) Backdoor was created.");
        else {
          incomplete = true;
          lines.push(inProgress ? "(I) Backdoor has not been created." : "(I) Backdoor was not created.");
        }
        break;
      case ContractType.RunProgram:
        for (const n of this.contractNodes()) {
          if (n.activated) lines.push(`(C) Program was successfully run in node ${n.name}`);
          else {
            incomplete = true;
            if (inProgress) lines.push(`(I) Program has not been run in node ${n.specialImage === -1 ? "???" : n.name}`);
            else lines.push(`(I) Program was not run in node ${n.name}`);
          }
        }
        break;
    }
    if (c.flags & ContractFlag.NoAlarms) {
      if (this.s.alarmsSet) {
        failed = true;
        lines.push("(F) A red alert was triggered.");
      } else {
        lines.push(inProgress ? "(C) No red alerts have been detected." : "(C) No red alerts were detected.");
      }
    }
    if (c.flags & ContractFlag.Timed) {
      if (this.s.runTime <= c.timeLimit * 60) {
        lines.push(inProgress ? "(I) Time limit has not expired." : "(C) Time limit did not expire.");
      } else {
        failed = true;
        lines.push("(F) Time limit expired.");
      }
    }
    if (!inProgress && !failed && incomplete) {
      if (c.daysLeft === 1) {
        failed = true;
        lines.push("Mission was not completed before deadline.");
      } else {
        lines.push(`You have ${c.daysLeft - 1} days left before deadline.`);
      }
    }
    if (failed) return { code: -1, overall: "Failed", lines };
    if (incomplete) return { code: 0, overall: "Incomplete", lines };
    return { code: 1, overall: "Complete", lines };
  }

  /** MatrixView DoDumpDecker – konec runu, vyhodnocení a odměny. */
  dump(cause: DumpCause): void {
    if (this.ended) return;
    const ch = this.ch;
    const cfg = this.cfg;
    const rr = cfg.runResult;
    const s = this.s;
    const sys = this.sys;
    const messages: string[] = [];
    let trace = false;
    const traceIce = s.traceIceId === null ? null : this.ice(s.traceIceId);
    const sounds: Record<DumpCause, number> = {
      [DumpCause.DeckDamage]: SOUND_ID.DumpDeckDamage,
      [DumpCause.Unconscious]: SOUND_ID.DumpUnconscious,
      [DumpCause.Death]: SOUND_ID.DumpDeath,
      [DumpCause.Trace]: SOUND_ID.DumpTrace,
      [DumpCause.TraceFry]: SOUND_ID.DumpTrace,
      [DumpCause.SysCrash]: SOUND_ID.DumpSysCrash,
      [DumpCause.SysOffline]: SOUND_ID.DumpSysOffline,
      [DumpCause.Disconnect]: SOUND_ID.DumpDisconnect,
    };
    const contractText = contractTypeText(ch.currentContract!);
    switch (cause) {
      case DumpCause.DeckDamage:
      case DumpCause.Unconscious:
        messages.push(cause === DumpCause.DeckDamage ? "You have been dumped!" : "You have fallen unconscious, and been dumped!");
        if (traceIce && traceIce.subType !== TraceSubtype.Normal && s.traced) trace = true;
        break;
      case DumpCause.Death:
        if (ch.hardware[HardwareType.BioMonitor]! >= 2) {
          messages.push("You have been save by your BioMonitor's AutoDump.");
          ch.health.physical = 1;
        } else {
          this.sound(sounds[cause]);
          s.end = {
            cause, messages: ["You have died!\n(Does anyone smell grey matter burning?)"], death: true, contract: contractText,
            status: null, pay: 0, fileValue: 0, total: 0, skillPoints: 0, repText: "", loot: [], timeEvents: [], gameOver: true,
          };
          ch.onRun = false;
          return;
        }
        break;
      case DumpCause.Trace:
        messages.push("An extended trace has completed and you have been dumped as a result.");
        trace = true;
        break;
      case DumpCause.TraceFry: {
        const chip = this.rnd(NUM_CHIPS) as ChipType;
        let success = 0;
        if (ch.chips[chip] !== 0 && traceIce) {
          const t = rr.fryBase - this.iceRating(traceIce, IceRating.Combat, false) + (ch.chips[chip]! + ch.hardware[HardwareType.SurgeSuppressor]!);
          success = this.roll(t);
        }
        if (success < 1) {
          messages.push("An extended trace has completed and you have been dumped as a result.");
        } else {
          success = Math.min(success, ch.chips[chip]!);
          messages.push(`An extended trace has completed and you have been dumped as a result. In addition, your ${CHIP_NAMES[chip]} chip has been fried. The rating has been reduced by ${success}.`);
          ch.chips[chip]! -= success;
        }
        trace = true;
        break;
      }
      case DumpCause.SysCrash:
        messages.push("You have crashed the system.");
        break;
      case DumpCause.SysOffline:
        messages.push("The system has been taken offline due to an intruder alert.");
        break;
      case DumpCause.Disconnect:
        messages.push("You have disconnected from the matrix.");
        break;
    }
    this.sound(sounds[cause]);

    if (trace) {
      if (ch.hardware[HardwareType.AntiTraceProxy]) {
        messages.push("An extended trace was completed against you. Your AntiTrace Proxy has destroyed itself to defeat the trace.");
        ch.hardware[HardwareType.AntiTraceProxy] = 0;
      } else if (this.rnd(rr.policeChanceDie) <= idiv(sys.corporation, rr.policeCorpDivisor)) {
        messages.push("The police have been sent to arrest you. You are forced to abandon your home to avoid capture. Your lifestyle has dropped to poverty.");
        ch.lifestyle = 0;
        ch.contracts = [];
        generateContractsFor(this.ctx, ch);
      }
    }

    const status = this.contractStatus(false, cause === DumpCause.SysCrash);
    // Stažené soubory → kredity, programy, zdrojáky
    let fileValue = 0;
    const loot: string[] = [];
    for (const area of sys.areas) {
      for (const id of area.nodeIds) {
        for (const f of sys.nodes[id]!.files) {
          if (!(f.state & FileState.InDeck) || f.state & FileState.EditedInDeck) continue;
          if (f.type === FileType.Valuable) fileValue += f.value;
          else if (f.type === FileType.Program) {
            ch.software.push(createProgram(ch, f.contents, f.value));
            loot.push(softwareText(f.contents, f.value));
          } else if (f.type === FileType.ProgramSource) {
            ch.sources.push({ id: ch.nextId++, type: ItemType.Software, cls: f.contents, rating: f.value });
            loot.push(`${softwareText(f.contents, f.value)} source code`);
          } else if (f.type === FileType.ChipSource) {
            ch.sources.push({ id: ch.nextId++, type: ItemType.Chip, cls: f.contents, rating: f.value });
            loot.push(`${CHIP_NAMES[f.contents]} ${f.value} source code`);
          }
        }
      }
    }

    const c = ch.currentContract!;
    let pay = 0, skillPoints = 0, repChange = 0;
    const loseRep = (pts: number) => {
      ch.repPoints = Math.max(0, ch.repPoints - pts);
      if (ch.repLevel > 0 && ch.repPoints < repPointsForNextLevel(cfg, ch.repLevel - 1)) {
        ch.repLevel--;
        repChange = -1;
      }
    };
    if (status.code === -1) {
      loseRep(c.difficulty);
    } else if (status.code === 0) {
      loseRep(idiv(c.difficulty, rr.incompleteRepDivisor));
    } else {
      pay = c.pay;
      const gap = effectiveLevel(ch) - c.difficulty;
      const pct = gap <= 0 ? 100 : rr.skillPointPercentByLevelGap[Math.min(gap, rr.skillPointPercentByLevelGap.length - 1)]!;
      skillPoints = c.difficulty;
      // Originál: 75 % = x − x/4, 50 % = x/2, 25 % = x/4 (celočíselně)
      if (pct === 75) skillPoints -= skillPoints >> 2;
      else if (pct === 50) skillPoints >>= 1;
      else if (pct === 25) skillPoints >>= 2;
      else if (pct === 0) skillPoints = 0;
      else if (pct !== 100) skillPoints = idiv(skillPoints * pct, 100);
      ch.repPoints += c.difficulty;
      const next = repPointsForNextLevel(cfg, ch.repLevel);
      if (ch.repPoints >= next) {
        if (ch.repLevel < (ch.lifestyle + 1) * cfg.reputation.capPerLifestyle) {
          ch.repLevel++;
          repChange = 1;
        } else {
          ch.repPoints = next - 1;
          repChange = 2;
        }
      }
    }
    const lvl = REP_LEVEL_NAMES[ch.repLevel];
    const repText = repChange === 0 ? "No change" : repChange === 1 ? `Raised to ${lvl}` : repChange === 2 ? `Capped at ${lvl}` : `Falls to ${lvl}`;
    const total = fileValue + pay;
    ch.skillPoints += skillPoints;
    ch.credits += total;

    const per5 = idiv(sys.rating + 4, 5);
    if (sys.alert === Alert.Yellow) ch.systemAlerts[sys.corporation] = per5 * rr.yellowAlertDaysPerFive + 1;
    else if (sys.alert === Alert.Red) ch.systemAlerts[sys.corporation] = per5 * rr.redAlertDaysPerFive + 1;
    else ch.systemAlerts[sys.corporation] = 0;

    if (status.code !== 0) clearCurrentContract(cfg, ch);
    ch.onRun = false;
    calcCurrentLoad(cfg, ch);

    const t = passTime(this.ctx, ch, rr.daysAfterRun);
    if (!t.gameOver && status.code === 1) ch.contracts.push(generateContract(this.ctx, ch));

    s.end = {
      cause, messages, death: false, contract: contractText, status, pay, fileValue, total, skillPoints, repText, loot,
      timeEvents: t.events, gameOver: t.gameOver,
    };
  }
}

/** Speciální obrázky nodů na mapě (Node.h NSI_*). */
export const SpecialImage = {
  DsQuest: 0,
  IoQuest: 1,
  IoAlarm: 2,
  IoIcePort: 3,
  IoMatrix: 4,
  CopSecurity: 5,
} as const;

function generateContractsFor(ctx: Ctx, ch: Character): void {
  // Character::GenerateContracts – import až za běhu kvůli kruhové závislosti
  const k = ctx.cfg.contracts;
  const max = k.countBase + idiv(ch.repLevel, k.countRepDivisor);
  let count = 1 + ctx.rng.random(max);
  if (count + ch.contracts.length > max) count = max - ch.contracts.length;
  while (count-- > 0) ch.contracts.push(generateContract(ctx, ch));
}
