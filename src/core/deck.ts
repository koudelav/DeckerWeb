// Správa decku: nahrávání programů, výchozí programy, pořadí, mazání.
// Originál: DeckDataDialog.cpp. Kuchařka: docs/pravidla/02-postava.md

import type { RulesConfig } from "./config";
import { calcCurrentLoad, defaultLoad, defaultSlotFor, loadRatings } from "./character";
import { programSize } from "./program";
import type { Character, DefaultSlot, Program } from "./state";

function get(ch: Character, id: number): Program {
  const p = ch.software.find((x) => x.id === id);
  if (!p) throw new Error("Program nenalezen");
  return p;
}

function clearDefaultFor(ch: Character, id: number): void {
  for (const slot of Object.keys(ch.defaults) as DefaultSlot[]) if (ch.defaults[slot] === id) ch.defaults[slot] = null;
}

/** Vejde se program do decku? (limit = max. zatížení) */
export function fitsInDeck(cfg: RulesConfig, ch: Character, p: Program): boolean {
  return defaultLoad(cfg, ch) + programSize(cfg, p.cls, p.rating) <= loadRatings(cfg, ch).max;
}

/** OnDeckLoad: přepne nahrávání. Odnahrání zruší i výchozí volbu. Vrací chybovou hlášku nebo null. */
export function toggleLoad(cfg: RulesConfig, ch: Character, id: number): string | null {
  if (ch.onRun) return "Not available during a run.";
  const p = get(ch, id);
  if (p.loadByDefault) {
    p.loadByDefault = false;
    clearDefaultFor(ch, id);
  } else {
    if (!fitsInDeck(cfg, ch, p)) return "This would overload your deck.";
    p.loadByDefault = true;
  }
  calcCurrentLoad(cfg, ch);
  return null;
}

/** Programy, které mohou být výchozí (útok, štít, brnění, hide, reflect). */
export function canBeDefault(p: Program): boolean {
  return defaultSlotFor(p.cls) !== null;
}

/** OnDeckDefault: nastaví výchozí program pro jeho slot a případně ho nahraje. */
export function setDefault(cfg: RulesConfig, ch: Character, id: number): string | null {
  if (ch.onRun) return "Not available during a run.";
  const p = get(ch, id);
  const slot = defaultSlotFor(p.cls);
  if (!slot) return null;
  if (!p.loadByDefault && !fitsInDeck(cfg, ch, p)) return "This would overload your deck.";
  ch.defaults[slot] = p.id;
  p.loadByDefault = true;
  calcCurrentLoad(cfg, ch);
  return null;
}

/** OnDeckClear: nic se nenahrává, žádné výchozí programy. */
export function clearLoads(cfg: RulesConfig, ch: Character): void {
  for (const p of ch.software) p.loadByDefault = false;
  for (const slot of Object.keys(ch.defaults) as DefaultSlot[]) ch.defaults[slot] = null;
  calcCurrentLoad(cfg, ch);
}

/** OnDeckUp / OnDeckDown */
export function moveProgram(ch: Character, id: number, delta: -1 | 1): void {
  const i = ch.software.findIndex((p) => p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ch.software.length) return;
  [ch.software[i], ch.software[j]] = [ch.software[j]!, ch.software[i]!];
}

/** OnDeckTrash */
export function trashProgram(cfg: RulesConfig, ch: Character, id: number): void {
  if (ch.onRun) return;
  clearDefaultFor(ch, id);
  ch.software = ch.software.filter((p) => p.id !== id);
  calcCurrentLoad(cfg, ch);
}

export function renameProgram(ch: Character, id: number, name: string): void {
  if (name.trim()) get(ch, id).name = name.trim();
}

export function setProgramSound(ch: Character, id: number, sound: number): void {
  get(ch, id).sound = sound;
}

export type SoftwareSort = "name" | "class" | "rating" | "size" | "load" | "default";

/** OnColumnclickDeckSoftware: seřadí seznam programů (trvale, jako originál). */
export function sortSoftware(cfg: RulesConfig, ch: Character, by: SoftwareSort): void {
  const key: Record<SoftwareSort, (p: Program) => number | string> = {
    name: (p) => p.name,
    class: (p) => p.cls,
    rating: (p) => p.rating,
    size: (p) => programSize(cfg, p.cls, p.rating),
    load: (p) => p.loadedRating,
    default: (p) => (p.loadByDefault ? 1 : 0),
  };
  const k = key[by];
  ch.software.sort((a, b) => {
    const x = k(a), y = k(b);
    return typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
  });
}
