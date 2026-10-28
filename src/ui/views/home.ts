// Domovská obrazovka (HomeView): readout decku, lišta sekcí, obsah sekce.
import { lifestyleName, repCap } from "../../core/character";
import { REP_LEVEL_NAMES } from "../../core/data/texts";
import { formatDate } from "../../core/character";
import { contractTypeText } from "../../core/contract";
import type { App, View } from "../app";
import { credits, h } from "../dom";
import { pixelImg, STRIPS, sprite } from "../sprites";
import { renderCharacter } from "./character";
import { renderContracts } from "./contracts";
import { renderDeck } from "./deck";
import { renderMatrix } from "./matrix";
import { renderOptions } from "./options";
import { renderProjects } from "./projects";
import { renderRest } from "./rest";
import { renderShop } from "./shop";

const SECTIONS: { view: View; label: string; icon: string }[] = [
  { view: "character", label: "Character", icon: "HOME_Char0" },
  { view: "deck", label: "Cyberdeck", icon: "HOME_Deck0" },
  { view: "contracts", label: "Contracts", icon: "HOME_Contract0" },
  { view: "shop", label: "Shop", icon: "HOME_Shop0" },
  { view: "projects", label: "Projects", icon: "HOME_Project0" },
  { view: "rest", label: "Rest", icon: "HOME_Rest0" },
  { view: "matrix", label: "Matrix", icon: "HOME_Matrix0" },
  { view: "options", label: "Options", icon: "HOME_Options0" },
];

let keysBound = false;

export function renderHome(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  if (!keysBound) {
    keysBound = true;
    // Klávesové zkratky 1–8 pro sekce (To-Do originálu: hotkeys pro všechny akce)
    window.addEventListener("keydown", (e) => {
      if (app.screen !== "home" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= SECTIONS.length) {
        e.preventDefault();
        app.show(SECTIONS[n - 1]!.view);
      }
    });
  }
  const healthPct = Math.round((ch.health.physical / g.cfg.health.max) * 100);
  const atCap = ch.repLevel >= repCap(g.cfg, ch);
  const readout = h("header", { class: "readout" },
    h("div", { class: "readout-id" },
      sprite(STRIPS.characters, ch.image, 2),
      h("div", null,
        h("div", { class: "readout-name" }, ch.name, ch.ironMan ? h("span", { class: "tag" }, "Ironman") : null),
        h("div", { class: "muted" }, formatDate(ch.date)),
      ),
    ),
    h("dl", { class: "readout-stats" },
      h("div", { class: "stat stat-credits" }, h("dt", null, "Credits"), h("dd", null, credits(ch.credits))),
      h("div", { class: "stat" }, h("dt", null, "Lifestyle"), h("dd", null, lifestyleName(ch.lifestyle))),
      h("div", { class: "stat" }, h("dt", null, "Reputation"), h("dd", null, REP_LEVEL_NAMES[ch.repLevel], atCap ? " (max)" : "")),
      h("div", { class: "stat" },
        h("dt", null, "Health"),
        h("dd", null,
          h("span", { class: "meter", role: "meter", "aria-valuenow": healthPct, "aria-valuemin": 0, "aria-valuemax": 100 },
            h("span", { style: `width:${healthPct}%`, class: healthPct < 50 ? "low" : undefined })),
          ` ${healthPct}%`,
        ),
      ),
      h("div", { class: "stat stat-contract" },
        h("dt", null, "Contract"),
        h("dd", null, ch.currentContract
          ? h("button", { class: "link", onclick: () => app.show("contracts") },
            `${contractTypeText(ch.currentContract)}, ${ch.currentContract.daysLeft} d`)
          : h("span", { class: "muted" }, "none")),
      ),
    ),
  );
  const rail = h("nav", { class: "rail", "aria-label": "Sections" },
    SECTIONS.map((s, i) => h("button", {
      class: "rail-item",
      "aria-current": app.view === s.view ? "page" : undefined,
      title: `${s.label} (${i + 1})`,
      onclick: () => app.show(s.view),
    }, pixelImg(s.icon, 2), h("span", null, s.label))),
  );
  const views: Record<View, (a: App) => HTMLElement> = {
    character: renderCharacter, deck: renderDeck, contracts: renderContracts, shop: renderShop,
    projects: renderProjects, rest: renderRest, matrix: renderMatrix, options: renderOptions,
  };
  return h("div", { class: "home" }, readout, h("div", { class: "home-body" }, rail, h("main", { class: "view" }, views[app.view](app))));
}

/** Nadpis sekce s fokusem po přepnutí (pro čtečky). */
export function viewTitle(text: string, aside?: Node | string | null): HTMLElement {
  return h("div", { class: "view-head" }, h("h1", { tabindex: -1 }, text), aside ?? null);
}
