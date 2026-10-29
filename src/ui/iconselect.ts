// Rozbalovací výběr s ikonami (nativní <select> obrázky v položkách neumí).
import { h } from "./dom";

export interface IconOption {
  value: number;
  text: string;
  icon: () => HTMLElement;
}

let openClose: (() => void) | null = null;
document.addEventListener("pointerdown", (e) => {
  if (openClose && !(e.target as HTMLElement).closest(".iselect")) openClose();
});

export function iconSelect(opts: {
  label: string;
  value: number;
  options: IconOption[];
  onChange: (v: number) => void;
  focusKey: string;
}): HTMLElement {
  const current = opts.options.find((o) => o.value === opts.value) ?? opts.options[0]!;
  const listId = `${opts.focusKey}-list`;
  const labelId = `${opts.focusKey}-label`;
  const items = opts.options.map((o, i) => h("li", {
    role: "option",
    id: `${listId}-${i}`,
    "aria-selected": o.value === current.value ? "true" : "false",
    "data-value": o.value,
    onclick: () => choose(o.value),
  }, h("span", { class: "iselect-icon" }, o.icon()), h("span", null, o.text)));
  const list = h("ul", { class: "iselect-list", role: "listbox", id: listId, "aria-labelledby": labelId, tabindex: -1, hidden: true }, items);
  const button = h("button", {
    type: "button",
    class: "iselect-button",
    "aria-haspopup": "listbox",
    "aria-expanded": "false",
    "aria-labelledby": `${labelId} ${opts.focusKey}-value`,
    dataset: { focus: opts.focusKey },
    onclick: () => (list.hidden ? open() : close()),
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        open();
      }
    },
  }, h("span", { class: "iselect-icon" }, current.icon()), h("span", { id: `${opts.focusKey}-value` }, current.text), h("span", { class: "iselect-caret", "aria-hidden": "true" }, "▾"));

  let active = Math.max(0, opts.options.indexOf(current));
  const setActive = (i: number) => {
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((li, j) => li.classList.toggle("active", j === active));
    list.setAttribute("aria-activedescendant", items[active]!.id);
    items[active]!.scrollIntoView({ block: "nearest" });
  };
  function open() {
    openClose?.();
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    setActive(opts.options.indexOf(current));
    list.focus();
    openClose = close;
  }
  function close(refocus = true) {
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (openClose === close) openClose = null;
    if (refocus) button.focus();
  }
  function choose(v: number) {
    close();
    if (v !== current.value) opts.onChange(v);
  }
  list.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "ArrowDown") setActive(active + 1);
    else if (k === "ArrowUp") setActive(active - 1);
    else if (k === "Home") setActive(0);
    else if (k === "End") setActive(items.length - 1);
    else if (k === "PageDown") setActive(active + 8);
    else if (k === "PageUp") setActive(active - 8);
    else if (k === "Enter" || k === " ") choose(opts.options[active]!.value);
    else if (k === "Escape") close();
    else if (k === "Tab") { close(false); return; }
    else if (k.length === 1) {
      // skok na další položku začínající písmenem
      const ch = k.toLowerCase();
      const n = opts.options.length;
      for (let d = 1; d <= n; d++) {
        const i = (active + d) % n;
        if (opts.options[i]!.text.toLowerCase().startsWith(ch)) { setActive(i); break; }
      }
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
  list.addEventListener("pointermove", (e) => {
    const li = (e.target as HTMLElement).closest("li");
    if (li) setActive(items.indexOf(li as HTMLLIElement));
  });

  return h("div", { class: "field" },
    h("span", { id: labelId }, opts.label),
    h("div", { class: "iselect" }, button, list));
}
