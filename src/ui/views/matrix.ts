// Vstup do Matrixu (CHomeView::OnMatrix).
import { contractDescription, contractTypeText } from "../../core/contract";
import type { App } from "../app";
import { h } from "../dom";
import { confirmDialog, message } from "../modal";
import { playSound } from "../sound";
import { viewTitle } from "./home";

async function jackIn(app: App): Promise<void> {
  const g = app.game!;
  const c = g.character.currentContract;
  if (!c) {
    await message("No contract has been accepted.");
    return;
  }
  const backdoor = (g.character.backdoor[c.corporation] ?? 0) > 0 &&
    (await confirmDialog("You have a backdoor to this system. Use it?"));
  const run = g.jackIn(backdoor);
  const out = run.drain();
  for (const s of out.sounds) playSound(s);
  delete app.ui.matrix;
  app.screen = "matrix";
  app.save();
  app.render();
}

export function renderMatrix(app: App): HTMLElement {
  const ch = app.game!.character;
  const c = ch.currentContract;
  return h("section", null,
    viewTitle("Enter the Matrix"),
    h("div", { class: "panel" },
      c
        ? [
          h("p", { class: "lead" }, `${contractTypeText(c)} at ${c.systemName}`),
          h("p", null, contractDescription(c)),
        ]
        : h("p", { class: "lead" }, "No contract has been accepted."),
      h("p", { class: "muted" }, "Your deck and mind start the run at full strength; your body does not."),
      h("button", { class: "primary", disabled: !c, onclick: () => void jackIn(app) }, "Jack in"),
      c ? null : h("p", null, h("button", { class: "link", onclick: () => app.show("contracts") }, "Find a contract")),
    ),
  );
}
