// Obrazovka Matrixu (CMatrixView): pohled do nodu, mapa, programy, ukazatele, ovládání, zprávy.
import { contractDescription, contractTypeText } from "../../core/contract";
import { formatDate, hardwareText } from "../../core/character";
import { Alert, ContractFlag, FileState, FileType, HardwareType, NodeType, ProgramClass, TraceSubtype } from "../../core/constants";
import { CHIP_NAMES } from "../../core/data/texts";
import { iceNotes, iceTypeName } from "../../core/matrix/ice";
import type { DSFile } from "../../core/matrix/types";
import { DumpCause, type FileOp, type Run, type RunFx, type RunOutput } from "../../core/matrix/run";
import { programClassName, programSize, softwareText } from "../../core/program";
import { loadRatings } from "../../core/character";
import { saveToSlot, exportGame, AUTOSAVE_ID, deleteSlot } from "../../storage";
import type { App } from "../app";
import { credits, h } from "../dom";
import { confirmDialog, message, openDialog, promptText } from "../modal";
import { playSound, setSoundEnabled, soundEnabled } from "../sound";
import { STRIPS, sprite } from "../sprites";
import { renderMap, renderNodeView } from "./views";
import { FILE_SPECIAL_CONTENT } from "../../core/data/texts";
import { USELESS_FILE_CONTENTS, VALUABLE_FILE_CONTENTS } from "../../core/data/fileContents";

interface MatrixUi {
  selectedProgram: number | null;
  fx: RunFx[];
  bigMap: boolean;
  busy: boolean;
}

function mui(app: App): MatrixUi {
  return (app.ui.matrix ??= { selectedProgram: null, fx: [], bigMap: false, busy: false }) as MatrixUi;
}

function runOf(app: App): Run {
  return app.game!.run!;
}

// ---------------------------------------------------------------------------
// Provádění akcí
// ---------------------------------------------------------------------------

function playOutput(out: RunOutput): void {
  const seen = new Set<number>();
  for (const s of out.sounds) {
    if (seen.has(s) || seen.size >= 3) continue;
    seen.add(s);
    playSound(s);
  }
}

/** Provede akci v Matrixu, přehraje zvuky, zobrazí efekty, případně vyhodnotí konec runu. */
async function act(app: App, fn: (run: Run) => void | Promise<void>): Promise<void> {
  const ui = mui(app);
  if (ui.busy) return;
  ui.busy = true;
  const run = runOf(app);
  try {
    await fn(run);
  } catch (e) {
    await message((e as Error).message);
  } finally {
    ui.busy = false;
  }
  const out = run.drain();
  ui.fx = out.fx;
  playOutput(out);
  if (out.fx.some((f) => f.kind === "viewIce")) {
    app.save();
    app.render();
    await showIceInfo(app);
  }
  if (run.ended) {
    await finishRun(app);
    return;
  }
  app.save();
  app.render();
}

/** Čekání na dokončení přenosu (To-Do originálu): přeruší se dotazem, útokem, alarmem nebo příchodem ICE. */
async function waitForTransfer(app: App): Promise<void> {
  await act(app, (run) => {
    const stopKinds = new Set(["query", "alert", "playerHit", "enter"]);
    for (let i = 0; i < 200 && run.transferInProgress && !run.ended; i++) {
      const before = run.out.messages.length;
      run.wait();
      const fresh = run.out.messages.slice(before);
      if (run.out.fx.some((f) => stopKinds.has(f.kind))) break;
      if (fresh.some((m) => m.color === "red" || m.color === "orange")) break;
    }
  });
}

async function finishRun(app: App): Promise<void> {
  const game = app.game!;
  const run = game.run!;
  const end = run.s.end!;
  app.render();
  for (const m of end.messages) await message(m, end.death ? "Flatline" : "Disconnected");
  if (end.death) {
    deleteSlot(AUTOSAVE_ID);
    app.game = null;
    delete app.ui.matrix;
    app.go("intro");
    return;
  }
  await showResults(app);
  game.leaveMatrix();
  delete app.ui.matrix;
  app.screen = "home";
  app.view = "character";
  const ok = await app.handleTime({ events: end.timeEvents, gameOver: end.gameOver });
  if (!ok) return;
  app.save();
  app.render();
}

function statusLines(lines: string[]): HTMLElement {
  return h("ul", { class: "result-lines" }, lines.map((l) => {
    const tag = l.match(/^\((C|I|F)\)/)?.[1];
    return h("li", { class: tag ? `r-${tag}` : undefined }, l.replace(/^\([CIF]\)\s*/, ""));
  }));
}

function showResults(app: App): Promise<void> {
  const end = runOf(app).s.end!;
  const st = end.status!;
  return openDialog<void>("Mission results", (close) => [
    h("p", { class: "lead" }, `${end.contract}: `, h("strong", { class: `result-${st.overall.toLowerCase()}` }, st.overall)),
    statusLines(st.lines),
    h("dl", { class: "facts" },
      h("dt", null, "Contract pay"), h("dd", { class: "amount" }, credits(end.pay)),
      h("dt", null, "Files sold"), h("dd", { class: "amount" }, credits(end.fileValue)),
      h("dt", null, "Total"), h("dd", { class: "amount" }, credits(end.total)),
      h("dt", null, "Skill points"), h("dd", null, String(end.skillPoints)),
      h("dt", null, "Reputation"), h("dd", null, end.repText),
    ),
    h("div", null, end.loot.length ? [h("h3", null, "Recovered"), h("ul", { class: "plain" }, end.loot.map((l) => h("li", null, l)))] : null),
    h("div", { class: "dialog-actions" }, h("button", { class: "primary", onclick: () => close() }, "Go home")),
  ], undefined);
}

// ---------------------------------------------------------------------------
// Dialogy
// ---------------------------------------------------------------------------

function showIceInfo(app: App): Promise<void> {
  const run = runOf(app);
  const ice = run.target;
  if (!ice) return Promise.resolve();
  const status = [`${(20 - ice.health) * 5}% damaged`];
  if (ice.slowLevel) status.push("Slowed");
  if (ice.confusionLevel) status.push("Confused");
  if (ice.weakenLevel) status.push("Weakened");
  if (ice.virusLevel) status.push("Infected");
  return openDialog<void>(ice.name, (close) => [
    h("div", { class: "ice-info" },
      sprite(STRIPS.ice, ice.image, 3),
      h("dl", { class: "facts" },
        h("dt", null, "Type"), h("dd", null, iceTypeName(ice)),
        h("dt", null, "Rating"), h("dd", null, ice.analyzed ? String(ice.rating) : "?"),
        h("dt", null, "Analyzed"), h("dd", null, `${ice.analyzed * 20}%`),
        h("dt", null, "Status"), h("dd", null, status.join(", ")),
      ),
    ),
    h("p", null, iceNotes(ice)),
    h("div", { class: "dialog-actions" }, h("button", { class: "primary", onclick: () => close() }, "OK")),
  ], undefined);
}

function fileContent(f: DSFile): string {
  if (!(f.state & FileState.Scanned)) return "?";
  let s: string;
  switch (f.type) {
    case FileType.Useless: s = USELESS_FILE_CONTENTS[f.contents] ?? "?"; break;
    case FileType.Clue: s = FILE_SPECIAL_CONTENT.clue; break;
    case FileType.Passcode: s = FILE_SPECIAL_CONTENT.passcode; break;
    case FileType.Program: s = FILE_SPECIAL_CONTENT.program; break;
    case FileType.ProgramSource:
    case FileType.ChipSource: s = FILE_SPECIAL_CONTENT.source; break;
    default: s = VALUABLE_FILE_CONTENTS[f.contents] ?? "?";
  }
  if (f.state & FileState.EditedInNode) s += " (Edited)";
  return s;
}

/** CFileAccessDlg – sloupec Value. */
function fileValue(f: DSFile): string {
  if (!(f.state & FileState.Scanned)) return "?";
  if (f.type === FileType.Quest) return "*Contract*";
  if (f.type === FileType.Useless) return "–";
  if (!(f.state & FileState.Evaluated)) return "?";
  if (f.type === FileType.Valuable) {
    if (f.state & FileState.EditedInNode) return "0";
    if (f.state & FileState.InDeck) return "–";
    return credits(f.value);
  }
  if (f.type === FileType.Program || f.type === FileType.ProgramSource) return softwareText(f.contents, f.value);
  if (f.type === FileType.ChipSource) return `${CHIP_NAMES[f.contents]} ${f.value}`;
  return "–";
}

const OP_LABEL: Record<FileOp, string> = { get: "Download", edit: "Edit", erase: "Erase" };

async function fileDialog(app: App, op: FileOp): Promise<void> {
  const run = runOf(app);
  let granted = false;
  await act(app, (r) => {
    granted = r.accessFiles();
  });
  if (!granted || run.ended) return;
  const files = run.visibleFiles();
  const pick = await openDialog<number | null>(`${OP_LABEL[op]} a file on ${run.node.name}`, (close) => [
    files.length === 0 ? h("p", { class: "muted" }, "There are no files in this node.") :
      h("div", { class: "table-wrap" }, h("table", { class: "table" },
        h("thead", null, h("tr", null, ["Name", "Contents", "Value", "Size", "Time", "Guard", ""].map((t) => h("th", null, t)))),
        h("tbody", null, files.map((f) => h("tr", null,
          h("td", null, f.name),
          h("td", null, fileContent(f)),
          h("td", null, fileValue(f)),
          h("td", { class: "num" }, `${f.size}`),
          h("td", { class: "num" }, f.state & FileState.InDeck ? "–" : String(run.fileTime(f))),
          h("td", null, f.tapewormId !== null ? run.ice(f.tapewormId).name : ""),
          h("td", { class: "act" }, h("button", { class: op === "erase" ? "danger" : "primary", disabled: !run.canFileOp(f, op), onclick: () => close(f.id) }, OP_LABEL[op])),
        ))),
      )),
    h("p", { class: "muted" }, "Scan files to see their contents, evaluate them to see their value. Files guarded by a tapeworm can't be touched."),
    h("div", { class: "dialog-actions" }, h("button", { onclick: () => close(null) }, "Cancel")),
  ], null);
  if (pick === null) {
    app.render();
    return;
  }
  if (op !== "erase" && run.transferInProgress &&
    !(await confirmDialog("There is currently a transfer in progress. Do you wish to cancel it?"))) return;
  await act(app, (r) => r.fileOperation(op, pick));
}

async function loadDialog(app: App): Promise<void> {
  const run = runOf(app);
  const g = app.game!;
  const list = run.loadablePrograms();
  const r = loadRatings(g.cfg, g.character);
  const pick = await openDialog<number | null>("Select program to load", (close) => [
    h("p", { class: "muted" }, `Current load ${g.character.currentLoad} MP. Light under ${r.light}, heavy over ${r.heavy}, maximum ${r.max} MP.`),
    list.length === 0 ? h("p", null, "All programs are fully loaded.") :
      h("div", { class: "table-wrap" }, h("table", { class: "table" },
        h("thead", null, h("tr", null, ["Name", "Class", "Rating", "Size", "Time", ""].map((t) => h("th", null, t)))),
        h("tbody", null, list.map((p) => h("tr", null,
          h("td", null, h("span", { class: "with-icon" }, sprite(STRIPS.software, p.cls, 1), p.name)),
          h("td", null, programClassName(p.cls)),
          h("td", { class: "num" }, String(p.rating)),
          h("td", { class: "num" }, `${programSize(g.cfg, p.cls, p.rating)} MP`),
          h("td", { class: "num" }, String(run.programLoadTime(p))),
          h("td", { class: "act" }, h("button", {
            class: "primary",
            disabled: g.character.currentLoad + programSize(g.cfg, p.cls, p.rating) > r.max,
            onclick: () => close(p.id),
          }, "Load")),
        ))),
      )),
    h("div", { class: "dialog-actions" }, h("button", { onclick: () => close(null) }, "Cancel")),
  ], null);
  if (pick === null) return;
  if (run.transferInProgress && !(await confirmDialog("There is currently a transfer in progress. Do you wish to cancel it?"))) return;
  await act(app, (rr) => rr.loadProgram(pick));
}

function contractDialog(app: App): Promise<void> {
  const run = runOf(app);
  const c = app.game!.character.currentContract;
  if (!c) return message("No contract has been accepted.");
  const st = run.contractStatus(true, false);
  return openDialog<void>(contractTypeText(c), (close) => [
    h("p", null, contractDescription(c)),
    h("p", null, h("strong", null, `Status: ${st.overall}`)),
    statusLines(st.lines),
    h("dl", { class: "facts" },
      h("dt", null, "Target"), h("dd", null, `${c.systemName} (${c.systemSize})`),
      h("dt", null, "Pay"), h("dd", { class: "amount" }, credits(c.pay)),
      h("dt", null, "Deadline"), h("dd", null, `${c.daysLeft} days`),
    ),
    h("div", { class: "dialog-actions" }, h("button", { class: "primary", onclick: () => close() }, "OK")),
  ], undefined);
}

function characterDialog(app: App): Promise<void> {
  const g = app.game!;
  const ch = g.character;
  const run = runOf(app);
  const hw = ch.hardware.map((r, i) => (r ? hardwareText(i, r) : null)).filter(Boolean) as string[];
  return openDialog<void>(ch.name, (close) => [
    h("dl", { class: "facts" },
      h("dt", null, "Skills"), h("dd", null, `Attack ${ch.skills.attack}, Defense ${ch.skills.defense}, Stealth ${ch.skills.stealth}, Analysis ${ch.skills.analysis}`),
      h("dt", null, "Chips"), h("dd", null, CHIP_NAMES.map((n, i) => `${n} ${ch.chips[i]}`).join(", ")),
      h("dt", null, "Hardware"), h("dd", null, hw.length ? hw.join(", ") : "none"),
      h("dt", null, "Load"), h("dd", null, `${ch.currentLoad} MP`),
      h("dt", null, "Date"), h("dd", null, formatDate(ch.date)),
      h("dt", null, "Traced"), h("dd", null, run.s.traced ? "yes (stealth −4, all ICE hostile)" : "no"),
    ),
    h("div", { class: "dialog-actions" }, h("button", { class: "primary", onclick: () => close() }, "OK")),
  ], undefined);
}

async function optionsDialog(app: App): Promise<void> {
  const g = app.game!;
  const ironRun = g.character.ironMan;
  const choice = await openDialog<"save" | "export" | "sound" | null>("Options", (close) => [
    h("div", { class: "button-row" },
      h("button", { class: "primary", disabled: ironRun, onclick: () => close("save") }, "Save game"),
      h("button", { onclick: () => close("export") }, "Export to file"),
      h("button", { onclick: () => close("sound") }, soundEnabled() ? "Turn sound off" : "Turn sound on"),
    ),
    h("div", null, ironRun ? h("p", { class: "muted" }, "Ironmen don't need to save in the matrix.") : null),
    h("p", { class: "muted" }, "The game is also saved automatically after every turn."),
    h("div", { class: "dialog-actions" }, h("button", { onclick: () => close(null) }, "Close")),
  ], null);
  if (choice === "save") {
    const name = await promptText("Save game", "Name of the save", g.character.name);
    if (name) {
      try {
        saveToSlot(g, null, name);
        runOf(app).msg("Game has been saved.", "blue");
      } catch (e) {
        await message((e as Error).message);
      }
    }
  } else if (choice === "export") {
    exportGame(g);
  } else if (choice === "sound") {
    setSoundEnabled(!soundEnabled());
  }
  app.render();
}

// ---------------------------------------------------------------------------
// Vykreslení
// ---------------------------------------------------------------------------

function bar(label: string, value: number, max: number, cls: string, text?: string): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return h("div", { class: "mbar" },
    h("span", { class: "mbar-label" }, label),
    h("span", { class: "mbar-track", role: "meter", "aria-valuenow": Math.round(pct), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label },
      h("span", { class: `mbar-fill ${cls}`, style: `width:${pct}%` })),
    h("span", { class: "mbar-value" }, text ?? `${Math.round(pct)}%`),
  );
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const ALERT_LABEL = { [Alert.Green]: "Green", [Alert.Yellow]: "Yellow alert", [Alert.Red]: "Red alert" } as const;

export function renderMatrixScreen(app: App): HTMLElement {
  bindKeys(app);
  const g = app.game!;
  const ch = g.character;
  const run = runOf(app);
  const s = run.s;
  const sys = run.sys;
  const ui = mui(app);
  const c = run.controls();
  const node = run.node;
  const contract = ch.currentContract;
  const target = run.target;
  const max = g.cfg.health.max;

  const A = (fn: (r: Run) => void) => () => void act(app, fn);
  const btn = (label: string, key: string | null, icon: string | null, enabled: boolean, fn: () => void, cls = "") =>
    h("button", {
      class: `mbtn ${cls}`, disabled: !enabled, onclick: fn,
      title: key ? `${label} (${key})` : label, "aria-keyshortcuts": key ?? undefined,
    }, icon ? h("img", { class: "pixel", src: imageUrl(icon), alt: "" }) : null, h("span", null, label), key ? h("kbd", null, key) : null);

  // Hlavička
  const timeLimit = contract && contract.flags & ContractFlag.Timed ? ` / ${contract.timeLimit}:00` : "";
  const head = h("header", { class: "mhead" },
    h("div", { class: "mhead-node" }, h("span", { class: "muted" }, `Area ${sys.areas[node.area]!.number}`), h("strong", null, node.name)),
    h("span", { class: `alert-pill a${sys.alert}` }, ALERT_LABEL[sys.alert]),
    sys.turnsUntilCrash ? h("span", { class: "alert-pill a2 blink" }, `Shutdown in ${sys.turnsUntilCrash} s`) : null,
    h("span", { class: "mclock", title: "Time in the system" }, clock(s.runTime), timeLimit),
    contract ? h("span", { class: "mhead-contract" }, `${contractTypeText(contract)} at ${contract.systemName}`) : null,
  );

  // Programy
  const loaded = ch.software.filter((p) => p.loadedRating > 0);
  if (ui.selectedProgram !== null && !loaded.some((p) => p.id === ui.selectedProgram)) ui.selectedProgram = null;
  const sel = loaded.find((p) => p.id === ui.selectedProgram) ?? null;
  const progList = h("ul", { class: "mprogs", role: "listbox", "aria-label": "Loaded programs" },
    loaded.map((p) => h("li", {
      role: "option",
      "aria-selected": p.id === ui.selectedProgram ? "true" : "false",
      class: run.isActiveProgram(p) ? "active" : undefined,
      tabindex: 0,
      onclick: () => { ui.selectedProgram = p.id; app.render(); },
      ondblclick: A((r) => r.runProgram(p.id)),
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); void act(app, (r) => r.runProgram(p.id)); }
        if (e.key === " ") { e.preventDefault(); ui.selectedProgram = p.id; app.render(); }
      },
      title: run.isActiveProgram(p) ? "Active" : undefined,
    },
      sprite(STRIPS.software, p.cls + (run.isActiveProgram(p) ? 26 : 0), 1),
      h("span", { class: "mprog-name" }, p.name),
      h("span", { class: "mprog-rating" }, p.loadedRating === p.rating ? String(p.rating) : `${p.loadedRating} (${p.rating})`),
    )),
  );
  const isAttackClass = (cls: number) => cls === ProgramClass.Attack || cls === ProgramClass.AttackArea || cls === ProgramClass.AttackPiercing;
  const progPanel = h("section", { class: "mpanel mprograms", "aria-label": "Programs" },
    h("h2", null, "Programs"),
    progList,
    h("div", { class: "mbtn-row" },
      btn("Run", "Enter", "MATRIX_Run_Program0", sel !== null, A((r) => sel && r.runProgram(sel.id))),
      btn("Default", null, "MATRIX_Set_def0", sel !== null && isAttackClass(sel.cls), A((r) => sel && r.setDefaultAttack(sel.id))),
      btn("Load", null, "MATRIX_Load0", true, () => void loadDialog(app)),
      btn("Unload", null, "MATRIX_Unload0", sel !== null, A((r) => sel && r.unloadProgram(sel.id))),
    ),
  );

  // Cíl
  const targetPanel = h("div", { class: "mtarget" },
    target
      ? [
        h("div", { class: `mtarget-pic ${target.state & 0x10 ? "hostile" : run.hasQueried(target) ? "queried" : "calm"}` }, sprite(STRIPS.ice, target.image, 2)),
        h("div", { class: "mtarget-info" },
          h("strong", null, target.name),
          h("span", { class: "muted" }, iceTypeName(target)),
          bar("Health", target.health, max, "ok"),
          h("span", { class: "mtarget-flags" },
            [target.slowLevel && "Slowed", target.virusLevel && "Infected", target.confusionLevel && "Confused", target.weakenLevel && "Weakened", target.analyzed && `Analyzed ${target.analyzed * 20}%`, target.bypassed && "Deceived"]
              .filter(Boolean).join(", ")),
        ),
      ]
      : h("span", { class: "muted" }, s.currentIce.length ? "Click an ICE or press Tab to target it." : "No ICE in this node."),
  );

  const nodeFlags = [
    node.silenceLevel ? `Silenced ${node.silenceLevel}` : null,
    node.smokeLevel ? `Smoke ${node.smokeLevel}` : null,
    run.activeScan ? `${run.activeScan.cls === ProgramClass.Scan ? "Scanning" : "Evaluating"}` : null,
    s.clientProgramStatus ? `Client program ${s.clientProgramStatus - 1}` : null,
  ].filter(Boolean) as string[];

  const center = h("section", { class: "mpanel mcenter", "aria-label": "Node" },
    renderNodeView(run, ch.image, ui.fx, (id) => { run.setTarget(id); app.render(); }),
    h("div", { class: "mnode-flags" }, nodeFlags.join(", ")),
    targetPanel,
  );

  // Stav postavy
  const shield = run.activeShield;
  const transferMax = s.transferInitialTime;
  const transferLeft = Math.max(0, s.transferTurnsLeft - 1);
  const transferName = s.transferProgramId !== null ? run.prog(s.transferProgramId)?.name : s.transferFileId !== null ? run.fileById(node, s.transferFileId)?.name : null;
  const bars = h("div", { class: "mbars" },
    bar("Deck", ch.health.deck, max, ch.health.deck < 8 ? "bad" : "ok"),
    ch.hardware[HardwareType.BioMonitor]
      ? [bar("Mind", ch.health.mental, max, ch.health.mental < 8 ? "bad" : "ok"), bar("Body", ch.health.physical, max, ch.health.physical < 8 ? "bad" : "ok")]
      : h("p", { class: "muted small" }, "A Bio Monitor shows mind and body health."),
    bar("Shield", shield?.loadedRating ?? 0, shield?.rating ?? 1, "accent", shield ? `${shield.loadedRating}/${shield.rating}` : "off"),
    bar("Transfer", transferName ? transferMax - transferLeft : 0, transferMax || 1, "accent", transferName ? `${transferLeft} turns` : "idle"),
    ch.hardware[HardwareType.TraceMonitor]
      ? bar("Trace", s.traceIceId !== null ? s.traceTurnsLeft : 0, s.traceInitialTime || 1, "bad", s.traceIceId !== null ? `${s.traceTurnsLeft} turns${s.traceType !== TraceSubtype.Normal ? " (dump)" : ""}` : s.traced ? "traced" : "none")
      : h("p", { class: "muted small" }, "A Trace Monitor shows trace progress."),
    transferName ? h("p", { class: "small" }, `Transferring ${transferName}`) : null,
    h("p", { class: "mactive small" }, "Active: ",
      [run.activeArmor && `Armor ${run.activeArmor.loadedRating}`, run.activeHide && "Hide", run.activeReflect && "Reflect",
        run.activeBoost && programClassName(run.activeBoost.cls), s.decoys.length && `${s.decoys.length} decoys`]
        .filter(Boolean).join(", ") || "none"),
  );

  // Ovládání
  const n = c.node;
  const nodeButtons: HTMLElement[] = [];
  if (node.type === NodeType.DataStore) {
    nodeButtons.push(
      btn("Download", null, "MATRIX_Getfile0", n.files, () => void fileDialog(app, "get")),
      btn("Edit", null, "MATRIX_Edit0", n.files, () => void fileDialog(app, "edit")),
      btn("Erase", null, "MATRIX_Erase0", n.files, () => void fileDialog(app, "erase")),
    );
  }
  if (n.useIo !== null) nodeButtons.push(btn("Use I/O", null, "MATRIX_Use_io0", n.useIo, A((r) => r.useIO())));
  if (n.getMap !== null) nodeButtons.push(btn("Get map", null, "MATRIX_Getmap0", n.getMap, A((r) => r.getMap())));
  if (n.crash !== null) nodeButtons.push(btn("Crash system", null, "MATRIX_Crash0", n.crash, async () => {
    if (await confirmDialog("Try to crash the system? Failure triggers a red alert.")) void act(app, (r) => r.crashSystem());
  }));
  if (n.backdoor !== null) nodeButtons.push(btn("Backdoor", null, "MATRIX_Backdoor0", n.backdoor, A((r) => r.createBackdoor())));
  if (n.killShutdown !== null) nodeButtons.push(btn("Stop shutdown", null, "MATRIX_Kill_Shutdown0", n.killShutdown, A((r) => r.killShutdown())));
  if (n.killAlarm !== null) nodeButtons.push(btn("Cancel alert", null, "MATRIX_Kill_Alarm0", n.killAlarm, A((r) => r.killAlarm())));
  if (n.killTrace !== null) nodeButtons.push(btn("Remove trace", null, "MATRIX_Kill_Trace0", n.killTrace, A((r) => r.killTrace())));
  if (n.enterPortal !== null) nodeButtons.push(btn("Enter portal", null, "MATRIX_Enter_Portal0", n.enterPortal, A((r) => r.enterPortal())));

  const best = (cls: ProgramClass, label: string) => A((r) => r.runBest(cls, label));
  const pad = h("div", { class: "mpad", role: "group", "aria-label": "Movement" },
    h("span", null),
    btn("North", "↑", "MATRIX_Arrow_n0", c.move[0], A((r) => r.move(0)), "dir"),
    h("span", null),
    btn("West", "←", "MATRIX_Arrow_w0", c.move[3], A((r) => r.move(3)), "dir"),
    btn("Wait", "W", "MATRIX_Wait0", true, A((r) => r.wait()), "dir"),
    btn("East", "→", "MATRIX_Arrow_E0", c.move[1], A((r) => r.move(1)), "dir"),
    h("span", null),
    btn("South", "↓", "MATRIX_Arrow_s0", c.move[2], A((r) => r.move(2)), "dir"),
    h("span", null),
  );
  const quick = h("div", { class: "mquick" },
    btn("Attack", "A", "MATRIX_Attack0", c.attack, A((r) => r.attack())),
    btn("Deceive", "D", "MATRIX_Deceive0", c.deceive, best(ProgramClass.Deceive, "Deceive")),
    btn("Analyze", "Z", null, c.analyze, best(ProgramClass.Analyze, "Analyze")),
    btn("View ICE", "V", "MATRIX_View_Ice0", target !== null, () => void showIceInfo(app)),
    btn("Scan", "S", "MATRIX_scan0", c.scan, best(ProgramClass.Scan, "Scan")),
    btn("Next target", "Tab", null, s.currentIce.length > 0, () => { run.nextTarget(); app.render(); }),
    btn("Wait for transfer", null, null, run.transferInProgress, () => void waitForTransfer(app)),
  );
  const sideButtons = h("div", { class: "mquick" },
    btn("Character", null, "MATRIX_Char0", true, () => void characterDialog(app)),
    btn("Contract", null, "MATRIX_Contract0", true, () => void contractDialog(app)),
    btn("Options", null, "MATRIX_Options0", true, () => void optionsDialog(app)),
    btn("Disconnect", null, "MATRIX_Disconnect0", true, async () => {
      if (await confirmDialog("Are you sure you wish to disconnect?")) void act(app, (r) => r.disconnect());
    }, "danger"),
  );

  // Stažené soubory (To-Do originálu)
  const downloaded = sys.nodes.flatMap((nn) => nn.files.filter((f) => f.state & FileState.InDeck));
  const filesPanel = h("section", { class: "mpanel", "aria-label": "Downloaded files" },
    h("h2", null, "Downloaded files"),
    downloaded.length === 0 ? h("p", { class: "muted small" }, "Nothing downloaded yet.")
      : h("ul", { class: "plain small" }, downloaded.map((f) => h("li", null, `${f.name}: `,
        f.state & FileState.EditedInDeck ? "worthless (edited)" :
          f.type === FileType.Quest ? "contract file" :
            f.state & FileState.Evaluated ? fileValue({ ...f, state: f.state & ~FileState.InDeck }) : "value unknown"))),
  );

  // Zprávy
  const log = h("div", { class: "mlog", role: "log", "aria-live": "polite", "aria-label": "Messages" },
    s.log.slice(-60).map((m) => h("p", { class: `msg ${m.color}` }, m.text)));
  requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));

  return h("div", { class: "matrix" },
    head,
    h("div", { class: "mgrid" },
      progPanel,
      center,
      h("section", { class: "mpanel mright", "aria-label": "Map and status" },
        h("div", { class: "panel-head" }, h("h2", null, "Map"),
          h("button", { class: "quiet", onclick: () => { ui.bigMap = !ui.bigMap; app.render(); } }, ui.bigMap ? "Zoom out" : "Zoom in")),
        renderMap(run, ui.bigMap),
        bars,
      ),
      h("section", { class: "mpanel mcontrols", "aria-label": "Actions" },
        pad,
        h("div", null, quick, nodeButtons.length ? h("div", { class: "mquick mnode" }, nodeButtons) : null, sideButtons),
      ),
      h("section", { class: "mpanel mlog-panel", "aria-label": "Message log" }, log),
      filesPanel,
    ),
  );
}

import { image as assetImage } from "../../assets";
function imageUrl(name: string): string {
  return assetImage(name);
}

// ---------------------------------------------------------------------------
// Klávesy (akcelerátory originálu IDR_MATRIX_ACC)
// ---------------------------------------------------------------------------

let keysBound = false;
let appRef: App | null = null;

function bindKeys(app: App): void {
  appRef = app;
  if (keysBound) return;
  keysBound = true;
  window.addEventListener("keydown", (e) => {
    const a = appRef;
    if (!a || a.screen !== "matrix" || !a.game?.run || a.game.run.ended) return;
    if (document.querySelector("dialog[open]")) return;
    if ((e.target as HTMLElement).closest("input, select, textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const run = a.game.run;
    const c = run.controls();
    const best = (cls: ProgramClass, label: string) => void act(a, (r) => r.runBest(cls, label));
    const k = e.key;
    const map: Record<string, () => void> = {
      ArrowUp: () => c.move[0] && void act(a, (r) => r.move(0)),
      ArrowRight: () => c.move[1] && void act(a, (r) => r.move(1)),
      ArrowDown: () => c.move[2] && void act(a, (r) => r.move(2)),
      ArrowLeft: () => c.move[3] && void act(a, (r) => r.move(3)),
      w: () => void act(a, (r) => r.wait()),
      a: () => void act(a, (r) => r.attack()),
      d: () => best(ProgramClass.Deceive, "Deceive"),
      z: () => best(ProgramClass.Analyze, "Analyze"),
      s: () => best(ProgramClass.Scan, "Scan"),
      e: () => best(ProgramClass.Evaluate, "Evaluate"),
      c: () => best(ProgramClass.Decrypt, "Decrypt"),
      l: () => best(ProgramClass.Silence, "Silence"),
      k: () => best(ProgramClass.Smoke, "Smoke"),
      m: () => best(ProgramClass.Medic, "Medic"),
      r: () => best(ProgramClass.Relocate, "Relocate"),
      v: () => void showIceInfo(a),
      Tab: () => {
        run.nextTarget();
        a.render();
      },
    };
    const fn = map[k.length === 1 ? k.toLowerCase() : k];
    if (fn) {
      e.preventDefault();
      fn();
    }
  });
}
