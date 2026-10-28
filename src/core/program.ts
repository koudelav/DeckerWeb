// Programy. Originál: Program.cpp. Kuchařka: docs/pravidla/04-programy.md

import type { RulesConfig } from "./config";
import { ProgramClass } from "./constants";
import { PROGRAM_CLASS_NAMES, PROGRAM_NAMES } from "./data/programNames";
import { SOUND_DEFAULT_CLIENT } from "./data/sounds";
import type { Character, Program } from "./state";

/** Program.cpp GetProgramComplexity */
export function programComplexity(cfg: RulesConfig, cls: ProgramClass): number {
  return cfg.programs.complexity[cls]!;
}

/** Program.cpp GetSoftwarePrice: složitost × rating² × 25 */
export function softwarePrice(cfg: RulesConfig, cls: ProgramClass, rating: number): number {
  return programComplexity(cfg, cls) * rating * rating * cfg.programs.priceFactor;
}

/** Program.cpp GetProgramSize: složitost × rating (MP) */
export function programSize(cfg: RulesConfig, cls: ProgramClass, rating: number): number {
  return programComplexity(cfg, cls) * rating;
}

export function programClassName(cls: ProgramClass): string {
  return PROGRAM_CLASS_NAMES[cls]!;
}

/** Výchozí název programu podle třídy a ratingu (nad 20 se použije název pro 20). */
export function defaultProgramName(cls: ProgramClass, rating: number): string {
  if (cls === ProgramClass.Client) return "Client Supplied Program";
  return PROGRAM_NAMES[cls]![Math.min(rating, 20) - 1]!;
}

/** Program.cpp GetSoftwareText: "Zap 1.0 (Attack 1)" */
export function softwareText(cls: ProgramClass, rating: number): string {
  return `${defaultProgramName(cls, rating)} (${programClassName(cls)} ${rating})`;
}

/** Nový program (CProgram + GetInitValues). Id přidělí postava. */
export function createProgram(ch: Character, cls: ProgramClass, rating: number): Program {
  return {
    id: ch.nextId++,
    name: defaultProgramName(cls, rating),
    cls,
    rating,
    loadByDefault: false,
    loadedRating: 0,
    sound: cls === ProgramClass.Client ? SOUND_DEFAULT_CLIENT : cls,
  };
}
