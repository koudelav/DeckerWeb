// Hra = stav (postava, generátor náhody, odchylky konfigurace) + odvozený kontext pravidel.
// Ukládání: celý stav je čistý JSON. Originál ukládal binárně přes CArchive (Character.cpp Save/Load);
// původní savy (.dsg) remaster nenačítá.

import { buildConfig, type ConfigOverrides, type RulesConfig } from "./config";
import type { Ctx } from "./context";
import { createNewCharacter, type NewCharacterOptions } from "./character";
import { Rng, type RngState } from "./rng";
import type { Character } from "./state";
import { Run, startRun, type RunState } from "./matrix/run";

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
  /** Stav probíhajícího runu v Matrixu (null = hráč je doma). */
  run: RunState | null;
}

export class Game implements Ctx {
  readonly cfg: RulesConfig;
  readonly rng: Rng;
  readonly overrides: ConfigOverrides;
  character: Character;
  /** Probíhající run v Matrixu. */
  run: Run | null = null;

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
      run: this.run ? structuredClone(this.run.s) : null,
    };
  }

  /** Vstup do Matrixu (HomeView OnMatrix). */
  jackIn(useBackdoor: boolean): Run {
    this.run = startRun(this, this.character, useBackdoor);
    return this.run;
  }

  /** Po zobrazení výsledků runu: zpět domů. */
  leaveMatrix(): void {
    this.run = null;
  }

  static fromSave(data: unknown): Game {
    const save = validateSave(data);
    const game = new Game(structuredClone(save.character), new Rng(save.rng), save.configOverrides);
    if (save.run && !save.run.end) game.run = new Run(game, game.character, structuredClone(save.run));
    else game.character.onRun = false;
    return game;
  }
}

export class SaveError extends Error {}

/** Kontrola a případná migrace načteného savu. */
export function validateSave(data: unknown): SaveData {
  if (typeof data !== "object" || data === null) throw new SaveError("This doesn't contain a saved game.");
  const d = data as Partial<SaveData>;
  if (d.format !== SAVE_FORMAT) throw new SaveError("This is not a Decker Remaster save.");
  if (typeof d.version !== "number" || d.version > SAVE_VERSION) {
    throw new SaveError("This save comes from a newer version of the remaster.");
  }
  if (!Array.isArray(d.rng) || d.rng.length !== 4 || !d.rng.every((v) => Number.isInteger(v))) {
    throw new SaveError("The save is damaged: the random generator state is missing.");
  }
  const ch = d.character as Partial<Character> | undefined;
  const required: (keyof Character)[] = [
    "name", "credits", "lifestyle", "skills", "chips", "hardware", "software", "contracts", "shop", "date", "health", "nextId",
  ];
  if (!ch || typeof ch !== "object" || required.some((k) => ch[k] === undefined)) {
    throw new SaveError("The save is damaged: the character is incomplete.");
  }
  // Kontrola, že odchylky konfigurace odpovídají známým parametrům (buildConfig hlásí neznámé)
  try {
    buildConfig((d.configOverrides ?? {}) as ConfigOverrides);
  } catch (e) {
    throw new SaveError(`The save contains unknown rule settings: ${(e as Error).message}`);
  }
  return {
    format: SAVE_FORMAT,
    version: d.version,
    baseline: "1.12",
    savedAt: typeof d.savedAt === "string" ? d.savedAt : "",
    rng: d.rng as RngState,
    configOverrides: (d.configOverrides ?? {}) as ConfigOverrides,
    character: ch as Character,
    run: (d.run && typeof d.run === "object" && "system" in d.run ? d.run : null) as RunState | null,
  };
}
