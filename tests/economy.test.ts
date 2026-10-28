import { describe, expect, it } from "vitest";
import { ContractFlag, ContractType, HardwareType, ItemType, ProgramClass, TargetObject } from "../src/core/constants";
import { acceptContract, contractDescription, contractTypeText, generateContract, VALID_TARGETS } from "../src/core/contract";
import { CORPORATIONS } from "../src/core/data/corporations";
import { softwarePrice, programSize } from "../src/core/program";
import {
  checkPurchase, chipPrice, hardwarePrice, orderDeliveryDays, orderPrice, placeOrder, purchase,
} from "../src/core/shop";
import { restOptions, rest } from "../src/core/rest";
import { projectWork, startProject, workOnProject, buildProgram, burnChip, checkBurnChip } from "../src/core/projects";
import { toggleLoad, setDefault, clearLoads, trashProgram } from "../src/core/deck";
import { makeCtx, newChar } from "./helpers";

const cfg = makeCtx().cfg;

describe("ceny (Program.cpp, ShopItem.cpp)", () => {
  it("program = složitost × rating² × 25, velikost = složitost × rating", () => {
    expect(softwarePrice(cfg, ProgramClass.Attack, 1)).toBe(50);
    expect(softwarePrice(cfg, ProgramClass.Decoy, 5)).toBe(2500);
    expect(programSize(cfg, ProgramClass.Medic, 3)).toBe(12);
  });
  it("hardware = základ × 2^(úroveň−1), čip = rating² × základ", () => {
    expect(hardwarePrice(cfg, HardwareType.ChipBurner, 3)).toBe(4000);
    expect(chipPrice(cfg, 0, 4)).toBe(2400);
  });
  it("objednávka = 2× cena, dodání podle ceny, software o den dřív", () => {
    expect(orderPrice(cfg, ItemType.Software, ProgramClass.Attack, 3)).toBe(900);
    expect(orderDeliveryDays(cfg, ItemType.Software, 900)).toBe(2);
    expect(orderDeliveryDays(cfg, ItemType.Chip, 900)).toBe(3);
    expect(orderDeliveryDays(cfg, ItemType.Hardware, 60000)).toBe(7);
  });
});

describe("obchod", () => {
  it("nákup programu: stejný rating odmítne, program v obchodě zůstane", () => {
    const ctx = makeCtx(11);
    const ch = newChar(ctx);
    ch.credits = 100000;
    ch.shop = [{ text: "x", type: ItemType.Software, subType: ProgramClass.Attack, rating: 1, price: 50 }];
    expect(checkPurchase(ctx.cfg, ch, ch.shop[0]!)).toEqual({ ok: false, message: "You already own this type of program" });
    ch.shop[0]!.rating = 3;
    purchase(ctx.cfg, ch, 0);
    expect(ch.shop).toHaveLength(1);
    expect(ch.software.filter((p) => p.cls === ProgramClass.Attack).map((p) => p.rating)).toEqual([3, 1]);
  });
  it("nákup hardwaru: výkup starého za polovinu", () => {
    const ctx = makeCtx(12);
    const ch = newChar(ctx);
    ch.credits = 5000;
    ch.hardware[HardwareType.SurgeSuppressor] = 1;
    ch.shop = [{ text: "x", type: ItemType.Hardware, subType: HardwareType.SurgeSuppressor, rating: 2, price: 1000 }];
    const msg = purchase(ctx.cfg, ch, 0);
    expect(ch.credits).toBe(5000 + 250 - 1000);
    expect(msg).toContain("250cr");
    expect(ch.shop).toHaveLength(0);
  });
  it("objednávka dorazí", () => {
    const ctx = makeCtx(13);
    const ch = newChar(ctx);
    ch.credits = 10000;
    placeOrder(ctx.cfg, ch, ItemType.Chip, 0, 3);
    expect(ch.credits).toBe(10000 - 2 * 1350);
    const days = ch.order!.timeLeft;
    rest(ctx, ch, "wait");
    for (let i = 1; i < days; i++) rest(ctx, ch, "wait");
    expect(ch.order).toBeNull();
    expect(ch.chips[0]).toBe(3);
  });
});

describe("kontrakty (Contract.cpp Generate)", () => {
  it("invarianty na 2000 generovaných kontraktech", () => {
    const ctx = makeCtx(21);
    const ch = newChar(ctx);
    for (const [rep, ls] of [[0, 0], [5, 1], [12, 2], [20, 4]] as const) {
      ch.repLevel = rep;
      ch.lifestyle = ls;
      for (let i = 0; i < 500; i++) {
        const c = generateContract(ctx, ch);
        expect(c.systemSize).toBeGreaterThanOrEqual(1);
        expect(c.systemSize).toBeLessThanOrEqual(20);
        expect(Math.floor(c.corporation / 5)).toBe(c.systemSize - 1);
        expect(c.systemName).toBe(CORPORATIONS[c.corporation]!.name);
        if (c.type <= ContractType.SabotageIO) expect(c.targetFlags & (1 << c.targetObject)).not.toBe(0);
        if (c.type === ContractType.CrashSystem || c.type === ContractType.Backdoor) expect(c.targetObject).toBe(TargetObject.Cpu);
        if (c.type === ContractType.CrashSystem) expect(c.flags & ContractFlag.NoAlarms).toBe(0);
        if (c.flags & ContractFlag.Timed) expect(c.daysLeft).toBe(1);
        else { expect(c.daysLeft).toBeGreaterThanOrEqual(1); expect(c.daysLeft).toBeLessThanOrEqual(5); }
        expect(c.numTargets).toBeGreaterThanOrEqual(1);
        expect(c.numTargets).toBeLessThanOrEqual(5);
        expect(c.targetFlags).toBe(VALID_TARGETS[CORPORATIONS[c.corporation]!.type]);
        expect(contractDescription(c).length).toBeGreaterThan(20);
        expect(contractTypeText(c).length).toBeGreaterThan(3);
      }
    }
  });
  it("časově omezené mise až od základní obtížnosti 5", () => {
    const ctx = makeCtx(22);
    const ch = newChar(ctx);
    ch.repLevel = 4;
    for (let i = 0; i < 500; i++) expect(generateContract(ctx, ch).flags & ContractFlag.Timed).toBe(0);
  });
  it("Run Program přidá klientský program", () => {
    const ctx = makeCtx(23);
    const ch = newChar(ctx);
    let c;
    do c = generateContract(ctx, ch); while (c.type !== ContractType.RunProgram);
    ch.contracts = [c];
    acceptContract(ctx, ch, 0);
    expect(ch.software.some((p) => p.cls === ProgramClass.Client)).toBe(true);
  });
});

describe("léčení (RestDlg.cpp)", () => {
  it("časy a ceny", () => {
    const ctx = makeCtx(31);
    const ch = newChar(ctx);
    ch.health.physical = 14; // d = 6
    const o = restOptions(ctx.cfg, ch);
    expect(o.homeDays).toBe(6);
    expect(o.homeAllDays).toBe(16); // 6 × 8 / 3
    expect(o.hospitalDays).toBe(3);
    expect(o.hospitalAllDays).toBe(8);
    expect(o.hospitalCost).toBe(600);
    expect(o.hospitalAllCost).toBe(1600);
  });
});

describe("projekty (NewProjectDlg, ProjectDataDlg)", () => {
  it("pracnost: nový = složitost × rating², upgrade jen rozdíl", () => {
    const ctx = makeCtx(41);
    const ch = newChar(ctx);
    expect(projectWork(ctx.cfg, ch, ItemType.Software, ProgramClass.Decoy, 3)).toBe(36);
    ch.sources.push({ id: 500, type: ItemType.Software, cls: ProgramClass.Decoy, rating: 2 });
    expect(projectWork(ctx.cfg, ch, ItemType.Software, ProgramClass.Decoy, 3)).toBe(20);
    expect(projectWork(ctx.cfg, ch, ItemType.Software, ProgramClass.Decoy, 1)).toBe(4);
    expect(projectWork(ctx.cfg, ch, ItemType.Software, ProgramClass.Decoy, 2)).toBe(1);
  });
  it("dokončení projektu, překlad a nahrání", () => {
    const ctx = makeCtx(42);
    const ch = newChar(ctx);
    ch.skills.programming = 5;
    ch.credits = 100000;
    startProject(ctx.cfg, ch, ItemType.Software, ProgramClass.Attack, 3);
    let guard = 0;
    while (ch.project && guard++ < 20) workOnProject(ctx, ch, "finish");
    expect(ch.project).toBeNull();
    const src = ch.sources.find((s) => s.cls === ProgramClass.Attack)!;
    const prog = buildProgram(ctx.cfg, ch, src.id, { name: "Zap X", load: true, trash: true, unload: false });
    expect(ch.software.filter((p) => p.cls === ProgramClass.Attack)).toEqual([prog]);
    expect(ch.defaults.attack).toBe(prog.id);
  });
  it("vypalování čipu vyžaduje Chip Burner", () => {
    const ctx = makeCtx(43);
    const ch = newChar(ctx);
    ch.sources.push({ id: 501, type: ItemType.Chip, cls: 1, rating: 3 });
    expect(checkBurnChip(ch, 501)).toEqual({ ok: false, message: "You do not own a chip burner." });
    ch.hardware[HardwareType.ChipBurner] = 1;
    burnChip(ctx.cfg, ch, 501);
    expect(ch.chipBurning!.timeLeft).toBe(12);
  });
});

describe("deck (DeckDataDialog.cpp)", () => {
  it("nahrání nad limit odmítne, odnahrání zruší výchozí", () => {
    const ctx = makeCtx(51);
    const ch = newChar(ctx);
    const attack = ch.software.find((p) => p.cls === ProgramClass.Attack)!;
    expect(toggleLoad(ctx.cfg, ch, attack.id)).toBeNull();
    expect(attack.loadByDefault).toBe(false);
    expect(ch.defaults.attack).toBeNull();
    expect(setDefault(ctx.cfg, ch, attack.id)).toBeNull();
    expect(ch.defaults.attack).toBe(attack.id);
    clearLoads(ctx.cfg, ch);
    expect(ch.currentLoad).toBe(0);
    trashProgram(ctx.cfg, ch, attack.id);
    expect(ch.software.some((p) => p.id === attack.id)).toBe(false);
    ch.software.push({ id: 900, name: "big", cls: ProgramClass.Decoy, rating: 20, loadByDefault: false, loadedRating: 0, sound: 10 });
    expect(toggleLoad(ctx.cfg, ch, 900)).toBe("This would overload your deck.");
  });
});
