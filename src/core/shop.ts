// Obchod a objednávky. Originál: ShopItem.cpp, Character.cpp GenerateShopItems, Shop.cpp, OrderDlg.cpp.
// Kuchařka: docs/pravidla/05-obchod.md

import type { RulesConfig } from "./config";
import { HardwareType, ItemType, NUM_CHIPS, NUM_HW, NUM_PROGRAMS, ProgramClass } from "./constants";
import type { Ctx } from "./context";
import { CHIP_NAMES } from "./data/texts";
import { applyVariance } from "./dice";
import { createProgram, softwarePrice, softwareText } from "./program";
import type { Character, Program, ShopItem } from "./state";
// Kruhový import character.ts <-> shop.ts je v pořádku: funkce se volají až za běhu.
import { calcCurrentLoad, hardwareText } from "./character";

/** Shop.cpp g_szShopName – název obchodu podle lifestylu. */
export const SHOP_NAMES = [
  "Thrifty Electronics", "The Little Warez Shop", "The Matrix Emporium", "Hacker's Haven", "Nullspace",
] as const;

/** ShopItem.cpp GetHardwarePrice: základ × 2^(úroveň−1) */
export function hardwarePrice(cfg: RulesConfig, hw: HardwareType, rating: number): number {
  return cfg.hardware.baseCost[hw]! * (1 << (rating - 1));
}

/** ShopItem.cpp GetChipPrice: rating² × základ */
export function chipPrice(cfg: RulesConfig, chip: number, rating: number): number {
  return rating * rating * cfg.chips.baseCost[chip]!;
}

export function maxHardwareRating(cfg: RulesConfig, hw: HardwareType): number {
  return cfg.hardware.maxLevel[hw]!;
}

export function itemPrice(cfg: RulesConfig, type: ItemType, cls: number, rating: number): number {
  if (type === ItemType.Software) return softwarePrice(cfg, cls, rating);
  if (type === ItemType.Chip) return chipPrice(cfg, cls, rating);
  return hardwarePrice(cfg, cls, rating);
}

export function itemText(type: ItemType, cls: number, rating: number): string {
  if (type === ItemType.Software) return softwareText(cls, rating);
  if (type === ItemType.Hardware) return hardwareText(cls, rating);
  return `${CHIP_NAMES[cls]}  Level ${rating}`;
}

/** ShopItem.cpp CShopItem::Generate */
export function generateShopItem(ctx: Ctx, ch: Character, type: ItemType): ShopItem {
  const { cfg, rng } = ctx;
  const s = cfg.shop;
  let subType: number;
  let rating: number;
  switch (type) {
    case ItemType.Software:
      do subType = rng.random(NUM_PROGRAMS);
      while (subType === ProgramClass.Client);
      rating = s.softwareRatingPerLifestyle * ch.lifestyle + rng.random(s.softwareRatingDie) + 1;
      break;
    case ItemType.Hardware:
      subType = rng.random(NUM_HW);
      rating = Math.min(s.hardwareRatingBase + rng.random(ch.lifestyle + 1), maxHardwareRating(cfg, subType));
      break;
    default:
      subType = rng.random(NUM_CHIPS);
      rating = s.chipRatingPerLifestyle * ch.lifestyle + rng.random(s.chipRatingDie) + s.chipRatingMin;
      break;
  }
  const price = applyVariance(ctx, itemPrice(cfg, type, subType, rating), s.priceVariancePercent);
  return { text: itemText(type, subType, rating), type, subType, rating, price };
}

function sameItem(a: ShopItem, b: ShopItem): boolean {
  return a.type === b.type && a.subType === b.subType && a.rating === b.rating;
}

/** Character.cpp GenerateShopItems: nové zboží (programy, hardware, čipy), bez duplicit. */
export function generateShopItems(ctx: Ctx, ch: Character): void {
  const s = ctx.cfg.shop;
  const rng = ctx.rng;
  ch.shop = [];
  const add = (type: ItemType, count: number) => {
    for (let i = 0; i < count; i++) {
      let item: ShopItem;
      do item = generateShopItem(ctx, ch, type);
      while (ch.shop.some((x) => sameItem(x, item)));
      ch.shop.push(item);
    }
  };
  add(ItemType.Software, s.softwareBase + rng.random2(s.softwareDice, s.softwareDie));
  add(ItemType.Hardware, s.hardwareBase + rng.random(s.hardwareDie));
  add(ItemType.Chip, s.chipBase + rng.random2(s.chipDice, s.chipDie));
}

/** Výsledek pokusu o nákup – UI podle něj zobrazí hlášku nebo se zeptá na potvrzení. */
export type BuyCheck =
  | { ok: true; confirm?: string }
  | { ok: false; message: string };

/** Shop.cpp OnShopPurchase – kontroly před nákupem. */
export function checkPurchase(cfg: RulesConfig, ch: Character, item: ShopItem): BuyCheck {
  if (ch.credits < item.price) return { ok: false, message: "You cannot afford this." };
  if (item.type === ItemType.Software) {
    let greater = false;
    for (const p of ch.software) {
      if (p.cls !== item.subType) continue;
      if (p.rating === item.rating) return { ok: false, message: "You already own this type of program" };
      if (p.rating > item.rating) greater = true;
    }
    if (greater) return { ok: true, confirm: "You already own a stronger version of this program. Do you still wish to buy it?" };
    return { ok: true };
  }
  if (item.type === ItemType.Hardware) {
    if (ch.hardware[item.subType]! >= item.rating) return { ok: false, message: "You already own this type of hardware." };
    if (item.subType === HardwareType.ChipBurner && ch.chipBurning) {
      return { ok: true, confirm: "Your currently have chips cooking. If you upgrade, these will be destroyed. Continue?" };
    }
    return { ok: true };
  }
  if (ch.chips[item.subType]! >= item.rating) return { ok: false, message: "You already own a chip of this rating or higher." };
  return { ok: true };
}

/** Zařadí program do seznamu: podle třídy, v rámci třídy od nejvyššího ratingu (Shop.cpp). */
export function insertProgramSorted(ch: Character, p: Program): void {
  let i = 0;
  for (; i < ch.software.length; i++) {
    const q = ch.software[i]!;
    if (q.cls > p.cls) break;
    if (q.cls === p.cls && q.rating < p.rating) break;
  }
  ch.software.splice(i, 0, p);
}

/**
 * Shop.cpp OnShopPurchase – provedení nákupu (po checkPurchase a případném potvrzení).
 * Program v obchodě zůstává (jako v originálu), hardware a čip zmizí.
 * Vrací hlášku pro hráče.
 */
export function purchase(cfg: RulesConfig, ch: Character, index: number): string {
  const item = ch.shop[index];
  if (!item) throw new Error("Neplatná položka");
  const check = checkPurchase(cfg, ch, item);
  if (!check.ok) throw new Error(check.message);
  let message: string;
  if (item.type === ItemType.Software) {
    ch.credits -= item.price;
    insertProgramSorted(ch, createProgram(ch, item.subType, item.rating));
    message = "Program purchased.";
  } else if (item.type === ItemType.Hardware) {
    if (item.subType === HardwareType.ChipBurner) ch.chipBurning = null;
    const old = ch.hardware[item.subType]!;
    if (old !== 0) {
      const refund = Math.trunc(hardwarePrice(cfg, item.subType, old) / cfg.shopTrade.hardwareResaleDivisor);
      ch.credits += refund;
      // Originál hlášku o výkupu připravil, ale nezobrazil; remaster ji ukáže.
      message = `Hardware purchased. You sold your old hardware for ${refund}cr.`;
    } else {
      message = "Hardware purchased.";
    }
    ch.hardware[item.subType] = item.rating;
    ch.credits -= item.price;
    ch.shop.splice(index, 1);
  } else {
    ch.chips[item.subType] = item.rating;
    ch.credits -= item.price;
    ch.shop.splice(index, 1);
    message = "Chip purchased.";
  }
  calcCurrentLoad(cfg, ch);
  return message;
}

// ---------------------------------------------------------------------------
// Objednávky (OrderDlg.cpp)
// ---------------------------------------------------------------------------

/** Nejvyšší rating, který jde objednat. */
export function orderMaxRating(cfg: RulesConfig, ch: Character, type: ItemType, cls: number): number {
  if (type === ItemType.Hardware) return maxHardwareRating(cfg, cls);
  return cfg.order.maxRatingBase + cfg.order.maxRatingPerLifestyle * ch.lifestyle;
}

export function orderPrice(cfg: RulesConfig, type: ItemType, cls: number, rating: number): number {
  return itemPrice(cfg, type, cls, rating) * cfg.order.priceMultiplier;
}

export function orderDeliveryDays(cfg: RulesConfig, type: ItemType, price: number): number {
  const o = cfg.order;
  let idx = o.priceThresholds.findIndex((t) => price < t);
  if (idx === -1) idx = o.deliveryDays.length - 1;
  let days = o.deliveryDays[idx]!;
  if (type === ItemType.Software) days -= o.softwareDaysFaster;
  return days;
}

/** Třídy, které jdou objednat. Originál nabízel i "Client Program"; remaster ho vynechává. */
export function orderableClasses(type: ItemType): number[] {
  if (type === ItemType.Software) return [...Array(NUM_PROGRAMS).keys()].filter((c) => c !== ProgramClass.Client);
  if (type === ItemType.Chip) return [...Array(NUM_CHIPS).keys()];
  return [...Array(NUM_HW).keys()];
}

export function checkOrder(cfg: RulesConfig, ch: Character, type: ItemType, cls: number, rating: number): string | null {
  if (ch.order) return `Your order will arrive in ${ch.order.timeLeft} days.`;
  if (ch.credits < orderPrice(cfg, type, cls, rating)) return "You cannot afford this.";
  if (type === ItemType.Software) {
    if (ch.software.some((p) => p.cls === cls && p.rating === rating)) return "You already have a program of this rating.";
  } else if (type === ItemType.Chip) {
    if (ch.chips[cls]! >= rating) return "You already have a this chip of equal or higher rating.";
  } else if (ch.hardware[cls]! >= rating) {
    return "You already have this item of equal or higher rating.";
  }
  return null;
}

export function placeOrder(cfg: RulesConfig, ch: Character, type: ItemType, cls: number, rating: number): string {
  const err = checkOrder(cfg, ch, type, cls, rating);
  if (err) throw new Error(err);
  const price = orderPrice(cfg, type, cls, rating);
  ch.order = { type, cls, rating, timeLeft: orderDeliveryDays(cfg, type, price) };
  ch.credits -= price;
  return "Order has been placed.";
}
