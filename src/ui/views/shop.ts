// Obchod (CShop) a objednávky (COrderDlg).
import { currentItemLevel, hardwareText } from "../../core/character";
import { ItemType } from "../../core/constants";
import { CHIP_NAMES, HARDWARE_NAMES } from "../../core/data/texts";
import { programClassName } from "../../core/program";
import {
  SHOP_NAMES, checkOrder, checkPurchase, itemText, orderDeliveryDays, orderMaxRating, orderPrice, orderableClasses,
  placeOrder, purchase,
} from "../../core/shop";
import { actionButton, type App } from "../app";
import { credits, h, plural } from "../dom";
import { confirmDialog, message } from "../modal";
import { STRIPS, sprite } from "../sprites";
import { viewTitle } from "./home";

const TYPE_LABEL: Record<ItemType, string> = { [ItemType.Software]: "Program", [ItemType.Chip]: "Chip", [ItemType.Hardware]: "Hardware" };

interface OrderDraft { type: ItemType; cls: number; rating: number }

function className(type: ItemType, cls: number): string {
  if (type === ItemType.Software) return programClassName(cls);
  if (type === ItemType.Chip) return CHIP_NAMES[cls]!;
  return HARDWARE_NAMES[cls]!;
}

export function renderShop(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  const buy = async (index: number) => {
    const item = ch.shop[index]!;
    const check = checkPurchase(g.cfg, ch, item);
    if (!check.ok) return message(check.message);
    if (check.confirm && !(await confirmDialog(check.confirm))) return;
    await app.act(() => purchase(g.cfg, ch, index));
  };
  return h("section", null,
    viewTitle(SHOP_NAMES[ch.lifestyle]!, h("span", { class: "amount" }, credits(ch.credits))),
    h("div", { class: "panel" },
      h("p", { class: "muted" }, "Stock changes every week. A better lifestyle brings higher-rated goods."),
      h("div", { class: "table-wrap" }, h("table", { class: "table" },
        h("thead", null, h("tr", null, h("th", null, "Item"), h("th", { class: "num" }, "Price"), h("th", { class: "num" }, "You have"), h("th", null, ""))),
        h("tbody", null, ch.shop.map((item, i) => {
          const have = currentItemLevel(ch, item.type, item.subType);
          const icon = item.type === ItemType.Software ? sprite(STRIPS.software, item.subType, 1) : sprite(STRIPS.items, item.type, 1);
          return h("tr", null,
            h("td", null, h("span", { class: "with-icon" }, icon, item.text)),
            h("td", { class: `num amount${item.price > ch.credits ? " short" : ""}` }, credits(item.price)),
            h("td", { class: "num" }, have === 0 ? "–" : have),
            h("td", { class: "act" }, h("button", { disabled: item.price > ch.credits, dataset: { focus: `buy-${i}` }, onclick: () => void buy(i) }, "Buy")),
          );
        })),
      )),
    ),
    renderOrder(app),
  );
}

function renderOrder(app: App): HTMLElement {
  const g = app.game!;
  const ch = g.character;
  if (ch.order) {
    const o = ch.order;
    return h("div", { class: "panel" },
      h("h2", null, "Special order"),
      h("p", null, `${itemText(o.type, o.cls, o.rating)} arrives in ${plural(o.timeLeft, "day")}.`),
    );
  }
  const d = (app.ui.order ??= { type: ItemType.Software, cls: 0, rating: 1 }) as OrderDraft;
  const max = orderMaxRating(g.cfg, ch, d.type, d.cls);
  if (d.rating > max) d.rating = max;
  const price = orderPrice(g.cfg, d.type, d.cls, d.rating);
  const days = orderDeliveryDays(g.cfg, d.type, price);
  const err = checkOrder(g.cfg, ch, d.type, d.cls, d.rating);
  const select = (label: string, value: number, opts: { v: number; t: string }[], set: (v: number) => void, key: string) =>
    h("label", { class: "field" }, h("span", null, label),
      h("select", { dataset: { focus: key }, onchange: (e: Event) => { set(Number((e.target as HTMLSelectElement).value)); app.render(); } },
        opts.map((o) => h("option", { value: o.v, selected: o.v === value }, o.t))));
  return h("div", { class: "panel" },
    h("h2", null, "Special order"),
    h("p", { class: "muted" }, "Order anything up to your lifestyle's limit. Orders cost twice the shop price and take a few days."),
    h("div", { class: "form-row" },
      select("Type", d.type, [ItemType.Software, ItemType.Chip, ItemType.Hardware].map((t) => ({ v: t, t: TYPE_LABEL[t] })),
        (v) => { d.type = v; d.cls = orderableClasses(v)[0]!; d.rating = 1; }, "ord-type"),
      select("Item", d.cls, orderableClasses(d.type).map((c) => ({ v: c, t: className(d.type, c) })), (v) => { d.cls = v; d.rating = 1; }, "ord-cls"),
      select("Rating", d.rating, Array.from({ length: max }, (_, i) => ({
        v: i + 1, t: d.type === ItemType.Hardware ? hardwareText(d.cls, i + 1) : String(i + 1),
      })), (v) => (d.rating = v), "ord-rating"),
    ),
    h("p", null, h("strong", { class: "amount" }, credits(price)), `, delivered in ${plural(days, "day")}`),
    err ? h("p", { class: "muted" }, err) : null,
    actionButton(app, "Place order", () => {
      const msg = placeOrder(g.cfg, ch, d.type, d.cls, d.rating);
      delete app.ui.order;
      return msg;
    }, { primary: true, disabled: err !== null }),
  );
}
