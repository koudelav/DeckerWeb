// Konfigurace pravidel.
//
// Pravidla pro jádro (viz plan.md):
// 1. Jádro čte parametry pravidel jen z objektu konfigurace, nikde si čísla nekopíruje.
// 2. Efektivní konfigurace = výchozí hodnoty 1.12 + vrstva odchylek (zatím prázdná).
// 3. Save nese odchylky, se kterými vznikl.
//
// Jednotlivé sekce (combat, ice, programs, …) přibudou s portem modulů ve fázi 1 a 2.

export interface RulesConfig {
  /** Verze původních pravidel, ze kterých výchozí hodnoty pocházejí. */
  readonly baseline: "1.12";
}

export const DEFAULT_CONFIG: RulesConfig = {
  baseline: "1.12",
};

/** Částečné odchylky od výchozí konfigurace (do hloubky). */
export type ConfigOverrides = DeepPartial<RulesConfig>;

type DeepPartial<T> = { -readonly [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function buildConfig(overrides: ConfigOverrides = {}): RulesConfig {
  return deepMerge(DEFAULT_CONFIG, overrides) as RulesConfig;
}

function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (isPlainObject(base) && isPlainObject(over)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(over)) {
      out[k] = deepMerge(base[k], v);
    }
    return out;
  }
  return over;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
