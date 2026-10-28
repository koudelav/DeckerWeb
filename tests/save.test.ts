import { beforeEach, describe, expect, it } from "vitest";
import { Game, SaveError, validateSave } from "../src/core/game";
import { passTime } from "../src/core/character";
import { StartBonus } from "../src/core/constants";
import { AUTOSAVE_ID, deleteSlot, listSaves, loadFromSlot, saveToSlot } from "../src/storage";

const opts = { name: "Case", image: 3, ironMan: false, tooltips: false, bonus: StartBonus.Money };

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe("save do JSON", () => {
  it("uložení a načtení zachová stav i pokračování náhody", () => {
    const a = Game.newGame(opts, 99);
    passTime(a, a.character, 3);
    const json = JSON.stringify(a.toSave());
    const b = Game.fromSave(JSON.parse(json));
    expect(b.character).toEqual(a.character);
    // Další vývoj je u obou her stejný
    passTime(a, a.character, 10);
    passTime(b, b.character, 10);
    expect(b.character).toEqual(a.character);
  });
  it("odchylky konfigurace se uloží a použijí", () => {
    const a = Game.newGame(opts, 5, { lifestyle: { upgradeFactor: 1 } });
    const b = Game.fromSave(JSON.parse(JSON.stringify(a.toSave())));
    expect(b.cfg.lifestyle.upgradeFactor).toBe(1);
    expect(b.overrides).toEqual({ lifestyle: { upgradeFactor: 1 } });
  });
  it("odmítne cizí nebo poškozený soubor", () => {
    expect(() => validateSave({ foo: 1 })).toThrow(SaveError);
    const s = Game.newGame(opts, 1).toSave();
    expect(() => validateSave({ ...s, version: 999 })).toThrow(/novější/);
    expect(() => validateSave({ ...s, rng: [1, 2] })).toThrow(SaveError);
    expect(() => validateSave({ ...s, character: { name: "x" } })).toThrow(/neúplná/);
    expect(() => validateSave({ ...s, configOverrides: { nesmysl: 1 } })).toThrow(/neznámé/);
  });
});

describe("úložiště prohlížeče", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });
  it("sloty: uložit, vypsat, načíst, smazat", () => {
    const g = Game.newGame(opts, 7);
    const id = saveToSlot(g, null);
    saveToSlot(g, AUTOSAVE_ID);
    expect(listSaves().map((s) => s.id).sort()).toEqual([AUTOSAVE_ID, id].sort());
    expect(loadFromSlot(id).character).toEqual(g.character);
    deleteSlot(id);
    expect(listSaves().map((s) => s.id)).toEqual([AUTOSAVE_ID]);
    expect(() => loadFromSlot(id)).toThrow(SaveError);
  });
});
