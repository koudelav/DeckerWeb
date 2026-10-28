import { describe, expect, it } from "vitest";
import { buildConfig, DEFAULT_CONFIG } from "../src/core/config";
import { ORIGINAL_VERSION } from "../src/core";

describe("fáze 0", () => {
  it("jádro hlásí původní verzi 1.12", () => {
    expect(ORIGINAL_VERSION).toEqual({ major: 1, minor: 12 });
  });

  it("bez odchylek je konfigurace rovna výchozí", () => {
    expect(buildConfig()).toEqual(DEFAULT_CONFIG);
  });
});
