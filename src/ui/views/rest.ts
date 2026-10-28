// Odpočinek (CRestDlg).
import { formatDate } from "../../core/character";
import { rest, restOptions, type RestAction } from "../../core/rest";
import type { App } from "../app";
import { credits, h, plural } from "../dom";
import { viewTitle } from "./home";

export function renderRest(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const o = restOptions(g.cfg, ch);
  const health = Math.round((ch.health.physical / g.cfg.health.max) * 100);
  const run = (a: RestAction) => app.act(async () => {
    await app.handleTime(rest(g, ch, a));
  });
  const option = (title: string, detail: string, action: RestAction, enabled: boolean, key: string) =>
    h("li", { class: "rest-option" },
      h("div", null, h("strong", null, title), h("span", { class: "muted" }, detail)),
      h("button", { disabled: !enabled, dataset: { focus: key }, onclick: () => void run(action) }, "Do it"),
    );
  return h("section", null,
    viewTitle("Rest and recuperate"),
    h("div", { class: "panel" },
      h("p", { class: "lead" }, `${formatDate(ch.date)}. Health ${health}%.`),
      o.damage === 0 ? h("p", { class: "muted" }, "You are in full health. You can still let time pass.") : null,
      h("ul", { class: "rest-list" },
        option("Rest at home", `Heal 1 point in ${plural(o.homeDays, "day")}`, "heal", o.canHeal, "r1"),
        option("Rest at home until healed", `${plural(o.homeAllDays, "day")}`, "healAll", o.canHeal, "r2"),
        option("Hospital", `Heal 1 point in ${plural(o.hospitalDays, "day")} for ${credits(o.hospitalCost)}`, "hospital", o.canHospital, "r3"),
        option("Hospital until healed", `${plural(o.hospitalAllDays, "day")} for ${credits(o.hospitalAllCost)}`, "hospitalAll", o.canHospitalAll, "r4"),
        option("Wait a day", "Let one day pass", "wait", true, "r5"),
      ),
      o.damage === 1 ? h("p", { class: "muted" }, "The hospital takes patients missing at least 2 health points.") : null,
    ),
  );
}
