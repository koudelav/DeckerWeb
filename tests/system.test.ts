import { describe, expect, it } from "vitest";
import {
  Alert, ContractType, DIR_COORD, FileType, IceType, NodeSubtype, NodeType, TargetObject, oppDir,
} from "../src/core/constants";
import { generateContract } from "../src/core/contract";
import { NODE_GRIDS } from "../src/core/data/texts";
import { generateSystem } from "../src/core/matrix/generate";
import { pathDistances } from "../src/core/matrix/node";
import type { MatrixSystem } from "../src/core/matrix/types";
import type { Contract } from "../src/core/state";
import { makeCtx, newChar } from "./helpers";

function contractFor(seed: number, size: number, type?: ContractType): { sys: MatrixSystem; c: Contract } {
  const ctx = makeCtx(seed);
  const ch = newChar(ctx);
  ch.repLevel = Math.min(size, 20);
  ch.lifestyle = 4;
  let c: Contract;
  do c = generateContract(ctx, ch);
  while (type !== undefined && c.type !== type);
  c.systemSize = size;
  c.corporation = (size - 1) * 5;
  return { sys: generateSystem(ctx, c, { alert: false }), c };
}

function checkInvariants(sys: MatrixSystem, c: Contract) {
  expect(sys.areas).toHaveLength(Math.floor((c.systemSize + 3) / 4));
  expect(sys.nodes[sys.cpuNodeId]!.type).toBe(NodeType.Cpu);
  expect(sys.nodes[sys.portalOutNodeId]!.type).toBe(NodeType.PortalOut);
  sys.areas.forEach((area, ai) => {
    const nodes = area.nodeIds.map((id) => sys.nodes[id]!);
    // Každý node má jedinečnou pozici v mřížce oblasti
    const pos = new Set(nodes.map((n) => `${n.x},${n.y}`));
    expect(pos.size).toBe(nodes.length);
    for (const n of nodes) {
      expect(n.area).toBe(ai);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThan(area.sizeX);
      expect(n.y).toBeLessThan(area.sizeY);
      expect(n.name).not.toBe("");
      for (let d = 0; d < 4; d++) {
        const a = n.adj[d];
        if (a === null || a === undefined) continue;
        const o = sys.nodes[a]!;
        // Symetrické spojení se sousedem na sousední pozici
        expect(o.adj[oppDir(d)]).toBe(n.id);
        expect(o.x).toBe(n.x + DIR_COORD[d]!.x);
        expect(o.y).toBe(n.y + DIR_COORD[d]!.y);
        expect(o.area).toBe(ai);
      }
    }
    // Všechny nody oblasti jsou dosažitelné ze SPU
    const dist = pathDistances(sys, ai, area.spuId);
    for (const n of nodes) expect(dist.get(n.id)).toBeLessThan(255);
    expect(sys.nodes[area.portalOutId]!.type).toBe(NodeType.PortalOut);
    if (ai > 0) expect(sys.nodes[area.portalInId!]!.type).toBe(NodeType.PortalIn);
    expect(sys.nodes[area.iceIoNodeId]!.subType).toBe(NodeSubtype.IoIcePort);
    expect(nodes.some((n) => n.type === NodeType.Cop && n.subType === NodeSubtype.CopSecurity)).toBe(true);
  });
  expect(sys.areas[0]!.nodeIds.some((id) => sys.nodes[id]!.type === NodeType.IO && sys.nodes[id]!.subType === NodeSubtype.IoAlarm)).toBe(true);
  // ICE: platné pozice, nepřekrývají se (kromě gateway na vstupech), jen v nodech
  for (const ice of sys.ice) {
    const node = sys.nodes[ice.nodeId]!;
    expect(ice.homeNodeId).toBe(ice.nodeId);
    expect(ice.name).toMatch(/ [0-9A-F]{4}$/);
    if (ice.type !== IceType.Gateway) expect(NODE_GRIDS[node.type]![ice.y]![ice.x]).toBe(0);
    if (ice.type === IceType.Tapeworm) {
      expect(node.files.find((f) => f.id === ice.fileId)!.tapewormId).toBe(ice.id);
    }
  }
  sys.nodes.forEach((node) => {
    const here = sys.ice.filter((i) => i.nodeId === node.id);
    const spots = new Set(here.map((i) => `${i.x},${i.y}`));
    expect(spots.size).toBe(here.length);
    const main = here.filter((i) => i.type !== IceType.Gateway && i.type !== IceType.Tapeworm);
    expect(main.length).toBeLessThanOrEqual(2); // chyba 1.12: nikdy 3
    if (node.type === NodeType.Junction) expect(main).toHaveLength(0);
    if (node.type === NodeType.DataStore) expect(node.files.length).toBeGreaterThanOrEqual(5);
  });
}

describe("generování systému", () => {
  it("invarianty pro všechny velikosti 1..20", () => {
    for (let size = 1; size <= 20; size++) {
      for (let seed = 1; seed <= 15; seed++) {
        const { sys, c } = contractFor(seed * 100 + size, size);
        checkInvariants(sys, c);
      }
    }
  });
  it("cíle kontraktu jsou v systému", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const steal = contractFor(seed, 8, ContractType.Steal);
      const quest = steal.sys.nodes.flatMap((n) => n.files).filter((f) => f.type === FileType.Quest);
      expect(quest).toHaveLength(steal.c.numTargets);
      expect(quest.every((f) => f.contents === steal.c.targetObject)).toBe(true);

      const io = contractFor(seed, 8, ContractType.ActivateIO);
      const ioNodes = io.sys.nodes.filter((n) => n.type === NodeType.IO && n.subType === NodeSubtype.IoQuest);
      expect(ioNodes.length).toBeGreaterThanOrEqual(1);
      expect(ioNodes.length).toBeLessThanOrEqual(io.c.numTargets);
      checkInvariants(io.sys, io.c);
    }
  });
  it("Run Program na CPU nic neoznačuje, jinak označí cílové nody", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { sys, c } = contractFor(seed, 6, ContractType.RunProgram);
      const marked = sys.nodes.filter((n) => (n.type === NodeType.IO || n.type === NodeType.DataStore) && n.subType === 1);
      if (c.targetObject === TargetObject.NodeCpu) expect(marked).toHaveLength(0);
      else expect(marked.length).toBeGreaterThanOrEqual(1);
    }
  });
  it("stejný seed = stejný systém", () => {
    expect(contractFor(4242, 12).sys).toEqual(contractFor(4242, 12).sys);
  });
  it("pohotovost korporace = žlutý alarm", () => {
    const ctx = makeCtx(5);
    const ch = newChar(ctx);
    expect(generateSystem(ctx, ch.contracts[0]!, { alert: true }).alert).toBe(Alert.Yellow);
  });
  it("oprava chyby třetího ICE jde zapnout v konfiguraci", () => {
    let maxMain = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const ctx = makeCtx(seed, { iceGeneration: { fixThirdIceBug: true } });
      const ch = newChar(ctx);
      const c = { ...ch.contracts[0]!, systemSize: 10, corporation: 45 };
      const sys = generateSystem(ctx, c, { alert: false });
      for (const n of sys.nodes) {
        maxMain = Math.max(maxMain, sys.ice.filter((i) => i.nodeId === n.id && i.type !== IceType.Gateway && i.type !== IceType.Tapeworm).length);
      }
    }
    expect(maxMain).toBe(3);
  });
});
