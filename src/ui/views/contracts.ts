// Kontrakty (ContractListDialog, ContractDataDialog).
import { cancelContract } from "../../core/character";
import { ContractFlag } from "../../core/constants";
import { acceptContract, contractDescription, contractTypeText, difficultyPercent } from "../../core/contract";
import type { Contract } from "../../core/state";
import { actionButton, type App } from "../app";
import { credits, h, plural } from "../dom";
import { confirmDialog } from "../modal";
import { viewTitle } from "./home";

function details(c: Contract): HTMLElement {
  return h("dl", { class: "facts" },
    h("dt", null, "Target"), h("dd", null, `${c.systemName} (system ${c.systemSize})`),
    h("dt", null, "Mission"), h("dd", null, contractTypeText(c)),
    h("dt", null, "Difficulty"), h("dd", null, `${difficultyPercent(c)}%`),
    h("dt", null, "Deadline"), h("dd", null, plural(c.daysLeft, "day")),
    h("dt", null, "Pay"), h("dd", { class: "amount" }, credits(c.pay)),
  );
}

export function renderContracts(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const cur = ch.currentContract;
  if (cur) {
    return h("section", null,
      viewTitle("Current contract"),
      h("div", { class: "panel contract" },
        h("p", { class: "lead" }, contractDescription(cur)),
        details(cur),
        h("div", { class: "dialog-actions start" },
          h("button", { class: "primary", onclick: () => app.show("matrix") }, "Go to the Matrix"),
          actionButton(app, "Cancel contract", async () => {
            const ok = await confirmDialog(
              `Cancel this contract? Your reputation drops by ${Math.round(cur.difficulty * g.cfg.contracts.cancelRepPenaltyFactor)} points, the same as missing the deadline.`,
              { yes: "Cancel contract", no: "Keep it" },
            );
            if (ok) return cancelContract(g.cfg, ch);
          }),
        ),
      ),
    );
  }
  const sel = (app.ui.contractSel as number | undefined) ?? -1;
  const selected = ch.contracts[sel];
  return h("section", null,
    viewTitle("Contracts"),
    ch.contracts.length === 0
      ? h("p", { class: "panel note" }, "No contracts on offer. New ones come in every week.")
      : h("div", { class: "panel" },
        h("p", { class: "muted" },
          "Offers expire, but pay rises 10% for every day you wait. Codes after the mission type: a number is the count of targets, N means no alarms allowed, T means timed."),
        h("div", { class: "table-wrap" }, h("table", { class: "table selectable" },
          h("thead", null, h("tr", null,
            h("th", null, "Mission"), h("th", { class: "num" }, "Difficulty"), h("th", null, "Target"),
            h("th", { class: "num" }, "Deadline"), h("th", { class: "num" }, "Pay"),
          )),
          h("tbody", null, ch.contracts.map((c, i) => h("tr", {
            "aria-selected": i === sel ? "true" : "false",
            tabindex: 0,
            dataset: { focus: `contract-${i}` },
            onclick: () => { app.ui.contractSel = i; app.render(); },
            onkeydown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); app.ui.contractSel = i; app.render(); } },
          },
            h("td", null, contractTypeText(c)),
            h("td", { class: "num" }, `${difficultyPercent(c)}%`),
            h("td", null, `${c.systemName} (${c.systemSize})`),
            h("td", { class: "num" }, plural(c.daysLeft, "day")),
            h("td", { class: "num amount" }, credits(c.pay)),
          ))),
        )),
      ),
    selected
      ? h("div", { class: "panel contract" },
        h("h2", null, contractTypeText(selected)),
        h("p", { class: "lead" }, contractDescription(selected)),
        details(selected),
        selected.flags & ContractFlag.Timed ? h("p", { class: "warn" }, "Timed: the clock starts when you enter the system.") : null,
        h("div", { class: "dialog-actions start" },
          actionButton(app, "Accept contract", () => {
            acceptContract(g, ch, sel);
            delete app.ui.contractSel;
          }, { primary: true }),
        ),
      )
      : ch.contracts.length ? h("p", { class: "muted" }, "Pick a contract to see the details.") : null,
  );
}
