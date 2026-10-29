// Nápověda (WinHelp originálu převedená do HTML). F1 otevře téma podle aktuální obrazovky.
import type { App, View } from "../app";
import { h } from "../dom";
import { HELP_CONTENTS, HELP_TOPICS } from "./content";

const VIEW_TOPIC: Record<View, string> = {
  character: "HID_CHAR",
  deck: "HID_DECK",
  contracts: "HID_CONTRACT",
  shop: "HID_SHOP",
  projects: "HID_PROGRAM",
  rest: "HID_REST",
  matrix: "HID_HOME",
  options: "HID_HOME",
};

/** Téma nápovědy pro aktuální obrazovku (kontextová nápověda originálu). */
export function contextTopic(app: App): string {
  if (app.screen === "intro") return "HID_INTRO";
  if (app.screen === "newChar") return "HID_INTRO";
  if (app.screen === "matrix") return "HID_MATRIX";
  return VIEW_TOPIC[app.view];
}

let open: HTMLDialogElement | null = null;

export function openHelp(topicId = "Decker_Intro"): void {
  if (open) {
    show(open, topicId);
    return;
  }
  const dlg = h("dialog", { class: "dialog help-dialog", "aria-label": "Help" });
  const close = () => {
    dlg.close();
    dlg.remove();
    open = null;
  };
  dlg.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dlg.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-topic]");
    if (a) {
      e.preventDefault();
      show(dlg, a.dataset.topic!);
    }
  });
  const toc = h("nav", { class: "help-toc", "aria-label": "Contents" },
    HELP_CONTENTS.map((c) => c.topic
      ? h("a", { href: "#", class: `lvl${c.level}`, "data-topic": c.topic }, c.title)
      : h("span", { class: `help-group lvl${c.level}` }, c.title)),
  );
  dlg.append(
    h("div", { class: "help-head" },
      h("h2", { class: "dialog-title" }, "Decker help"),
      h("button", { class: "quiet", onclick: close, "aria-label": "Close help" }, "Close"),
    ),
    h("div", { class: "help-body" }, toc, h("article", { class: "help-article", tabindex: -1 })),
  );
  document.body.appendChild(dlg);
  dlg.showModal();
  open = dlg;
  show(dlg, topicId);
}

function show(dlg: HTMLDialogElement, topicId: string): void {
  const t = HELP_TOPICS.find((x) => x.id === topicId) ?? HELP_TOPICS[0]!;
  const art = dlg.querySelector<HTMLElement>(".help-article")!;
  art.innerHTML = `<h1>${t.title}</h1>${t.html}` +
    (t.id === "Decker_Intro"
      ? `<p class="muted help-note">This is the manual of the original Decker 1.12. The remaster's screens are laid out differently, but the rules, programs, ICE and keys are the same.</p>`
      : "");
  art.scrollTop = 0;
  art.focus({ preventScroll: true });
  for (const a of dlg.querySelectorAll<HTMLElement>(".help-toc a")) {
    if (a.dataset.topic === t.id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

let bound = false;
/** F1 = nápověda k aktuální obrazovce. */
export function bindHelpKey(app: App): void {
  if (bound) return;
  bound = true;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "F1") return;
    e.preventDefault();
    openHelp(contextTopic(app));
  });
}
