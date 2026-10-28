// Seznam uložených her (intro i Options).
import { AUTOSAVE_ID, deleteSlot, importGame, listSaves, loadFromSlot, storageAvailable } from "../../storage";
import type { App } from "../app";
import { h } from "../dom";
import { confirmDialog, message } from "../modal";

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
      app.startGame(loadFromSlot(id));
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
