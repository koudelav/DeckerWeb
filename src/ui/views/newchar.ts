// Nová postava (NewCharDlg).
import { StartBonus } from "../../core/constants";
import { Game } from "../../core/game";
import type { App } from "../app";
import { h } from "../dom";
import { message } from "../modal";
import { STRIPS, sprite } from "../sprites";

interface Draft { name: string; image: number; bonus: StartBonus; ironMan: boolean }

const BONUSES: { value: StartBonus; label: string; detail: string }[] = [
  { value: StartBonus.None, label: "None (Tough Guy)", detail: "No head start." },
  { value: StartBonus.Skills, label: "Skills", detail: "All six skills start at 2." },
  { value: StartBonus.Hardware, label: "Hardware", detail: "All deck chips start at 2." },
  { value: StartBonus.Software, label: "Software", detail: "Starting programs are rating 2." },
  { value: StartBonus.Money, label: "Money", detail: "Start with 2,000 credits." },
];

export function renderNewCharacter(app: App): HTMLElement {
  const d = (app.ui.newChar ??= { name: "Hacker X", image: 0, bonus: StartBonus.None, ironMan: false }) as Draft;
  const count = STRIPS.characters.count;
  const setImage = (delta: number) => {
    d.image = (d.image + delta + count) % count;
    app.render();
  };
  const nameInput = h("input", {
    type: "text", value: d.name, maxlength: 30, required: true, autofocus: true,
    oninput: (e: Event) => (d.name = (e.target as HTMLInputElement).value),
  });
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!d.name.trim()) {
      await message("You need to enter a name.");
      return;
    }
    const game = Game.newGame({ name: d.name.trim(), image: d.image, ironMan: d.ironMan, tooltips: false, bonus: d.bonus });
    delete app.ui.newChar;
    app.startGame(game);
  };
  return h("main", { class: "newchar" },
    h("form", { class: "panel newchar-form", onsubmit: submit },
      h("h1", null, "New character"),
      h("label", { class: "field" }, h("span", null, "Name"), nameInput),
      h("div", { class: "field" },
        h("span", null, "Image"),
        h("div", { class: "portrait-pick" },
          h("button", { type: "button", class: "quiet", "aria-label": "Previous image", onclick: () => setImage(-1) }, "‹"),
          sprite(STRIPS.characters, d.image, 3, `Image ${d.image + 1} of ${count}`),
          h("button", { type: "button", class: "quiet", "aria-label": "Next image", onclick: () => setImage(1) }, "›"),
        ),
      ),
      h("fieldset", { class: "field" },
        h("legend", null, "Starting bonus"),
        BONUSES.map((b) => h("label", { class: "choice" },
          h("input", { type: "radio", name: "bonus", checked: d.bonus === b.value, onchange: () => (d.bonus = b.value) }),
          h("span", null, h("strong", null, b.label), h("span", { class: "muted" }, b.detail)),
        )),
      ),
      h("label", { class: "choice" },
        h("input", { type: "checkbox", checked: d.ironMan, onchange: (e: Event) => (d.ironMan = (e.target as HTMLInputElement).checked) }),
        h("span", null, h("strong", null, "Ironman mode"), h("span", { class: "muted" }, "No saving inside the Matrix.")),
      ),
      h("div", { class: "dialog-actions" },
        h("button", { type: "button", onclick: () => app.go(app.game ? "home" : "intro") }, "Cancel"),
        h("button", { type: "submit", class: "primary" }, "Start"),
      ),
    ),
  );
}
