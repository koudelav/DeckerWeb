// Vstup do Matrixu – runy přijdou ve fázi 5 a 6.
import { contractTypeText } from "../../core/contract";
import type { App } from "../app";
import { h } from "../dom";
import { viewTitle } from "./home";

export function renderMatrix(app: App): HTMLElement {
  const ch = app.game!.character;
  return h("section", null,
    viewTitle("Enter the Matrix"),
    h("div", { class: "panel" },
      ch.currentContract
        ? h("p", { class: "lead" }, `Contract ready: ${contractTypeText(ch.currentContract)} at ${ch.currentContract.systemName}.`)
        : h("p", { class: "lead" }, "No contract has been accepted."),
      h("p", { class: "muted" }, "Runs in the Matrix aren't in this build yet. They come in the next stage of the remaster."),
      h("button", { class: "primary", disabled: true }, "Jack in"),
      ch.currentContract ? null : h("p", null, h("button", { class: "link", onclick: () => app.show("contracts") }, "Find a contract")),
    ),
  );
}
