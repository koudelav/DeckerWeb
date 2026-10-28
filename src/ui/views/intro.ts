// Úvodní obrazovka (IntroDlg).
import type { App } from "../app";
import { h } from "../dom";
import { pixelImg } from "../sprites";
import { importButton, saveList } from "./saves";

export function renderIntro(app: App): HTMLElement {
  return h("main", { class: "intro" },
    h("div", { class: "intro-title" },
      pixelImg("Title", 3, "Decker"),
      h("p", { class: "intro-sub" }, "A cyberspace RPG. Remaster of version 1.12."),
    ),
    h("div", { class: "intro-actions" },
      h("button", { class: "primary big", onclick: () => app.go("newChar") }, "New game"),
      importButton(app, { confirmLoad: false }),
    ),
    h("section", { class: "intro-saves", "aria-labelledby": "saves-h" },
      h("h2", { id: "saves-h" }, "Continue a saved game"),
      saveList(app, { confirmLoad: false }),
    ),
    h("p", { class: "credit" },
      "Original game by Shawn Overcash, 2001. Free software under the GNU GPL v2.",
    ),
  );
}
