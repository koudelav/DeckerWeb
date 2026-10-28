import { describe, expect, it } from "vitest";
import {
  cancelContract, effectiveLevel, effectiveRating, installReadyChip, loadRatings, passTime, upgradeLifestyle,
  increaseSkill, canIncreaseSkill, lifestyleUpgradeCost,
} from "../src/core/character";
import { CharRating, ChipType, HardwareType, ItemType, Lifestyle, LoadStatus, ProgramClass, StartBonus } from "../src/core/constants";
import { acceptContract } from "../src/core/contract";
import { makeCtx, newChar } from "./helpers";

describe("nová postava (Character.cpp CreateNew)", () => {
  it("bez bonusu: 100 kr, 11 programů rating 1, výchozí útok/brnění/hide", () => {
    const ctx = makeCtx(1);
    const ch = newChar(ctx);
    expect(ch.credits).toBe(100);
    expect(ch.software).toHaveLength(11);
    expect(ch.software.every((p) => p.rating === 1 && p.loadByDefault)).toBe(true);
    const byId = (id: number | null) => ch.software.find((p) => p.id === id)?.cls;
    expect(byId(ch.defaults.attack)).toBe(ProgramClass.Attack);
    expect(byId(ch.defaults.armor)).toBe(ProgramClass.Armor);
    expect(byId(ch.defaults.hide)).toBe(ProgramClass.Hide);
    expect(ch.defaults.shield).toBeNull();
    expect(ch.software[0]!.name).toBe("Zap 1.0");
  });
  it("bonusy", () => {
    expect(newChar(makeCtx(2), StartBonus.Money).credits).toBe(2000);
    expect(newChar(makeCtx(2), StartBonus.Skills).skills.programming).toBe(2);
    expect(newChar(makeCtx(2), StartBonus.Hardware).chips).toEqual([2, 2, 2, 2, 2, 2]);
    expect(newChar(makeCtx(2), StartBonus.Software).software.every((p) => p.rating === 2)).toBe(true);
  });
  it("nabídky kontraktů 1..3 a zboží v obchodě", () => {
    for (let seed = 1; seed < 50; seed++) {
      const ch = newChar(makeCtx(seed));
      expect(ch.contracts.length).toBeGreaterThanOrEqual(1);
      expect(ch.contracts.length).toBeLessThanOrEqual(3);
      const sw = ch.shop.filter((i) => i.type === ItemType.Software).length;
      const hw = ch.shop.filter((i) => i.type === ItemType.Hardware).length;
      const chip = ch.shop.filter((i) => i.type === ItemType.Chip).length;
      expect(sw).toBeGreaterThanOrEqual(3); expect(sw).toBeLessThanOrEqual(12);
      expect(hw).toBeGreaterThanOrEqual(1); expect(hw).toBeLessThanOrEqual(4);
      expect(chip).toBeGreaterThanOrEqual(2); expect(chip).toBeLessThanOrEqual(8);
    }
  });
  it("stejný seed = stejná postava", () => {
    expect(newChar(makeCtx(77))).toEqual(newChar(makeCtx(77)));
  });
});

describe("deck a ratingy", () => {
  it("hranice zatížení = 10/20/30 × (CPU + min(COP, CPU))", () => {
    const ch = newChar(makeCtx(1));
    expect(loadRatings(makeCtx().cfg, ch)).toEqual({ light: 20, heavy: 40, max: 60 });
    ch.chips[ChipType.Cpu] = 3;
    ch.chips[ChipType.Coprocessor] = 5;
    expect(loadRatings(makeCtx().cfg, ch)).toEqual({ light: 60, heavy: 120, max: 180 });
  });
  it("startovní deck: zatížení 23 MP = normální", () => {
    const ch = newChar(makeCtx(1));
    // 11 programů rating 1, součet složitostí 2+3+1+4+3+3+2+1+1+1+2 = 23
    expect(ch.currentLoad).toBe(23);
    expect(ch.loadStatus).toBe(LoadStatus.Normal);
  });
  it("efektivní rating doma = min(čip, CPU) + dovednost ± zatížení", () => {
    const ctx = makeCtx(1);
    const ch = newChar(ctx);
    expect(effectiveRating(ctx.cfg, ch, CharRating.Attack)).toBe(2);
    ch.chips[ChipType.Attack] = 5; // omezeno CPU = 1
    expect(effectiveRating(ctx.cfg, ch, CharRating.Attack)).toBe(2);
    ch.health.physical = 12; // postih −2
    expect(effectiveRating(ctx.cfg, ch, CharRating.Attack)).toBe(0);
    ch.health.physical = 20;
    ch.health.deck = 12; // postih −2 / 2 = −1
    expect(effectiveRating(ctx.cfg, ch, CharRating.Attack)).toBe(1);
  });
  it("efektivní úroveň", () => {
    const ch = newChar(makeCtx(1));
    expect(effectiveLevel(ch)).toBe(1);
    for (const k of Object.keys(ch.skills) as (keyof typeof ch.skills)[]) ch.skills[k] = 4;
    expect(effectiveLevel(ch)).toBe(4);
  });
});

describe("dovednosti a lifestyle", () => {
  it("zvýšení dovednosti stojí současnou úroveň", () => {
    const ctx = makeCtx(1);
    const ch = newChar(ctx);
    expect(canIncreaseSkill(ctx.cfg, ch, "attack")).toBe(false);
    ch.skillPoints = 3;
    increaseSkill(ctx.cfg, ch, "attack");
    expect(ch.skills.attack).toBe(2);
    expect(ch.skillPoints).toBe(2);
    increaseSkill(ctx.cfg, ch, "attack");
    expect(ch.skillPoints).toBe(0);
  });
  it("upgrade lifestylu = 3 × nový nájem", () => {
    const ctx = makeCtx(1);
    const ch = newChar(ctx);
    expect(lifestyleUpgradeCost(ctx.cfg, ch)).toBe(3000);
    ch.credits = 3500;
    upgradeLifestyle(ctx, ch);
    expect(ch.lifestyle).toBe(Lifestyle.Low);
    expect(ch.credits).toBe(500);
  });
});

describe("plynutí času (PassTime)", () => {
  it("nájem na konci měsíce", () => {
    const ctx = makeCtx(3);
    const ch = newChar(ctx);
    ch.credits = 1000;
    const r = passTime(ctx, ch, 31);
    expect(ch.date.month).toBe(1);
    expect(ch.date.day).toBe(0);
    expect(ch.credits).toBe(500);
    expect(r.events.some((e) => e.kind === "rent")).toBe(true);
  });
  it("na nájem nemá → krach (Street)", () => {
    const ctx = makeCtx(3);
    const ch = newChar(ctx);
    ch.credits = 100;
    expect(passTime(ctx, ch, 31).gameOver).toBe(true);
  });
  it("na nájem nemá → přestěhování níž", () => {
    const ctx = makeCtx(3);
    const ch = newChar(ctx);
    ch.lifestyle = Lifestyle.High;
    ch.credits = 1500;
    const r = passTime(ctx, ch, 31);
    expect(ch.lifestyle).toBe(Lifestyle.Low);
    expect(ch.credits).toBe(500);
    expect(r.events.some((e) => e.kind === "lifestyleDowngrade")).toBe(true);
  });
  it("nový týden = nové zboží a kontrakty", () => {
    const ctx = makeCtx(4);
    const ch = newChar(ctx);
    const r = passTime(ctx, ch, 7);
    expect(r.events.some((e) => e.kind === "newWeek")).toBe(true);
    expect(ch.date.dayOfWeek).toBe(0);
  });
  it("propadnutí přijatého kontraktu sníží reputaci", () => {
    const ctx = makeCtx(5);
    const ch = newChar(ctx);
    ch.repLevel = 2;
    ch.repPoints = 16;
    acceptContract(ctx, ch, 0);
    const days = ch.currentContract!.daysLeft;
    const diff = ch.currentContract!.difficulty;
    const r = passTime(ctx, ch, days);
    expect(r.events.some((e) => e.kind === "contractFailed")).toBe(true);
    expect(ch.currentContract).toBeNull();
    expect(ch.repPoints).toBe(Math.max(0, 16 - diff));
  });
  it("odměna nabídek roste o 10 % za den", () => {
    const ctx = makeCtx(6);
    const ch = newChar(ctx);
    ch.contracts = [{ ...ch.contracts[0]!, daysLeft: 5, pay: 1000 }];
    passTime(ctx, ch, 1);
    expect(ch.contracts[0]!.pay).toBe(1100);
  });
  it("vypálený čip čeká na rozhodnutí", () => {
    const ctx = makeCtx(7);
    const ch = newChar(ctx);
    ch.hardware[HardwareType.ChipBurner] = 2;
    ch.sources.push({ id: 999, type: ItemType.Chip, cls: ChipType.Attack, rating: 3 });
    ch.chipBurning = { sourceId: 999, timeLeft: 12 };
    passTime(ctx, ch, 5);
    expect(ch.chipBurning).not.toBeNull();
    const r = passTime(ctx, ch, 1);
    expect(r.events.some((e) => e.kind === "chipReady")).toBe(true);
    installReadyChip(ch, true);
    expect(ch.chips[ChipType.Attack]).toBe(3);
  });
  it("zrušení kontraktu (novinka remasteru) stojí reputaci", () => {
    const ctx = makeCtx(8);
    const ch = newChar(ctx);
    ch.repPoints = 10;
    ch.repLevel = 1;
    acceptContract(ctx, ch, 0);
    const d = ch.currentContract!.difficulty;
    cancelContract(ctx.cfg, ch);
    expect(ch.currentContract).toBeNull();
    expect(ch.repPoints).toBe(10 - d);
  });
});
