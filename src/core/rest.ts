// Odpočinek a léčení. Originál: RestDlg.cpp. Kuchařka: docs/pravidla/03-cas-a-lifestyle.md

import type { RulesConfig } from "./config";
import type { Ctx } from "./context";
import { passTime, type PassTimeResult } from "./character";
import type { Character } from "./state";
import { idiv } from "./util";

export interface RestOptions {
  damage: number;
  /** Léčení 1 bodu doma (dny). */
  homeDays: number;
  /** Úplné vyléčení doma (dny). */
  homeAllDays: number;
  hospitalDays: number;
  hospitalAllDays: number;
  hospitalCost: number;
  hospitalAllCost: number;
  canHeal: boolean;
  canHospital: boolean;
  canHospitalAll: boolean;
}

export function restOptions(cfg: RulesConfig, ch: Character): RestOptions {
  const r = cfg.rest;
  const damage = cfg.health.max - ch.health.physical;
  const homeDays = damage * r.homeDaysPerDamage;
  const homeAllDays = idiv(damage * (damage + r.fullHealOffset), r.fullHealDivisor);
  const ceilDiv = (a: number) => idiv(a + r.hospitalTimeDivisor - 1, r.hospitalTimeDivisor);
  const hospitalCost = r.hospitalCostPerDay * homeDays;
  const hospitalAllCost = r.hospitalCostPerDay * homeAllDays;
  return {
    damage,
    homeDays,
    homeAllDays,
    hospitalDays: ceilDiv(homeDays),
    hospitalAllDays: ceilDiv(homeAllDays),
    hospitalCost,
    hospitalAllCost,
    canHeal: damage !== 0,
    // Originál: nemocnice až od 2 chybějících bodů
    canHospital: damage > 1 && ch.credits >= hospitalCost,
    canHospitalAll: damage > 1 && ch.credits >= hospitalAllCost,
  };
}

export type RestAction = "heal" | "healAll" | "hospital" | "hospitalAll" | "wait";

/** RestDlg OnHeal / OnHealAll / OnHospHeal / OnHospHealAll / OnWait */
export function rest(ctx: Ctx, ch: Character, action: RestAction): PassTimeResult {
  const o = restOptions(ctx.cfg, ch);
  const max = ctx.cfg.health.max;
  const days = { heal: o.homeDays, healAll: o.homeAllDays, hospital: o.hospitalDays, hospitalAll: o.hospitalAllDays, wait: 1 }[action];
  const t = passTime(ctx, ch, days);
  if (t.gameOver) return t;
  if (action === "heal") ch.health.physical++;
  else if (action === "healAll") ch.health.physical = max;
  else if (action === "hospital") {
    ch.health.physical++;
    ch.credits -= o.hospitalCost;
  } else if (action === "hospitalAll") {
    ch.health.physical = max;
    ch.credits -= o.hospitalAllCost;
  }
  return t;
}
