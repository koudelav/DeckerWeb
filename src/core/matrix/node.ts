// Nody – rozmístění uvnitř nodu, názvy, hledání cest. Originál: Node.cpp, Area.cpp.

import { Dir, NodeType, oppDir } from "../constants";
import type { Ctx } from "../context";
import { NODE_ABBREV, NODE_GRIDS } from "../data/texts";
import { hex } from "../util";
import type { MatrixSystem, MNode } from "./types";

/** Poloha hráče a návnad – obsazená místa v jeho nodu. */
export interface PlayerPresence {
  nodeId: number;
  x: number;
  y: number;
  decoys: { x: number; y: number }[];
}

/** Node.cpp IsEmptyLocation */
export function isEmptyLocation(sys: MatrixSystem, node: MNode, x: number, y: number, player?: PlayerPresence): boolean {
  if (player && player.nodeId === node.id) {
    if (player.x === x && player.y === y) return false;
    if (player.decoys.some((d) => d.x === x && d.y === y)) return false;
  }
  for (const id of sys.iceList) {
    const i = sys.ice[id]!;
    if (i.nodeId === node.id && i.x === x && i.y === y) return false;
  }
  return true;
}

function freeCell(sys: MatrixSystem, node: MNode, x: number, y: number, player?: PlayerPresence): boolean {
  return NODE_GRIDS[node.type]![y]![x] === 0 && isEmptyLocation(sys, node, x, y, player);
}

/** Node.cpp ChooseClosestLocation: cílové místo, jinak náhodně v rostoucím okolí. */
export function chooseClosestLocation(
  ctx: Ctx, sys: MatrixSystem, node: MNode, x: number, y: number, player?: PlayerPresence,
): { x: number; y: number } | null {
  if (freeCell(sys, node, x, y, player)) return { x, y };
  let minX = x, maxX = x, minY = y, maxY = y;
  while (minX !== 0 || maxX !== 8 || minY !== 0 || maxY !== 8) {
    if (minX !== 0) minX--;
    if (maxX !== 8) maxX++;
    if (minY !== 0) minY--;
    if (maxY !== 8) maxY++;
    const rx = 1 + maxX - minX, ry = 1 + maxY - minY;
    for (let tries = 0; tries < 100; tries++) {
      const px = ctx.rng.random(rx) + minX;
      const py = ctx.rng.random(ry) + minY;
      if (freeCell(sys, node, px, py, player)) return { x: px, y: py };
    }
  }
  return null;
}

/** Node.cpp ChooseAnyLocation (originál losuje jen 0..7, krajní řada 8 se nepoužije). */
export function chooseAnyLocation(ctx: Ctx, sys: MatrixSystem, node: MNode, player?: PlayerPresence): { x: number; y: number } | null {
  for (let tries = 0; tries < 100; tries++) {
    const x = ctx.rng.random(8), y = ctx.rng.random(8);
    if (freeCell(sys, node, x, y, player)) return { x, y };
  }
  return null;
}

/** Souřadnice vstupu z daného směru (střed hrany), střed nodu pro Dir.Center. */
export const ENTRY_POINT: Record<number, { x: number; y: number }> = {
  [Dir.North]: { x: 4, y: 0 },
  [Dir.East]: { x: 8, y: 4 },
  [Dir.South]: { x: 4, y: 8 },
  [Dir.West]: { x: 0, y: 4 },
  [Dir.Center]: { x: 4, y: 4 },
};

/** Node.cpp ChooseLocation: místo u vstupu ze směru, uprostřed, nebo kdekoli (Dir.None). */
export function chooseLocation(
  ctx: Ctx, sys: MatrixSystem, node: MNode, dir: Dir, player?: PlayerPresence,
): { x: number; y: number } | null {
  const p = ENTRY_POINT[dir];
  if (!p) return chooseAnyLocation(ctx, sys, node, player);
  return chooseClosestLocation(ctx, sys, node, p.x, p.y, player);
}

/** Node.cpp GenerateName: "DS-10012" = typ, oblast (hex), cluster (hex), číslo (3× hex). */
export function nodeName(type: NodeType, area: number, cluster: number, number: number): string {
  return `${NODE_ABBREV[type]}-${hex(area & 0xf, 1)}${hex(cluster & 0xf, 1)}${hex(number & 0xfff, 3)}`;
}

/**
 * Area.cpp CalculatePathsToNode + Node.cpp MarkPaths: vzdálenost (počet kroků) každého nodu
 * oblasti k cílovému nodu. Nedosažitelné = 255.
 */
export function pathDistances(sys: MatrixSystem, areaIndex: number, targetId: number): Map<number, number> {
  const dist = new Map<number, number>();
  for (const id of sys.areas[areaIndex]!.nodeIds) dist.set(id, 255);
  dist.set(targetId, 0);
  const mark = (id: number, from: number) => {
    const node = sys.nodes[id]!;
    dist.set(id, dist.get(node.adj[from]!)! + 1);
    for (let d = 0; d < 4; d++) {
      if (d === from) continue;
      const n = node.adj[d];
      if (n === null || n === undefined || !dist.has(n)) continue;
      if (dist.get(n)! > dist.get(id)! + 1) mark(n, oppDir(d));
    }
  };
  const target = sys.nodes[targetId]!;
  for (let d = 0; d < 4; d++) {
    const n = target.adj[d];
    if (n !== null && n !== undefined && dist.has(n)) mark(n, oppDir(d));
  }
  return dist;
}
