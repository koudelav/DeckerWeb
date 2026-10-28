// Ukládání her v prohlížeči (localStorage) a export/import do souboru.
// localStorage patří jednomu prohlížeči a může zmizet (anonymní okno, smazání dat) –
// proto export do souboru jako záloha. Každý přístup je v try/catch.

import { Game, SaveError, validateSave, type SaveData } from "./core/game";

const PREFIX = "decker-remaster:";
const INDEX_KEY = PREFIX + "saves";
export const AUTOSAVE_ID = "autosave";

export interface SaveSlot {
  id: string;
  label: string;
  characterName: string;
  savedAt: string;
  ironMan: boolean;
}

function readIndex(): SaveSlot[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as SaveSlot[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SaveSlot[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

export function storageAvailable(): boolean {
  try {
    const k = PREFIX + "test";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Seznam uložených her, nejnovější první. */
export function listSaves(): SaveSlot[] {
  return readIndex().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Uloží hru do slotu (id null = nový slot). Vrací id slotu. Vyhodí chybu, když úložiště nejde použít. */
export function saveToSlot(game: Game, id: string | null, label?: string): string {
  const data = game.toSave();
  const slotId = id ?? `s${Date.now().toString(36)}`;
  try {
    localStorage.setItem(PREFIX + "save:" + slotId, JSON.stringify(data));
    const list = readIndex().filter((s) => s.id !== slotId);
    list.push({
      id: slotId,
      label: label ?? (slotId === AUTOSAVE_ID ? "Automatické uložení" : data.character.name),
      characterName: data.character.name,
      savedAt: data.savedAt,
      ironMan: data.character.ironMan,
    });
    writeIndex(list);
  } catch (e) {
    throw new SaveError(`Hru nejde uložit do prohlížeče: ${(e as Error).message}`);
  }
  return slotId;
}

export function loadFromSlot(id: string): Game {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PREFIX + "save:" + id);
  } catch {
    throw new SaveError("Úložiště prohlížeče není dostupné.");
  }
  if (!raw) throw new SaveError("Uložená hra nenalezena.");
  return Game.fromSave(JSON.parse(raw));
}

export function deleteSlot(id: string): void {
  try {
    localStorage.removeItem(PREFIX + "save:" + id);
    writeIndex(readIndex().filter((s) => s.id !== id));
  } catch {
    /* nic */
  }
}

/** Název souboru pro export. */
export function exportFileName(data: SaveData): string {
  const safe = data.character.name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || "decker";
  return `${safe}-${data.savedAt.slice(0, 10)}.decker.json`;
}

/** Stáhne uloženou hru jako soubor. */
export function exportGame(game: Game): void {
  const data = game.toSave();
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(data);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Načte hru ze souboru (export). */
export async function importGame(file: File): Promise<Game> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new SaveError("Soubor není platný JSON.");
  }
  validateSave(parsed);
  return Game.fromSave(parsed);
}
