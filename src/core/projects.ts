// Vývoj programů a čipů, překlad, vypalování čipů.
// Originál: NewProjectDlg.cpp, ProjectDataDlg.cpp, BuildDialog.cpp. Kuchařka: docs/pravidla/07-projekty.md

import type { RulesConfig } from "./config";
import { ChipType, HardwareType, ItemType, ProgramClass } from "./constants";
import type { Ctx } from "./context";
import { calcCurrentLoad, chipComplexity, chipName, loadRatings, passTime, type GameEvent } from "./character";
import { doDieRoll } from "./dice";
import { programClassName, programComplexity, programSize } from "./program";
import type { Character, DefaultSlot, Program, Source } from "./state";
import { idiv } from "./util";

export type ProjectType = ItemType.Software | ItemType.Chip;

export function projectSkill(ch: Character, type: ProjectType): number {
  return type === ItemType.Software ? ch.skills.programming : ch.skills.chipDesign;
}

/** Pracovní body za den = dovednost × (1 + Design Assistant). */
export function projectSpeed(ch: Character, type: ProjectType): number {
  return projectSkill(ch, type) * (1 + ch.hardware[HardwareType.DesignAssistant]!);
}

export function complexityOf(cfg: RulesConfig, type: ProjectType, cls: number): number {
  return type === ItemType.Software ? programComplexity(cfg, cls) : chipComplexity(cfg, cls);
}

export function sourceName(type: ProjectType, cls: number): string {
  return type === ItemType.Software ? programClassName(cls) : chipName(cls);
}

/** Nejvyšší rating zdrojáku dané třídy, který hráč má (0 = žádný). */
export function maxSourceRating(ch: Character, type: ProjectType, cls: number): number {
  return ch.sources.filter((s) => s.type === type && s.cls === cls).reduce((m, s) => Math.max(m, s.rating), 0);
}

/**
 * NewProjectDlg FillInMisc: pracnost nového projektu.
 * Upgrade nad nejlepší zdroják: složitost × (nový² − starý²).
 * Downgrade: složitost × (rating zdroje − cíl), kde zdroj je poslední vhodný zdroják v seznamu
 * s ratingem v intervalu <cíl, max) (jinak max); nejméně projects.minWork.
 */
export function projectWork(cfg: RulesConfig, ch: Character, type: ProjectType, cls: number, rating: number): number {
  const complexity = complexityOf(cfg, type, cls);
  const max = maxSourceRating(ch, type, cls);
  if (rating > max) return complexity * rating * rating - complexity * max * max;
  let bestFit = max;
  for (const s of ch.sources) {
    if (s.type === type && s.cls === cls && s.rating >= rating && s.rating < max) bestFit = s.rating;
  }
  return Math.max(complexity * (bestFit - rating), cfg.projects.minWork);
}

export function daysForWork(ch: Character, type: ProjectType, work: number): number {
  const speed = projectSpeed(ch, type);
  return idiv(work + speed - 1, speed);
}

/** Nejvyšší rating, který jde vyvíjet = dovednost. */
export function maxProjectRating(ch: Character, type: ProjectType): number {
  return projectSkill(ch, type);
}

/** Třídy, které jdou vyvíjet (bez klientského programu). */
export function projectClasses(type: ProjectType): number[] {
  if (type === ItemType.Software) return [...Array(25).keys()];
  return [...Array(6).keys()];
}

export function startProject(cfg: RulesConfig, ch: Character, type: ProjectType, cls: number, rating: number): void {
  if (type === ItemType.Software && cls === ProgramClass.Client) throw new Error("Klientský program nejde vyvíjet");
  if (rating < 1 || rating > maxProjectRating(ch, type)) throw new Error("Rating mimo rozsah");
  const work = projectWork(cfg, ch, type, cls, rating);
  ch.project = { type, cls, rating, initialTime: work, timeLeft: work };
}

export function projectDaysLeft(ch: Character): number {
  if (!ch.project) return 0;
  return daysForWork(ch, ch.project.type, ch.project.timeLeft);
}

export interface WorkResult {
  events: GameEvent[];
  gameOver: boolean;
  /** Projekt byl dokončen (úspěšně, nebo se našla chyba a pokračuje se). */
  completion: { success: boolean; message: string } | null;
}

/** ProjectDataDlg OnProjWorkDay / OnProjWorkWeek / OnProjFinish */
export function workOnProject(ctx: Ctx, ch: Character, mode: "day" | "week" | "finish"): WorkResult {
  const p = ch.project;
  if (!p) throw new Error("Žádný projekt");
  const speed = projectSpeed(ch, p.type);
  const daysLeft = daysForWork(ch, p.type, p.timeLeft);
  let days: number;
  if (mode === "day") days = 1;
  else if (mode === "week") days = Math.min(ctx.cfg.time.daysPerWeek - ch.date.dayOfWeek, daysLeft);
  else days = daysLeft;

  const t = passTime(ctx, ch, days);
  if (t.gameOver) return { events: t.events, gameOver: true, completion: null };
  if (mode === "finish") p.timeLeft = 0;
  else p.timeLeft -= days * speed;
  let completion: WorkResult["completion"] = null;
  if (p.timeLeft <= 0) completion = completeProject(ctx, ch);
  return { events: t.events, gameOver: false, completion };
}

/** ProjectDataDlg DoCompleteProject: hod na dokončení, při neúspěchu další kolo práce. */
export function completeProject(ctx: Ctx, ch: Character): { success: boolean; message: string } {
  const p = ch.project!;
  const pr = ctx.cfg.projects;
  const target = pr.successBase + p.rating - (projectSkill(ch, p.type) + ch.hardware[HardwareType.DesignAssistant]!);
  if (doDieRoll(ctx, target) > 0) {
    ch.sources.push({ id: ch.nextId++, type: p.type, cls: p.cls, rating: p.rating });
    ch.project = null;
    return { success: true, message: "Your project is now complete." };
  }
  p.initialTime = idiv(p.initialTime + pr.failureWorkDivisor - 1, pr.failureWorkDivisor);
  p.timeLeft = p.initialTime;
  return { success: false, message: "You have discovered a flaw in your code. Additional time will be required." };
}

/** Lze nový program po překladu rovnou nahrát, aniž by se přetížil deck? */
export function canLoadBuiltProgram(cfg: RulesConfig, ch: Character, src: Source): boolean {
  return ch.currentLoad + programSize(cfg, src.cls, src.rating) <= loadRatings(cfg, ch).max;
}

export interface BuildOptions {
  name: string;
  load: boolean;
  /** Smazat starší programy stejné třídy s nižším nebo stejným ratingem. */
  trash: boolean;
  /** Jen je přestat nahrávat. */
  unload: boolean;
}

/** ProjectDataDlg OnProjBuild (program): přeloží zdroják na program. */
export function buildProgram(cfg: RulesConfig, ch: Character, sourceId: number, opts: BuildOptions): Program {
  const src = ch.sources.find((s) => s.id === sourceId);
  if (!src || src.type !== ItemType.Software) throw new Error("Neplatný zdroják");
  if (!opts.name) throw new Error("Please enter a name.");
  const allowLoad = canLoadBuiltProgram(cfg, ch, src);
  const load = allowLoad && opts.load;
  const prog: Program = {
    id: ch.nextId++,
    name: opts.name,
    cls: src.cls,
    rating: src.rating,
    loadByDefault: load,
    loadedRating: 0,
    sound: src.cls,
  };
  // Vloží se před první program stejné třídy, jinak na konec.
  const at = ch.software.findIndex((p) => p.cls === prog.cls);
  if (at === -1) {
    ch.software.push(prog);
  } else {
    ch.software.splice(at, 0, prog);
    if (load && (opts.trash || opts.unload)) {
      const replaceDefault = (old: Program) => {
        for (const slot of Object.keys(ch.defaults) as DefaultSlot[]) {
          if (ch.defaults[slot] === old.id) {
            ch.defaults[slot] = prog.id;
            break;
          }
        }
      };
      for (let i = at + 1; i < ch.software.length; ) {
        const old = ch.software[i]!;
        if (old.cls === prog.cls && old.rating <= prog.rating) {
          replaceDefault(old);
          if (opts.trash) {
            ch.software.splice(i, 1);
            continue;
          }
          old.loadByDefault = false;
        }
        i++;
      }
    }
  }
  calcCurrentLoad(cfg, ch);
  return prog;
}

export type BurnCheck = { ok: true; confirm?: string } | { ok: false; message: string };

/** ProjectDataDlg OnProjBuild (čip): kontroly před vypalováním. */
export function checkBurnChip(ch: Character, sourceId: number): BurnCheck {
  const src = ch.sources.find((s) => s.id === sourceId);
  if (!src || src.type !== ItemType.Chip) return { ok: false, message: "Neplatný zdroják" };
  if (ch.hardware[HardwareType.ChipBurner] === 0) return { ok: false, message: "You do not own a chip burner." };
  if (ch.chips[src.cls]! >= src.rating) return { ok: false, message: "This chip is lower than what is already installed." };
  if (ch.chipBurning) return { ok: true, confirm: "You already have a chip in production. Do you wish to cancel it?" };
  return { ok: true };
}

/** Spustí vypalování čipu: práce = složitost × rating, rychlost = úroveň Chip Burneru za den. */
export function burnChip(cfg: RulesConfig, ch: Character, sourceId: number): string {
  const check = checkBurnChip(ch, sourceId);
  if (!check.ok) throw new Error(check.message);
  const src = ch.sources.find((s) => s.id === sourceId)!;
  ch.chipBurning = { sourceId, timeLeft: chipComplexity(cfg, src.cls as ChipType) * src.rating };
  return "The chip is now cooking.";
}

export function chipBurnDaysLeft(ch: Character): number {
  if (!ch.chipBurning) return 0;
  const speed = ch.hardware[HardwareType.ChipBurner]!;
  return idiv(ch.chipBurning.timeLeft + speed - 1, speed);
}

export function trashSource(ch: Character, sourceId: number): void {
  if (ch.chipBurning?.sourceId === sourceId) throw new Error("That source is currently being used to burn a chip.");
  ch.sources = ch.sources.filter((s) => s.id !== sourceId);
}
