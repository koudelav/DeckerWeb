// Modální dialogy (náhrada za MessageBox a dialogy MFC).
import { h } from "./dom";

export function openDialog<T>(
  title: string,
  build: (close: (value: T) => void) => Node[],
  cancelValue: T,
): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const dlg = h("dialog", { class: "dialog", "aria-label": title });
    const close = (v: T) => {
      if (done) return;
      done = true;
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(cancelValue);
    });
    dlg.append(h("h2", { class: "dialog-title" }, title), ...build(close));
    document.body.appendChild(dlg);
    dlg.showModal();
    const focusable = dlg.querySelector<HTMLElement>("[autofocus], input, select, button.primary, button");
    focusable?.focus();
  });
}

export function message(text: string, title = "Decker"): Promise<void> {
  return openDialog<void>(title, (close) => [
    h("p", { class: "dialog-text" }, text),
    h("div", { class: "dialog-actions" }, h("button", { class: "primary", onclick: () => close() }, "OK")),
  ], undefined);
}

export function confirmDialog(text: string, opts: { title?: string; yes?: string; no?: string } = {}): Promise<boolean> {
  return openDialog<boolean>(opts.title ?? "Decker", (close) => [
    h("p", { class: "dialog-text" }, text),
    h("div", { class: "dialog-actions" },
      h("button", { onclick: () => close(false) }, opts.no ?? "No"),
      h("button", { class: "primary", onclick: () => close(true) }, opts.yes ?? "Yes"),
    ),
  ], false);
}

export function promptText(title: string, label: string, value: string): Promise<string | null> {
  return openDialog<string | null>(title, (close) => {
    const input = h("input", { type: "text", value, maxlength: 40, autofocus: true });
    const form = h("form", {
      onsubmit: (e: Event) => {
        e.preventDefault();
        if (input.value.trim()) close(input.value.trim());
      },
    },
      h("label", { class: "field" }, h("span", null, label), input),
      h("div", { class: "dialog-actions" },
        h("button", { type: "button", onclick: () => close(null) }, "Cancel"),
        h("button", { type: "submit", class: "primary" }, "OK"),
      ),
    );
    return [form];
  }, null);
}
