// Konfigurace pravidel.
//
// Pravidla pro jádro (viz plan.md):
// 1. Jádro čte parametry pravidel jen z objektu konfigurace, nikde si čísla nekopíruje.
// 2. Efektivní konfigurace = výchozí hodnoty 1.12 + vrstva odchylek (zatím prázdná).
// 3. Save nese odchylky, se kterými vznikl.

import { DEFAULT_CONFIG, type RulesConfig } from "./defaults";

export { DEFAULT_CONFIG, type RulesConfig };

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** Částečné odchylky od výchozí konfigurace (do hloubky; pole se nahrazují celá). */
export type ConfigOverrides = DeepPartial<RulesConfig>;

export function buildConfig(overrides: ConfigOverrides = {}): RulesConfig {
  return deepFreeze(deepMerge(structuredClone(DEFAULT_CONFIG), overrides) as RulesConfig);
}

function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (isPlainObject(base) && isPlainObject(over)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(over)) {
      if (!(k in base)) throw new Error(`Neznámý parametr konfigurace: ${k}`);
      out[k] = deepMerge(base[k], v);
    }
    return out;
  }
  return over;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepFreeze<T>(o: T): T {
  if (typeof o === "object" && o !== null) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
