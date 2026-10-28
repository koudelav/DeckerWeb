// Nastavení a ukládání (COptionsDlg).
import { AUTOSAVE_ID, exportGame, listSaves, saveToSlot, storageAvailable } from "../../storage";
import type { App } from "../app";
import { h } from "../dom";
import { confirmDialog, message, promptText } from "../modal";
import { setSoundEnabled, soundEnabled } from "../sound";
import { importButton, saveList } from "./saves";
import { viewTitle } from "./home";

export function renderOptions(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const ironRun = ch.ironMan && ch.onRun;
  const save = async () => {
    if (ironRun) return message("Ironmen don't need to save in the matrix.");
    const name = await promptText("Save game", "Name of the save", ch.name);
    if (!name) return;
    const existing = listSaves().find((s) => s.label === name && s.id !== AUTOSAVE_ID);
    if (existing && !(await confirmDialog(`Overwrite the save "${name}"?`))) return;
    try {
      saveToSlot(g, existing?.id ?? null, name);
      await message("The game has been saved.");
    } catch (e) {
      await message((e as Error).message);
    }
    app.render();
  };
  return h("section", null,
    viewTitle("Options"),
    h("div", { class: "columns" },
      h("div", { class: "panel" },
        h("h2", null, "Saved games"),
        h("p", { class: "muted" }, "Games are kept in this browser and saved automatically after every action. Export a file now and then: browser storage can be cleared."),
        h("div", { class: "button-row" },
          h("button", { class: "primary", disabled: !storageAvailable(), onclick: () => void save() }, "Save game"),
          h("button", { onclick: () => exportGame(g) }, "Export to file"),
          importButton(app, { confirmLoad: true }),
        ),
        saveList(app, { confirmLoad: true }),
      ),
      h("div", { class: "panel" },
        h("h2", null, "Game"),
        h("label", { class: "choice" },
          h("input", { type: "checkbox", checked: soundEnabled(), onchange: (e: Event) => setSoundEnabled((e.target as HTMLInputElement).checked) }),
          h("span", null, h("strong", null, "Sound effects")),
        ),
        h("p", { class: "muted" }, "Keys 1 to 8 switch between the sections."),
        h("div", { class: "button-row" },
          h("button", { onclick: async () => {
            if (await confirmDialog("Start a new game? The current game stays in your saves only if you saved it.")) app.go("newChar");
          } }, "New game"),
          h("button", { onclick: async () => {
            if (await confirmDialog("Quit to the title screen?")) { app.game = null; app.go("intro"); }
          } }, "Quit to title"),
        ),
      ),
    ),
  );
}
