// Projekty (ProjectDataDlg, NewProjectDlg, BuildDialog).
import { ItemType, ProgramClass } from "../../core/constants";
import {
  buildProgram, burnChip, canLoadBuiltProgram, checkBurnChip, chipBurnDaysLeft, daysForWork, maxProjectRating,
  maxSourceRating, projectClasses, projectDaysLeft, projectWork, sourceName, startProject, trashSource, workOnProject,
  type ProjectType,
} from "../../core/projects";
import { findProgram } from "../../core/character";
import { programClassName } from "../../core/program";
import type { Source } from "../../core/state";
import { actionButton, type App } from "../app";
import { h, plural } from "../dom";
import { confirmDialog, message, openDialog } from "../modal";
import { iconSelect } from "../iconselect";
import { STRIPS, sprite } from "../sprites";
import { viewTitle } from "./home";

interface Draft { type: ProjectType; cls: number; rating: number }

export function renderProjects(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const p = ch.project;
  const work = async (mode: "day" | "week" | "finish") => {
    const r = workOnProject(g, ch, mode);
    if (!(await app.handleTime(r))) return;
    if (r.completion) await message(r.completion.message, r.completion.success ? "Project complete" : "Design flaw");
  };
  const burning = ch.chipBurning ? ch.sources.find((s) => s.id === ch.chipBurning!.sourceId) : null;
  return h("section", null,
    viewTitle("Projects"),
    h("div", { class: "columns" },
      h("div", { class: "panel" },
        h("h2", null, "Current project"),
        p
          ? [
            h("p", { class: "lead" }, `${sourceName(p.type, p.cls)}, rating ${p.rating}`),
            h("p", null, `${plural(projectDaysLeft(ch), "day")} of work left.`),
            h("div", { class: "button-row" },
              actionButton(app, "Work 1 day", () => work("day")),
              actionButton(app, "Work until end of week", () => work("week")),
              actionButton(app, "Work until done", () => work("finish"), { primary: true }),
            ),
          ]
          : h("p", { class: "muted" }, "No project in progress."),
        h("h2", null, "Chip burner"),
        burning
          ? h("p", null, `Burning ${sourceName(ItemType.Chip, burning.cls)} rating ${burning.rating}, ready in ${plural(chipBurnDaysLeft(ch), "day")}.`)
          : h("p", { class: "muted" }, ch.hardware[0] ? "The burner is idle." : "You don't own a chip burner. The shop sells them."),
      ),
      renderNewProject(app),
    ),
    renderSources(app),
  );
}

function renderNewProject(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const d = (app.ui.project ??= { type: ItemType.Software, cls: 0, rating: maxProjectRating(ch, ItemType.Software) }) as Draft;
  const max = maxProjectRating(ch, d.type);
  if (d.rating > max) d.rating = max;
  const have = maxSourceRating(ch, d.type, d.cls);
  const workPts = projectWork(g.cfg, ch, d.type, d.cls, d.rating);
  const days = daysForWork(ch, d.type, workPts);
  const name = (c: number) => sourceName(d.type, c);
  const select = (label: string, value: number, opts: { v: number; t: string }[], set: (v: number) => void, key: string) =>
    h("label", { class: "field" }, h("span", null, label),
      h("select", { dataset: { focus: key }, onchange: (e: Event) => { set(Number((e.target as HTMLSelectElement).value)); app.render(); } },
        opts.map((o) => h("option", { value: o.v, selected: o.v === value }, o.t))));
  return h("div", { class: "panel" },
    h("h2", null, "New project"),
    h("div", { class: "form-row" },
      iconSelect({
        label: "Type", value: d.type, focusKey: "proj-type",
        options: [
          { value: ItemType.Software, text: "Program", icon: () => sprite(STRIPS.items, ItemType.Software, 1) },
          { value: ItemType.Chip, text: "Chip", icon: () => sprite(STRIPS.items, ItemType.Chip, 1) },
        ],
        onChange: (v) => { d.type = v as ProjectType; d.cls = 0; d.rating = maxProjectRating(ch, d.type); app.render(); },
      }),
      iconSelect({
        label: "Class", value: d.cls, focusKey: "proj-cls",
        options: projectClasses(d.type).map((c) => ({
          value: c, text: name(c),
          icon: () => d.type === ItemType.Software ? sprite(STRIPS.software, c, 1) : sprite(STRIPS.items, ItemType.Chip, 1),
        })),
        onChange: (v) => { d.cls = v; app.render(); },
      }),
      select("Rating", d.rating, Array.from({ length: max }, (_, i) => ({ v: i + 1, t: String(i + 1) })), (v) => (d.rating = v), "proj-rating"),
    ),
    h("p", { class: "muted" },
      `Your ${d.type === ItemType.Software ? "programming" : "chip design"} skill (${max}) sets the highest rating. `,
      have ? `You already have source code up to rating ${have}, so this takes less work.` : "No source code of this class yet."),
    h("p", null, h("strong", null, plural(days, "day")), ` of work (${workPts} points)`),
    actionButton(app, "Start project", async () => {
      if (ch.project && !(await confirmDialog("You already have a project. Do you wish to cancel it to start this one?"))) return;
      startProject(g.cfg, ch, d.type, d.cls, d.rating);
    }, { primary: true }),
  );
}

function renderSources(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const current = (s: Source) => {
    if (s.type === ItemType.Software) {
      const p = findProgram(ch, s.cls as ProgramClass, false);
      return p ? String(p.rating) : "–";
    }
    return String(ch.chips[s.cls]);
  };
  return h("div", { class: "panel" },
    h("h2", null, "Source code"),
    ch.sources.length === 0
      ? h("p", { class: "muted" }, "Finished projects leave source code here. Compile programs from it or burn chips.")
      : h("div", { class: "table-wrap" }, h("table", { class: "table" },
        h("thead", null, h("tr", null, h("th", null, "Source"), h("th", { class: "num" }, "Rating"), h("th", { class: "num" }, "You have"), h("th", null, ""))),
        h("tbody", null, ch.sources.map((s) => h("tr", null,
          h("td", null, h("span", { class: "with-icon" },
            s.type === ItemType.Software ? sprite(STRIPS.software, s.cls, 1) : sprite(STRIPS.items, ItemType.Chip, 1),
            sourceName(s.type, s.cls))),
          h("td", { class: "num" }, s.rating),
          h("td", { class: "num" }, current(s)),
          h("td", { class: "act" }, h("div", { class: "row-actions" },
            s.type === ItemType.Software
              ? h("button", { onclick: () => void compile(app, s) }, "Compile")
              : actionButton(app, "Burn chip", async () => {
                const c = checkBurnChip(ch, s.id);
                if (!c.ok) return c.message;
                if (c.confirm && !(await confirmDialog(c.confirm))) return;
                return burnChip(g.cfg, ch, s.id);
              }),
            actionButton(app, "Delete", async () => {
              if (await confirmDialog("Are you sure you want to erase this source code?")) trashSource(ch, s.id);
            }),
          )),
        ))),
      )),
  );
}

/** BuildDialog: název programu a co s ním po překladu. */
async function compile(app: App, s: Source): Promise<void> {
  const g = app.game!;
  const ch = g.character;
  const allowLoad = canLoadBuiltProgram(g.cfg, ch, s);
  const result = await openDialog<{ name: string; load: boolean; old: "trash" | "unload" | "keep" } | null>("Compile program", (close) => {
    const name = h("input", { type: "text", value: `${programClassName(s.cls)} ${s.rating}`, maxlength: 40, autofocus: true });
    const load = h("input", { type: "checkbox", checked: allowLoad, disabled: !allowLoad });
    const old = h("select", { disabled: !allowLoad },
      h("option", { value: "trash", selected: true }, "Delete older programs of this class"),
      h("option", { value: "unload" }, "Unload older programs of this class"),
      h("option", { value: "keep" }, "Keep older programs as they are"));
    load.addEventListener("change", () => (old.disabled = !load.checked));
    return [h("form", {
      onsubmit: (e: Event) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        close({ name: name.value.trim(), load: load.checked, old: load.checked ? (old.value as "trash") : "keep" });
      },
    },
      h("label", { class: "field" }, h("span", null, "Program name"), name),
      h("label", { class: "choice" }, load, h("span", null, h("strong", null, "Load into the deck"),
        allowLoad ? null : h("span", { class: "muted" }, "It would overload your deck."))),
      h("label", { class: "field" }, h("span", null, "Older versions"), old),
      h("div", { class: "dialog-actions" },
        h("button", { type: "button", onclick: () => close(null) }, "Cancel"),
        h("button", { type: "submit", class: "primary" }, "Compile"),
      ),
    )];
  }, null);
  if (!result) return;
  await app.act(() => {
    buildProgram(g.cfg, ch, s.id, { name: result.name, load: result.load, trash: result.old === "trash", unload: result.old === "unload" });
    return "Program has been compiled and is now available for use.";
  });
}
