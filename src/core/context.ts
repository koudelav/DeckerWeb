import type { RulesConfig } from "./config";
import type { Rng } from "./rng";

/** Kontext pravidel: konfigurace + generátor náhody. Předává se všem funkcím jádra. */
export interface Ctx {
  readonly cfg: RulesConfig;
  readonly rng: Rng;
}
