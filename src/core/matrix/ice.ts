// ICE – data, názvy, efektivní ratingy. Originál: Ice.cpp (bez chování v Matrixu, to je fáze 5).
// Kuchařka: docs/pravidla/09-ice.md

import type { RulesConfig } from "../config";
import { Alert, AttackSubtype, Dir, IceRating, IceType, IceState, MAX_WHITE, TapewormSubtype, TraceSubtype } from "../constants";
import type { Ctx } from "../context";
import { ICE_NAMES, type IceNameEntry } from "../data/iceNames";
import {
  ICE_ATTACK_TYPE_NAMES, ICE_KILLER_TYPE_NAMES, ICE_TAPEWORM_TYPE_NAMES, ICE_TRACE_TYPE_NAMES, ICE_TYPE_NAMES,
} from "../data/texts";
import { conditionModifier } from "../dice";
import { hex } from "../util";
import type { Ice, MatrixSystem } from "./types";

/** Nové ICE s výchozími hodnotami (CIce::CIce). Přidá se do system.ice. */
export function createIce(cfg: RulesConfig, sys: MatrixSystem, type: IceType, homeNodeId: number): Ice {
  const ice: Ice = {
    id: sys.ice.length,
    name: "",
    type,
    subType: 0,
    rating: 1,
    image: 0,
    response: false,
    homeNodeId,
    fileId: null,
    health: cfg.health.max,
    slowLevel: 0,
    skippedLastTurn: false,
    confusionLevel: 0,
    weakenLevel: 0,
    virusLevel: 0,
    analyzed: 0,
    nodeId: homeNodeId,
    x: 0,
    y: 0,
    state: IceState.Inactive,
    bypassed: false,
    wasAccessed: false,
    targetNodeId: null,
    lastDir: Dir.None,
  };
  return ice;
}

function attackOptionIndex(subType: number): number {
  if (subType & AttackSubtype.Hardened) return 1;
  if (subType & AttackSubtype.Phasing) return 2;
  if (subType & AttackSubtype.Crash) return 3;
  return 0;
}

/**
 * Tabulka názvů pro ICE a posun indexu (pokročilé typy začínají na vyšších ratingech).
 * Ice.cpp LoadInitData.
 */
function nameTable(ice: Ice): { table: readonly IceNameEntry[]; offset: number } {
  switch (ice.type) {
    case IceType.Gateway:
      return { table: ICE_NAMES.gateway, offset: 0 };
    case IceType.Probe:
      return { table: ICE_NAMES.probe, offset: 0 };
    case IceType.Guardian:
      return { table: ICE_NAMES.guardian, offset: 0 };
    case IceType.Tapeworm:
      return ice.subType === TapewormSubtype.DataBomb
        ? { table: ICE_NAMES.dataBomb, offset: 10 }
        : { table: ICE_NAMES.tapeworm, offset: 0 };
    case IceType.Trace:
      if (ice.subType === TraceSubtype.Dump) return { table: ICE_NAMES.traceDump, offset: 5 };
      if (ice.subType === TraceSubtype.Fry) return { table: ICE_NAMES.traceFry, offset: 10 };
      return { table: ICE_NAMES.trace, offset: 0 };
    case IceType.Attack: {
      const killer = (ice.subType & AttackSubtype.Killer) !== 0;
      const opt = attackOptionIndex(ice.subType);
      if (killer) {
        const t = [ICE_NAMES.attackLethal, ICE_NAMES.attackLethalHardened, ICE_NAMES.attackLethalPhasing, ICE_NAMES.attackLethalCrash][opt]!;
        return { table: t, offset: 10 };
      }
      if (opt === 0) return { table: ICE_NAMES.attack, offset: 0 };
      const t = [ICE_NAMES.attackHardened, ICE_NAMES.attackPhasing, ICE_NAMES.attackCrash][opt - 1]!;
      return { table: t, offset: 5 };
    }
  }
}

/** Ice.cpp LoadInitData: název (s náhodným hex číslem) a obrázek podle typu a ratingu. */
export function loadIceInitData(ctx: Ctx, ice: Ice): void {
  const index = ice.rating >= 20 ? 19 : ice.rating - 1;
  const { table, offset } = nameTable(ice);
  // Originál by pro nízký rating sáhl mimo tabulku; generátor to nedovolí, tady jen pojistka.
  const entry = table[Math.max(0, Math.min(table.length - 1, index - offset))]!;
  ice.name = `${entry.name} ${hex(ctx.rng.random(0x10000), 4)}`;
  ice.image = entry.image;
}

/**
 * Ice.cpp GetTypeString: typ ICE (podrobný jen po analýze).
 * Oprava: originál pro Attack (Crash) četl mimo tabulku názvů.
 */
export function iceTypeName(ice: Ice): string {
  if (ice.analyzed) {
    if (ice.type === IceType.Attack) {
      const i = attackOptionIndex(ice.subType);
      return ice.subType & AttackSubtype.Killer ? ICE_KILLER_TYPE_NAMES[i]! : ICE_ATTACK_TYPE_NAMES[i]!;
    }
    if (ice.type === IceType.Trace) return ICE_TRACE_TYPE_NAMES[ice.subType]!;
    if (ice.type === IceType.Tapeworm) return ICE_TAPEWORM_TYPE_NAMES[ice.subType]!;
  }
  return ICE_TYPE_NAMES[ice.type]!;
}

/** Ice.cpp GetNotes */
export function iceNotes(ice: Ice): string {
  switch (ice.type) {
    case IceType.Gateway:
      return "Bars passageway to another node.";
    case IceType.Probe:
      return "Searches for intruders in the system.";
    case IceType.Guardian:
      return "Guards access to the node.";
    case IceType.Tapeworm: {
      let s = "Guards a file. Will self-destruct on illegal access, taking the file with it.";
      if (ice.analyzed && ice.subType === TapewormSubtype.DataBomb) s += " Will attack on self destruct.";
      return s;
    }
    case IceType.Attack: {
      if (!ice.analyzed) return "Attacks intruders.";
      let s = ice.subType & AttackSubtype.Killer ? "Attacks intruders lethally." : "Attacks intruders normally.";
      if (ice.subType & AttackSubtype.Hardened) s += " Resistant to non-piercing attacks.";
      else if (ice.subType & AttackSubtype.Phasing) s += " Resistant to non-area attacks.";
      else if (ice.subType & AttackSubtype.Crash) s += " Can crash programs on succesful hits.";
      return s;
    }
    case IceType.Trace: {
      let s = "Attempts to trace an intruder's signal in the system.";
      if (ice.analyzed) {
        if (ice.subType === TraceSubtype.Dump) s += " Can attempt an extended trace in order to dump the decker.";
        else if (ice.subType === TraceSubtype.Fry) {
          s += " Can attempt an extended trace in order to dump the decker and attempt to fry a chip.";
        }
      }
      return s;
    }
  }
}

/** Ice.cpp GetEffectiveRating */
export function iceEffectiveRating(
  cfg: RulesConfig, alert: Alert, ice: Ice, type: IceRating, includeAnalyze = true,
): number {
  let r = ice.rating + conditionModifier(cfg, ice.health);
  if (ice.weakenLevel > 0) r -= cfg.ice.weakenPenalty;
  if (includeAnalyze) r -= ice.analyzed;
  const white = ice.type <= MAX_WHITE;
  if (type === IceRating.Combat && white) r -= cfg.ice.whiteCombatPenalty;
  else if (type === IceRating.Sensors && white && alert !== Alert.Green) r += cfg.ice.whiteAlertSensorBonus;
  return r;
}

export function isBlackIce(ice: Ice): boolean {
  return ice.type > MAX_WHITE;
}
