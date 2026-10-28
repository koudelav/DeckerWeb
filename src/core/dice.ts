// Kostky, úspěch, poškození, zdraví, reputace, kalendář. Originál: Global.cpp.
// Kuchařka: docs/pravidla/01-kostky-a-uspech.md

import type { RulesConfig } from "./config";
import type { Ctx } from "./context";
import { DAYS_PER_MONTH } from "./data/texts";
import { idiv } from "./util";

/** Výsledek hodu: −1 kritické selhání, 0 selhání, 1..maxSuccess stupeň úspěchu. */
export type Success = number;

/**
 * Global.cpp DoDieRoll: hod k20 proti cílovému číslu.
 * Hod 1 je vždy kritické selhání; cíl nad 20 se ořízne na 20, takže hod 20 vždy uspěje.
 */
export function doDieRoll(ctx: Ctx, targetNumber: number): Success {
  return successFromRoll(ctx.cfg, 1 + ctx.rng.random(ctx.cfg.dice.sides), targetNumber);
}

/** Vyhodnocení konkrétního hodu (bez náhody) – použito i v testech a v kuchařce. */
export function successFromRoll(cfg: RulesConfig, roll: number, targetNumber: number): Success {
  const d = cfg.dice;
  const target = Math.min(targetNumber, d.maxTarget);
  if (roll === d.criticalFailure) return -1;
  const diff = roll - target;
  if (diff < 0) return 0;
  return Math.min(idiv(diff + d.successOffset, d.successStep), d.maxSuccess);
}

/** Global.cpp ComputeDamage: poškození podle stupně úspěchu (originál success²). */
export function computeDamage(cfg: RulesConfig, success: Success): number {
  return Math.round(Math.pow(success, cfg.combat.damageExponent));
}

/** Global.cpp GetConditionModifier: postih za zranění (0 při plném zdraví, záporný jinak). */
export function conditionModifier(cfg: RulesConfig, condition: number): number {
  return idiv(condition - cfg.health.max, cfg.health.conditionStep);
}

/** Global.cpp CalcRepPointsForNextLevel: body reputace potřebné k dosažení úrovně L+1. */
export function repPointsForNextLevel(cfg: RulesConfig, currentLevel: number): number {
  const x = currentLevel + 1;
  return idiv(cfg.reputation.levelFactor * x * (x + 1), 2);
}

/** Global.cpp CalcRepPointsAfterLoss: body reputace po ztrátě úrovně. */
export function repPointsAfterLoss(cfg: RulesConfig, newLevel: number): number {
  const x = newLevel + 1;
  return idiv(x * x * cfg.reputation.levelFactor, 2);
}

/** Global.cpp GetDays: počet dní v měsíci (0 = leden), přestupný rok každý 4. */
export function daysInMonth(month: number, year: number): number {
  let days: number = DAYS_PER_MONTH[month]!;
  if (month === 1 && (year & 3) === 0) days++;
  return days;
}

/** Náhodná úprava hodnoty o ±percent % (vzorec z originálu: x += x × (random(2p+1) − p) / 100). */
export function applyVariance(ctx: Ctx, value: number, percent: number): number {
  const i = ctx.rng.random(2 * percent + 1) - percent;
  return value + idiv(value * i, 100);
}
