// Seznam uložených her (intro i Options).
import type { Game } from "../../core/game";
import { AUTOSAVE_ID, deleteSlot, exportGame, importGame, importGameText, listSaves, loadFromSlot, saveCode, storageAvailable } from "../../storage";
import type { App } from "../app";
import { h } from "../dom";
import { confirmDialog, message, openDialog } from "../modal";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function saveList(app: App, opts: { confirmLoad: boolean }): HTMLElement {
  if (!storageAvailable()) {
    return h("p", { class: "note" }, "This browser blocks local storage, so games can't be kept here. Use export and import instead.");
  }
  const saves = listSaves();
  if (saves.length === 0) return h("p", { class: "note" }, "No saved games in this browser yet.");
  const load = async (id: string) => {
    if (opts.confirmLoad && !(await confirmDialog("Are you sure you want to lose the current game?"))) return;
    try {
      app.startGame(loadFromSlot(id), id);
    } catch (e) {
      await message((e as Error).message);
    }
  };
  return h("ul", { class: "save-list" }, saves.map((s) =>
    h("li", null,
      h("button", { class: "save-load", onclick: () => void load(s.id) },
        h("strong", null, s.id === AUTOSAVE_ID ? `${s.characterName} (autosave)` : s.label),
        h("span", { class: "muted" }, when(s.savedAt)),
      ),
      h("button", {
        class: "quiet",
        "aria-label": `Delete ${s.label}`,
        onclick: async () => {
          if (await confirmDialog(`Delete the saved game "${s.label}"?`)) {
            deleteSlot(s.id);
            app.render();
          }
        },
      }, "Delete"),
    ),
  ));
}

export function importButton(app: App, opts: { confirmLoad: boolean }): HTMLElement {
  const input = h("input", {
    type: "file",
    accept: ".json,application/json",
    class: "visually-hidden",
    onchange: async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      if (opts.confirmLoad && !(await confirmDialog("Are you sure you want to lose the current game?"))) return;
      try {
        app.startGame(await importGame(file));
      } catch (e) {
        await message((e as Error).message);
      }
    },
  });
  return h("label", { class: "button" }, "Import from file", input);
}

/** Vložení savu jako textu (protějšek „Copy save code“). */
export function pasteButton(app: App, opts: { confirmLoad: boolean }): HTMLElement {
  const run = async () => {
    const text = await openDialog<string | null>("Paste a save code", (close) => {
      const ta = h("textarea", { id: "paste-save", class: "save-code", rows: 8, "aria-label": "Save code", placeholder: '{"format":"decker-remaster",...}' });
      return [
        h("p", { class: "muted" }, "Paste the text you copied with “Copy save code”, or the contents of an exported file."),
        ta,
        h("div", { class: "dialog-actions" },
          h("button", { onclick: () => close(null) }, "Cancel"),
          h("button", { class: "primary", onclick: () => close(ta.value) }, "Load game")),
      ];
    }, null);
    if (!text?.trim()) return;
    if (opts.confirmLoad && !(await confirmDialog("Are you sure you want to lose the current game?"))) return;
    try {
      app.startGame(importGameText(text));
    } catch (e) {
      await message((e as Error).message);
    }
  };
  return h("button", { onclick: () => void run() }, "Paste save code");
}

/** Export: soubor ke stažení, nebo text ke zkopírování (stahování může prohlížeč zablokovat). */
export function exportDialog(game: Game): Promise<void> {
  const code = saveCode(game);
  return openDialog<void>("Export the game", (close) => {
    const ta = h("textarea", { id: "export-save", class: "save-code", rows: 6, readonly: true, "aria-label": "Save code" }, code);
    const status = h("span", { class: "muted", role: "status" });
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(code);
        status.textContent = "Copied.";
      } catch {
        ta.focus();
        ta.select();
        status.textContent = "Select all and copy the text by hand (Ctrl+C).";
      }
    };
    return [
      h("p", null, "Keep a copy of your game outside this browser. Download it as a file, or copy the save code and keep it in any text file. Load it again with “Import from file” or “Paste save code”."),
      ta,
      h("div", { class: "dialog-actions" },
        status,
        h("button", {
          onclick: async () => {
            const r = await exportGame(game);
            if (r === "unavailable") status.textContent = "Downloads are blocked here. Copy the save code instead.";
          },
        }, "Download file"),
        h("button", { class: "primary", onclick: () => void copy() }, "Copy save code"),
        h("button", { onclick: () => close() }, "Close")),
    ];
  }, undefined);
}
