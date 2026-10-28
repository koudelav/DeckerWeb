// Cyberdeck (DeckDataDialog).
import { defaultLoad, hardwareText, isDefaultProgram, loadRatings } from "../../core/character";
import { ChipType, NUM_HW } from "../../core/constants";
import { CHIP_NAMES } from "../../core/data/texts";
import { NUM_CUSTOM_SOUNDS, SOUND_CUSTOM1 } from "../../core/data/sounds";
import {
  canBeDefault, clearLoads, moveProgram, renameProgram, setDefault, setProgramSound, sortSoftware, toggleLoad,
  trashProgram, type SoftwareSort,
} from "../../core/deck";
import { programClassName, programSize } from "../../core/program";
import type { Program } from "../../core/state";
import { actionButton, type App } from "../app";
import { h } from "../dom";
import { confirmDialog, openDialog, promptText } from "../modal";
import { playSound } from "../sound";
import { STRIPS, sprite } from "../sprites";
import { viewTitle } from "./home";

const CHIP_ORDER = [ChipType.Cpu, ChipType.Coprocessor, ChipType.Attack, ChipType.Defense, ChipType.Stealth, ChipType.Analysis];

export function renderDeck(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const r = loadRatings(g.cfg, ch);
  const load = defaultLoad(g.cfg, ch);
  const loadLabel = load < r.light ? "light" : load > r.heavy ? "heavy" : "average";
  const pct = (v: number) => `${(v / r.max) * 100}%`;
  const hw = [...Array(NUM_HW).keys()].filter((i) => ch.hardware[i]! > 0);

  const header = (label: string, key: SoftwareSort, cls?: string) =>
    h("th", { class: cls }, h("button", {
      class: "sort",
      title: `Sort by ${label.toLowerCase()}`,
      onclick: () => void app.act(() => sortSoftware(g.cfg, ch, key)),
    }, label));

  return h("section", null,
    viewTitle("Cyberdeck", h("button", { class: "quiet", onclick: () => app.show("character") }, "View character")),
    h("div", { class: "columns" },
      h("div", { class: "panel" },
        h("h2", null, "Chips"),
        h("dl", { class: "chip-grid" }, CHIP_ORDER.map((c) =>
          h("div", null, h("dt", null, CHIP_NAMES[c]), h("dd", { class: "big-num" }, ch.chips[c])))),
        h("p", { class: "muted" }, "Firmware works up to the level of your CPU."),
      ),
      h("div", { class: "panel" },
        h("h2", null, "Hardware"),
        hw.length
          ? h("ul", { class: "plain" }, hw.map((i) => h("li", null, hardwareText(i, ch.hardware[i]!))))
          : h("p", { class: "muted" }, "No extra hardware yet. The shop sells it."),
      ),
    ),
    h("div", { class: "panel" },
      h("h2", null, "Memory load"),
      h("div", { class: "loadbar", role: "img", "aria-label": `${load} of ${r.max} MP loaded, ${loadLabel}` },
        h("span", { class: "zone light", style: `width:${pct(r.light)}` }),
        h("span", { class: "zone avg", style: `width:${pct(r.heavy - r.light + 1)}` }),
        h("span", { class: "zone heavy", style: `width:${pct(r.max - r.heavy - 1)}` }),
        h("span", { class: `fill ${loadLabel}`, style: `width:${pct(Math.min(load, r.max))}` }),
      ),
      h("p", null,
        h("strong", null, `${load} MP (${loadLabel})`),
        h("span", { class: "muted" }, `  Light under ${r.light} MP gives +1 to all ratings, heavy over ${r.heavy} MP gives −2. Maximum ${r.max} MP.`),
      ),
    ),
    h("div", { class: "panel" },
      h("div", { class: "panel-head" },
        h("h2", null, "Software"),
        actionButton(app, "Unload all", async () => {
          if (await confirmDialog("Unload every program and clear the defaults?")) clearLoads(g.cfg, ch);
        }, { disabled: ch.software.length === 0 }),
      ),
      h("p", { class: "muted" }, "Loaded programs go with you into the Matrix. A default program runs on its own when you enter."),
      h("div", { class: "table-wrap" }, h("table", { class: "table software" },
        h("thead", null, h("tr", null,
          header("Name", "name"), header("Class", "class"), header("Rating", "rating", "num"), header("Size", "size", "num"),
          header("Load", "load"), header("Default", "default"), h("th", null, h("span", { class: "visually-hidden" }, "Actions")),
        )),
        h("tbody", null, ch.software.map((p, i) => programRow(app, p, i))),
      )),
    ),
  );
}

function programRow(app: App, p: Program, i: number): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const isDef = isDefaultProgram(ch, p);
  return h("tr", null,
    h("td", null, h("span", { class: "with-icon" }, sprite(STRIPS.software, p.cls, 1), p.name)),
    h("td", null, programClassName(p.cls)),
    h("td", { class: "num" }, p.rating),
    h("td", { class: "num" }, `${programSize(g.cfg, p.cls, p.rating)} MP`),
    h("td", null, h("label", { class: "switch" },
      h("input", {
        type: "checkbox", checked: p.loadByDefault, dataset: { focus: `load-${p.id}` },
        onchange: () => void app.act(() => toggleLoad(g.cfg, ch, p.id) ?? undefined),
      }),
      h("span", { class: "visually-hidden" }, `Load ${p.name}`),
    )),
    h("td", null, canBeDefault(p)
      ? (isDef ? h("span", { class: "tag on" }, "Default")
        : actionButton(app, "Make default", () => setDefault(g.cfg, ch, p.id) ?? undefined, { focus: `def-${p.id}` }))
      : h("span", { class: "muted" }, "–")),
    h("td", { class: "act" }, h("div", { class: "row-actions" },
      h("button", { class: "quiet icon", "aria-label": `Move ${p.name} up`, disabled: i === 0, onclick: () => void app.act(() => moveProgram(ch, p.id, -1)) }, "▲"),
      h("button", { class: "quiet icon", "aria-label": `Move ${p.name} down`, disabled: i === ch.software.length - 1, onclick: () => void app.act(() => moveProgram(ch, p.id, 1)) }, "▼"),
      h("button", { class: "quiet", onclick: () => void app.act(async () => {
        const name = await promptText("Rename program", "Name", p.name);
        if (name) renameProgram(ch, p.id, name);
      }) }, "Rename"),
      h("button", { class: "quiet", onclick: () => void app.act(async () => {
        const s = await chooseSound(p);
        if (s !== null) setProgramSound(ch, p.id, s);
      }) }, "Sound"),
      h("button", { class: "quiet danger", onclick: () => void app.act(async () => {
        if (await confirmDialog(`Are you sure you wish to delete ${p.name}?`)) trashProgram(g.cfg, ch, p.id);
      }) }, "Delete"),
    )),
  );
}

/** SoundEditDlg: žádný / výchozí / vlastní zvuk 1–20. */
function chooseSound(p: Program): Promise<number | null> {
  const options: { label: string; id: number }[] = [
    { label: "None", id: -1 },
    { label: "Default", id: p.cls },
    ...Array.from({ length: NUM_CUSTOM_SOUNDS }, (_, i) => ({ label: `Custom sound ${i + 1}`, id: SOUND_CUSTOM1 + i })),
  ];
  return openDialog<number | null>(`Sound for ${p.name}`, (close) => {
    const select = h("select", { autofocus: true }, options.map((o) => h("option", { value: o.id, selected: o.id === p.sound }, o.label)));
    return [
      h("label", { class: "field" }, h("span", null, "Sound"), select),
      h("div", { class: "dialog-actions" },
        h("button", { type: "button", onclick: () => playSound(Number(select.value)) }, "Play"),
        h("button", { type: "button", onclick: () => close(null) }, "Cancel"),
        h("button", { type: "button", class: "primary", onclick: () => close(Number(select.value)) }, "OK"),
      ),
    ];
  }, null);
}
