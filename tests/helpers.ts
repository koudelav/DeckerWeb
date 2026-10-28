import { buildConfig, type ConfigOverrides } from "../src/core/config";
import type { Ctx } from "../src/core/context";
import { Rng } from "../src/core/rng";
import { createNewCharacter } from "../src/core/character";
import { StartBonus } from "../src/core/constants";

export function makeCtx(seed = 1, overrides: ConfigOverrides = {}): Ctx {
  return { cfg: buildConfig(overrides), rng: new Rng(seed) };
}

export function newChar(ctx: Ctx, bonus = StartBonus.None) {
  return createNewCharacter(ctx, { name: "Test", image: 0, ironMan: false, tooltips: false, bonus });
}
