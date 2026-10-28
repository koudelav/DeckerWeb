// Hra = stav (postava, generátor náhody, odchylky konfigurace) + odvozený kontext pravidel.
// Ukládání: celý stav je čistý JSON. Originál ukládal binárně přes CArchive (Character.cpp Save/Load);
// původní savy (.dsg) remaster nenačítá.

import { buildConfig, type ConfigOverrides, type RulesConfig } from "./config";
import type { Ctx } from "./context";
import { createNewCharacter, type NewCharacterOptions } from "./character";
import { Rng, type RngState } from "./rng";
import type { Character } from "./state";

export const SAVE_FORMAT = "decker-remaster-save";
export const SAVE_VERSION = 1;

export interface SaveData {
  format: typeof SAVE_FORMAT;
  version: number;
  /** Verze pravidel originálu, ze které vychází výchozí konfigurace. */
  baseline: "1.12";
  savedAt: string;
  /** Stav generátoru náhody – po načtení pokračuje stejná posloupnost. */
  rng: RngState;
  /** Odchylky od výchozí konfigurace, se kterými hra běží (zatím obvykle prázdné). */
  configOverrides: ConfigOverrides;
  character: Character;
  /** Stav probíhajícího runu v Matrixu (fáze 5). */
  run: null;
}

export class Game implements Ctx {
  readonly cfg: RulesConfig;
  readonly rng: Rng;
  readonly overrides: ConfigOverrides;
  character: Character;

  private constructor(character: Character, rng: Rng, overrides: ConfigOverrides) {
    this.overrides = overrides;
    this.cfg = buildConfig(overrides);
    this.rng = rng;
    this.character = character;
  }

  /** Nová hra (IntroDlg "New"). */
  static newGame(opts: NewCharacterOptions, seed: number = Date.now(), overrides: ConfigOverrides = {}): Game {
    const cfg = buildConfig(overrides);
    const rng = new Rng(seed);
    const ch = createNewCharacter({ cfg, rng }, opts);
    return new Game(ch, rng, overrides);
  }

  toSave(): SaveData {
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      baseline: "1.12",
      savedAt: new Date().toISOString(),
      rng: this.rng.getState(),
      configOverrides: structuredClone(this.overrides) as ConfigOverrides,
      character: structuredClone(this.character),
      run: null,
    };
  }

  static fromSave(data: unknown): Game {
    const save = validateSave(data);
    return new Game(structuredClone(save.character), new Rng(save.rng), save.configOverrides);
  }
}

export class SaveError extends Error {}

/** Kontrola a případná migrace načteného savu. */
export function validateSave(data: unknown): SaveData {
  if (typeof data !== "object" || data === null) throw new SaveError("Soubor neobsahuje uloženou hru.");
  const d = data as Partial<SaveData>;
  if (d.format !== SAVE_FORMAT) throw new SaveError("Soubor není uložená hra Decker Remaster.");
  if (typeof d.version !== "number" || d.version > SAVE_VERSION) {
    throw new SaveError("Uložená hra je z novější verze remasteru.");
  }
  if (!Array.isArray(d.rng) || d.rng.length !== 4 || !d.rng.every((v) => Number.isInteger(v))) {
    throw new SaveError("Poškozený save: chybí stav generátoru náhody.");
  }
  const ch = d.character as Partial<Character> | undefined;
  const required: (keyof Character)[] = [
    "name", "credits", "lifestyle", "skills", "chips", "hardware", "software", "contracts", "shop", "date", "health", "nextId",
  ];
  if (!ch || typeof ch !== "object" || required.some((k) => ch[k] === undefined)) {
    throw new SaveError("Poškozený save: neúplná postava.");
  }
  // Kontrola, že odchylky konfigurace odpovídají známým parametrům (buildConfig hlásí neznámé)
  try {
    buildConfig((d.configOverrides ?? {}) as ConfigOverrides);
  } catch (e) {
    throw new SaveError(`Save obsahuje neznámé parametry pravidel: ${(e as Error).message}`);
  }
  return {
    format: SAVE_FORMAT,
    version: d.version,
    baseline: "1.12",
    savedAt: typeof d.savedAt === "string" ? d.savedAt : "",
    rng: d.rng as RngState,
    configOverrides: (d.configOverrides ?? {}) as ConfigOverrides,
    character: ch as Character,
    run: null,
  };
}
