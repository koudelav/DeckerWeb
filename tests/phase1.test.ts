import { describe, expect, it } from "vitest";
import { buildConfig, DEFAULT_CONFIG } from "../src/core/config";
import { Rng } from "../src/core/rng";
import {
  computeDamage, conditionModifier, daysInMonth, repPointsAfterLoss, repPointsForNextLevel, successFromRoll,
} from "../src/core/dice";
import { idiv } from "../src/core/util";
import { PROGRAM_NAMES, PROGRAM_CLASS_NAMES } from "../src/core/data/programNames";
import { ICE_NAMES } from "../src/core/data/iceNames";
import { CORPORATIONS } from "../src/core/data/corporations";
import { NODE_GRIDS } from "../src/core/data/texts";

const cfg = buildConfig();

describe("konfigurace", () => {
  it("bez odchylek odpovídá výchozí", () => {
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });
  it("odchylka přepíše jen zadanou hodnotu", () => {
    const c = buildConfig({ dice: { sides: 12 } });
    expect(c.dice.sides).toBe(12);
    expect(c.dice.maxSuccess).toBe(5);
    expect(DEFAULT_CONFIG.dice.sides).toBe(20);
  });
  it("neznámý parametr je chyba", () => {
    expect(() => buildConfig({ dice: { foo: 1 } } as never)).toThrow();
  });
  it("výsledná konfigurace je neměnná", () => {
    expect(Object.isFrozen(cfg.dice)).toBe(true);
  });
});

describe("PRNG", () => {
  it("stejný seed = stejná posloupnost", () => {
    const a = new Rng(42), b = new Rng(42);
    const sa = Array.from({ length: 50 }, () => a.random(1000));
    const sb = Array.from({ length: 50 }, () => b.random(1000));
    expect(sa).toEqual(sb);
  });
  it("stav jde uložit a obnovit", () => {
    const a = new Rng(7);
    a.random(10);
    const b = new Rng(a.getState());
    expect(Array.from({ length: 20 }, () => a.random(100))).toEqual(Array.from({ length: 20 }, () => b.random(100)));
  });
  it("random(n) je v rozsahu a pokrývá všechny hodnoty", () => {
    const r = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.random(20);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(20);
      seen.add(v);
    }
    expect(seen.size).toBe(20);
  });
});

describe("kostky (Global.cpp DoDieRoll)", () => {
  it("hod 1 je kritické selhání i proti nízkému cíli", () => {
    expect(successFromRoll(cfg, 1, -5)).toBe(-1);
  });
  it("pod cílem je selhání", () => {
    expect(successFromRoll(cfg, 9, 10)).toBe(0);
  });
  it("stupně úspěchu podle rozdílu", () => {
    // (rozdíl + 4) / 4
    expect(successFromRoll(cfg, 10, 10)).toBe(1);
    expect(successFromRoll(cfg, 13, 10)).toBe(1);
    expect(successFromRoll(cfg, 14, 10)).toBe(2);
    expect(successFromRoll(cfg, 18, 10)).toBe(3);
    expect(successFromRoll(cfg, 20, 2)).toBe(5);
  });
  it("cíl nad 20 se ořízne, hod 20 vždy uspěje", () => {
    expect(successFromRoll(cfg, 20, 35)).toBe(1);
    expect(successFromRoll(cfg, 19, 35)).toBe(0);
  });
  it("poškození = úspěch²", () => {
    expect([1, 2, 3, 4, 5].map((s) => computeDamage(cfg, s))).toEqual([1, 4, 9, 16, 25]);
  });
});

describe("zdraví, reputace, kalendář", () => {
  it("postih za zranění se zaokrouhluje k nule jako v C", () => {
    expect(idiv(-5, 4)).toBe(-1);
    expect(conditionModifier(cfg, 20)).toBe(0);
    expect(conditionModifier(cfg, 17)).toBe(0);
    expect(conditionModifier(cfg, 16)).toBe(-1);
    expect(conditionModifier(cfg, 15)).toBe(-1);
    expect(conditionModifier(cfg, 12)).toBe(-2);
    expect(conditionModifier(cfg, 0)).toBe(-5);
  });
  it("body reputace na další úroveň", () => {
    expect([0, 1, 2, 3, 4].map((l) => repPointsForNextLevel(cfg, l))).toEqual([5, 15, 30, 50, 75]);
    expect(repPointsAfterLoss(cfg, 1)).toBe(10);
  });
  it("únor v přestupném roce", () => {
    expect(daysInMonth(1, 2132)).toBe(29);
    expect(daysInMonth(1, 2133)).toBe(28);
  });
});

describe("datové tabulky", () => {
  it("25 tříd programů po 20 názvech + 26 názvů tříd", () => {
    expect(PROGRAM_NAMES).toHaveLength(25);
    expect(PROGRAM_CLASS_NAMES).toHaveLength(26);
    expect(PROGRAM_NAMES[0]![0]).toBe("Zap 1.0");
  });
  it("tabulky ICE mají správné délky", () => {
    expect(ICE_NAMES.gateway).toHaveLength(20);
    expect(ICE_NAMES.dataBomb).toHaveLength(10);
    expect(ICE_NAMES.attackHardened).toHaveLength(15);
    expect(ICE_NAMES.traceFry).toHaveLength(10);
  });
  it("100 korporací", () => {
    expect(CORPORATIONS).toHaveLength(100);
    expect(CORPORATIONS[99]!.name).toBe("Saeder-Krupp");
  });
  it("šablony nodů 9×9", () => {
    for (const g of NODE_GRIDS) {
      expect(g).toHaveLength(9);
      for (const row of g) expect(row).toHaveLength(9);
    }
  });
});
