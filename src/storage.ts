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
    throw new SaveError(`The game can't be saved in this browser: ${(e as Error).message}`);
  }
  return slotId;
}

export function loadFromSlot(id: string): Game {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PREFIX + "save:" + id);
  } catch {
    throw new SaveError("Browser storage isn't available.");
  }
  if (!raw) throw new SaveError("The saved game was not found.");
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
interface DownloadsNs { save(r: { filename: string; data: string | Blob }): Promise<unknown> }
interface ClaudeRuntime { use(name: "downloads"): Promise<DownloadsNs | null> }

/**
 * Stáhne save jako soubor. V artefaktu na claude.ai přes schopnost `downloads` (prohlížeč se zeptá),
 * jinde přes odkaz ke stažení. Vrací "saved", "declined" nebo "unavailable".
 */
export async function exportGame(game: Game): Promise<"saved" | "declined" | "unavailable"> {
  const data = game.toSave();
  const text = JSON.stringify(data, null, 1);
  const claude = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (claude?.use) {
    const downloads = await claude.use("downloads").catch(() => null);
    if (!downloads) return "unavailable";
    try {
      await downloads.save({ filename: exportFileName(data), data: text });
      return "saved";
    } catch (e) {
      return (e as { code?: string }).code === "declined" ? "declined" : "unavailable";
    }
  }
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(data);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "saved";
}

/** Save jako text (kopírování tam, kde prohlížeč nedovolí stahovat soubory – např. v artefaktu). */
export function saveCode(game: Game): string {
  return JSON.stringify(game.toSave());
}

/** Načte hru ze souboru (export). */
export async function importGame(file: File): Promise<Game> {
  return importGameText(await file.text());
}

/** Načte hru z textu savu (soubor nebo vložený kód). */
export function importGameText(text: string): Game {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw new SaveError("This is not a Decker save: the text isn't valid JSON.");
  }
  validateSave(parsed);
  return Game.fromSave(parsed);
}
