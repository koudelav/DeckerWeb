// Postava: vytvoření, zatížení decku, efektivní ratingy, plynutí času.
// Originál: Character.cpp. Kuchařka: docs/pravidla/02-postava.md, 03-cas-a-lifestyle.md

import type { RulesConfig } from "./config";
import {
  CharRating, ChipType, ContractType, HardwareType, ItemType, Lifestyle, LoadStatus, MAX_LIFESTYLE, NUM_CHIPS, NUM_CORP, NUM_HW,
  ProgramClass, StartBonus,
} from "./constants";
import type { Ctx } from "./context";
import { generateContract, generateContracts } from "./contract";
import { conditionModifier, daysInMonth, repPointsForNextLevel } from "./dice";
import { CHIP_NAMES, LIFESTYLE_NAMES, MONTH_NAMES } from "./data/texts";
import { createProgram, programSize } from "./program";
import { generateShopItems } from "./shop";
import type { Character, DefaultSlot, Program, SkillName } from "./state";
import { idiv } from "./util";

export const SKILL_NAMES: readonly SkillName[] = ["attack", "defense", "stealth", "analysis", "programming", "chipDesign"];

/** CCharacter::CCharacter – postava před výběrem bonusu. */
export function createCharacter(cfg: RulesConfig): Character {
  const c = cfg.character;
  const ch: Character = {
    name: "",
    image: 0,
    ironMan: false,
    tooltips: false,
    credits: c.startCredits,
    lifestyle: Lifestyle.Street,
    repLevel: 0,
    repPoints: 0,
    skills: {
      attack: c.startSkill, defense: c.startSkill, stealth: c.startSkill,
      analysis: c.startSkill, programming: c.startSkill, chipDesign: c.startSkill,
    },
    skillPoints: 0,
    backdoor: new Array<number>(NUM_CORP).fill(0),
    systemAlerts: new Array<number>(NUM_CORP).fill(0),
    chips: new Array<number>(NUM_CHIPS).fill(c.startChip),
    hardware: new Array<number>(NUM_HW).fill(0),
    software: [],
    defaults: { attack: null, armor: null, shield: null, hide: null, reflect: null },
    currentLoad: 0,
    loadStatus: LoadStatus.Light,
    contracts: [],
    currentContract: null,
    sources: [],
    project: null,
    chipBurning: null,
    chipReady: null,
    shop: [],
    order: null,
    date: { day: 0, month: 0, year: c.startYear, dayOfWeek: 0 },
    onRun: false,
    health: { physical: cfg.health.max, mental: cfg.health.max, deck: cfg.health.max },
    nextId: 1,
  };
  calcCurrentLoad(cfg, ch);
  return ch;
}

export interface NewCharacterOptions {
  name: string;
  image: number;
  ironMan: boolean;
  tooltips: boolean;
  bonus: StartBonus;
}

/** CCharacter::CreateNew + nastavení z dialogu nové postavy (IntroDlg.cpp). */
export function createNewCharacter(ctx: Ctx, opts: NewCharacterOptions): Character {
  const { cfg } = ctx;
  const ch = createCharacter(cfg);
  const c = cfg.character;
  if (opts.bonus === StartBonus.Skills) {
    for (const s of SKILL_NAMES) ch.skills[s] = c.bonusSkill;
  } else if (opts.bonus === StartBonus.Hardware) {
    ch.chips.fill(c.bonusChip);
  } else if (opts.bonus === StartBonus.Money) {
    ch.credits = c.bonusCredits;
  }
  for (const cls of c.startPrograms) {
    const p = createProgram(ch, cls, opts.bonus === StartBonus.Software ? c.bonusSoftwareRating : 1);
    p.loadByDefault = true;
    ch.software.push(p);
    const slot = defaultSlotFor(cls);
    if (slot && ch.defaults[slot] === null && cls !== ProgramClass.AttackArea && cls !== ProgramClass.AttackPiercing) {
      ch.defaults[slot] = p.id;
    }
  }
  generateContracts(ctx, ch);
  generateShopItems(ctx, ch);
  ch.name = opts.name;
  ch.image = opts.image;
  ch.ironMan = opts.ironMan;
  ch.tooltips = opts.tooltips;
  calcCurrentLoad(cfg, ch);
  return ch;
}

/** Do kterého slotu výchozích programů program patří (DeckDataDialog OnDeckDefault). */
export function defaultSlotFor(cls: ProgramClass): DefaultSlot | null {
  switch (cls) {
    case ProgramClass.Attack:
    case ProgramClass.AttackArea:
    case ProgramClass.AttackPiercing:
      return "attack";
    case ProgramClass.Shield:
      return "shield";
    case ProgramClass.Armor:
      return "armor";
    case ProgramClass.Hide:
      return "hide";
    case ProgramClass.Reflect:
      return "reflect";
    default:
      return null;
  }
}

export function findProgramById(ch: Character, id: number | null): Program | null {
  if (id === null) return null;
  return ch.software.find((p) => p.id === id) ?? null;
}

export function isDefaultProgram(ch: Character, p: Program): boolean {
  return Object.values(ch.defaults).includes(p.id);
}

export function lifestyleName(ls: Lifestyle): string {
  return LIFESTYLE_NAMES[ls]!;
}

export function monthlyCost(cfg: RulesConfig, ls: Lifestyle): number {
  return cfg.lifestyle.monthlyCost[ls]!;
}

/** Cena přestěhování na vyšší lifestyle (null = už má nejvyšší). CharDataDialog.cpp */
export function lifestyleUpgradeCost(cfg: RulesConfig, ch: Character): number | null {
  if (ch.lifestyle >= MAX_LIFESTYLE) return null;
  return monthlyCost(cfg, ch.lifestyle + 1) * cfg.lifestyle.upgradeFactor;
}

/** Strop reputace pro současný lifestyle. */
export function repCap(cfg: RulesConfig, ch: Character): number {
  return (ch.lifestyle + 1) * cfg.reputation.capPerLifestyle;
}

export function formatDate(d: { day: number; month: number; year: number }): string {
  return `${MONTH_NAMES[d.month]} ${d.day + 1}, ${d.year}`;
}

/** Dny do zaplacení nájmu (konec měsíce). */
export function daysUntilRent(ch: Character): number {
  return daysInMonth(ch.date.month, ch.date.year) - ch.date.day;
}

/** Character.cpp GetLoadRatings: hranice zatížení decku v MP. */
export function loadRatings(cfg: RulesConfig, ch: Character): { light: number; heavy: number; max: number } {
  const sum = ch.chips[ChipType.Cpu]! + Math.min(ch.chips[ChipType.Coprocessor]!, ch.chips[ChipType.Cpu]!);
  return { light: cfg.deckLoad.lightFactor * sum, heavy: cfg.deckLoad.heavyFactor * sum, max: cfg.deckLoad.maxFactor * sum };
}

export function loadStatusFor(cfg: RulesConfig, ch: Character, load: number): LoadStatus {
  const r = loadRatings(cfg, ch);
  if (load < r.light) return LoadStatus.Light;
  if (load > r.heavy) return LoadStatus.Heavy;
  return LoadStatus.Normal;
}

/** Součet velikostí programů, které se nahrají při vstupu do Matrixu. */
export function defaultLoad(cfg: RulesConfig, ch: Character): number {
  return ch.software.filter((p) => p.loadByDefault).reduce((s, p) => s + programSize(cfg, p.cls, p.rating), 0);
}

/** Character.cpp CalcCurrentLoad: mimo Matrix nastaví nahrané ratingy podle loadByDefault. */
export function calcCurrentLoad(cfg: RulesConfig, ch: Character): void {
  let load = 0;
  for (const p of ch.software) {
    if (!ch.onRun) p.loadedRating = p.loadByDefault ? p.rating : 0;
    if (p.loadedRating !== 0) load += programSize(cfg, p.cls, p.rating);
  }
  ch.currentLoad = load;
  ch.loadStatus = loadStatusFor(cfg, ch, load);
}

/** Character.cpp FindProgram: nejvýše hodnocený program třídy (nahraný, nebo jakýkoli). */
export function findProgram(ch: Character, cls: ProgramClass, loadedOnly = true): Program | null {
  let best: Program | null = null;
  for (const p of ch.software) {
    if (p.cls !== cls) continue;
    if (loadedOnly) {
      if (p.loadedRating > 0 && (best === null || p.loadedRating > best.loadedRating)) best = p;
    } else if (best === null || p.rating > best.rating) {
      best = p;
    }
  }
  return best;
}

/** Okolnosti v Matrixu, které ovlivňují efektivní rating (mimo Matrix vše vypnuto). */
export interface RatingEnv {
  smoke: boolean;
  boostClass: ProgramClass | null;
  traced: boolean;
  clientProgramActive: boolean;
}
export const HOME_ENV: RatingEnv = { smoke: false, boostClass: null, traced: false, clientProgramActive: false };

/** Character.cpp GetEffectiveRating */
export function effectiveRating(cfg: RulesConfig, ch: Character, type: CharRating, env: RatingEnv = HOME_ENV): number {
  const r = cfg.ratings;
  const cpu = ch.chips[ChipType.Cpu]!;
  let rating = 0;
  switch (type) {
    case CharRating.Attack:
      rating = Math.min(ch.chips[ChipType.Attack]!, cpu) + ch.skills.attack;
      if (env.smoke) rating += r.smokeAttack;
      if (env.boostClass === ProgramClass.AttackBoost) rating += r.boostBonus;
      break;
    case CharRating.Defense:
      rating = Math.min(ch.chips[ChipType.Defense]!, cpu) + ch.skills.defense;
      if (env.smoke) rating += r.smokeDefense;
      if (env.boostClass === ProgramClass.DefenseBoost) rating += r.boostBonus;
      break;
    case CharRating.Stealth:
      rating = Math.min(ch.chips[ChipType.Stealth]!, cpu) + ch.skills.stealth;
      if (env.smoke) rating += r.smokeStealth;
      if (env.traced) rating += r.tracedStealth;
      if (env.boostClass === ProgramClass.StealthBoost) rating += r.boostBonus;
      break;
    case CharRating.Analysis:
      rating = Math.min(ch.chips[ChipType.Analysis]!, cpu) + ch.skills.analysis;
      if (env.smoke) rating += r.smokeAnalysis;
      if (env.boostClass === ProgramClass.AnalysisBoost) rating += r.boostBonus;
      break;
  }
  if (ch.loadStatus === LoadStatus.Light) rating += cfg.deckLoad.lightBonus;
  else if (ch.loadStatus === LoadStatus.Heavy) rating -= cfg.deckLoad.heavyPenalty;
  if (env.clientProgramActive) rating -= r.clientProgramPenalty;
  rating += idiv(conditionModifier(cfg, ch.health.deck), r.deckConditionDivisor);
  rating += conditionModifier(cfg, Math.min(ch.health.mental, ch.health.physical));
  return rating;
}

/** Character.cpp GetEffectiveLevel: průměrná úroveň dovedností včetně nevyužitých bodů. */
export function effectiveLevel(ch: Character): number {
  const totalPoints = (n: number) => idiv(n * (n - 1), 2);
  let total = ch.skillPoints;
  for (const s of SKILL_NAMES) total += totalPoints(ch.skills[s]);
  total = idiv(total, 6);
  let level = 1;
  while (total >= level) {
    total -= level;
    level++;
  }
  return level;
}

/** Character.cpp GetCurrentItemLevel: co už hráč má (pro sloupec "Current" v obchodě). */
export function currentItemLevel(ch: Character, type: ItemType, subType: number): number {
  if (type === ItemType.Software) {
    return ch.software.filter((p) => p.cls === subType).reduce((m, p) => Math.max(m, p.rating), 0);
  }
  if (type === ItemType.Hardware) return ch.hardware[subType]!;
  return ch.chips[subType]!;
}

/** Character.cpp GetHardwareString */
export function hardwareText(hw: HardwareType, rating: number): string {
  switch (hw) {
    case HardwareType.ChipBurner:
      return "Chip Burner" + (rating === 2 ? " (Double Speed)" : rating === 3 ? " (Triple Speed)" : rating === 4 ? " (Quad Speed)" : "");
    case HardwareType.SurgeSuppressor:
      return `Surge Suppressor Level ${rating}`;
    case HardwareType.NeuralDamper:
      return `Neural Damper Level ${rating}`;
    case HardwareType.TraceMonitor:
      return `Trace Monitor Level ${rating}`;
    case HardwareType.BioMonitor:
      return "Bio Monitor" + (rating === 2 ? " w/ AutoDump" : "");
    case HardwareType.HighBandwidthBus:
      return `High Bandwidth Bus Level ${rating}`;
    case HardwareType.ProximityMapper:
      return "Proximity Mapper";
    case HardwareType.DesignAssistant:
      return `Design Assistant Level ${rating}`;
    case HardwareType.AntiTraceProxy:
      return "AntiTrace Proxy";
  }
}

export function chipName(cls: ChipType): string {
  return CHIP_NAMES[cls]!;
}

/** Character.cpp GetChipComplexity */
export function chipComplexity(cfg: RulesConfig, cls: ChipType): number {
  return cfg.chips.complexity[cls]!;
}

// ---------------------------------------------------------------------------
// Dovednosti a lifestyle (CharDataDialog.cpp)
// ---------------------------------------------------------------------------

export function skillIncreaseCost(cfg: RulesConfig, ch: Character, skill: SkillName): number {
  return ch.skills[skill] * cfg.skills.costPerLevel;
}

export function canIncreaseSkill(cfg: RulesConfig, ch: Character, skill: SkillName): boolean {
  return !ch.onRun && skillIncreaseCost(cfg, ch, skill) <= ch.skillPoints;
}

export function increaseSkill(cfg: RulesConfig, ch: Character, skill: SkillName): void {
  if (!canIncreaseSkill(cfg, ch, skill)) throw new Error("Nedostatek bodů dovedností");
  ch.skillPoints -= skillIncreaseCost(cfg, ch, skill);
  ch.skills[skill]++;
}

export function canUpgradeLifestyle(cfg: RulesConfig, ch: Character): boolean {
  const cost = lifestyleUpgradeCost(cfg, ch);
  return !ch.onRun && cost !== null && ch.credits >= cost;
}

/** Přestěhování: zaplatí, zvýší lifestyle, nový obchod a nové nabídky kontraktů. */
export function upgradeLifestyle(ctx: Ctx, ch: Character): void {
  if (!canUpgradeLifestyle(ctx.cfg, ch)) throw new Error("Upgrade lifestylu není možný");
  ch.lifestyle++;
  ch.credits -= monthlyCost(ctx.cfg, ch.lifestyle) * ctx.cfg.lifestyle.upgradeFactor;
  generateShopItems(ctx, ch);
  ch.contracts = [];
  generateContracts(ctx, ch);
}

// ---------------------------------------------------------------------------
// Plynutí času (Character.cpp PassTime)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { kind: "rent"; amount: number; message: string }
  | { kind: "lifestyleDowngrade"; lifestyle: Lifestyle; message: string }
  | { kind: "gameOver"; message: string }
  | { kind: "contractFailed"; message: string }
  | { kind: "newWeek"; message: string }
  | { kind: "chipReady"; cls: ChipType; rating: number; oldRating: number; message: string }
  | { kind: "orderArrived"; message: string }
  | { kind: "info"; message: string };

export interface PassTimeResult {
  events: GameEvent[];
  /** Hra skončila (hráč zkrachoval). */
  gameOver: boolean;
}

/** Ztráta reputace při nesplnění kontraktu (propadlý termín, zrušení). */
export function loseContractReputation(cfg: RulesConfig, ch: Character, points: number): void {
  ch.repPoints = Math.max(0, ch.repPoints - points);
  if (ch.repLevel > 0 && ch.repPoints < repPointsForNextLevel(cfg, ch.repLevel - 1)) ch.repLevel--;
}

/** Odebere přijatý kontrakt; u mise Run Program smaže i klientský program. ClearCurrentContract */
export function clearCurrentContract(cfg: RulesConfig, ch: Character): void {
  if (!ch.currentContract) return;
  if (ch.currentContract.type === ContractType.RunProgram) {
    for (let i = ch.software.length - 1; i >= 0; i--) {
      if (ch.software[i]!.cls === ProgramClass.Client) {
        ch.software.splice(i, 1);
        break;
      }
    }
    calcCurrentLoad(cfg, ch);
  }
  ch.currentContract = null;
}

/**
 * Nová funkce remasteru (To-Do originálu "Cancel a contract"): zrušení přijatého kontraktu
 * mimo Matrix. Reputace klesne stejně jako při propadnutí termínu (× contracts.cancelRepPenaltyFactor).
 */
export function cancelContract(cfg: RulesConfig, ch: Character): string {
  const c = ch.currentContract;
  if (!c || ch.onRun) throw new Error("Kontrakt nejde zrušit");
  loseContractReputation(cfg, ch, Math.round(c.difficulty * cfg.contracts.cancelRepPenaltyFactor));
  clearCurrentContract(cfg, ch);
  return "The contract has been cancelled. Your reputation has suffered as a result.";
}

/**
 * Character.cpp PassTime: posune čas o `days` dní.
 * Hlášky, které originál ukazoval jako MessageBox, vrací jako události pro UI.
 * Dotaz na instalaci vypáleného čipu se odloží do ch.chipReady (vyřeší installReadyChip).
 */
export function passTime(ctx: Ctx, ch: Character, days: number): PassTimeResult {
  const { cfg } = ctx;
  const events: GameEvent[] = [];
  const d = ch.date;

  d.day += days;
  while (d.day >= daysInMonth(d.month, d.year)) {
    d.day -= daysInMonth(d.month, d.year);
    d.month++;
    if (d.month === 12) {
      d.month = 0;
      d.year++;
    }
    // Nájem
    const rent = monthlyCost(cfg, ch.lifestyle);
    if (ch.credits >= rent) {
      ch.credits -= rent;
      events.push({ kind: "rent", amount: rent, message: `Your monthly rent of ${rent}cr has been collected.` });
    } else {
      while (ch.credits < monthlyCost(cfg, ch.lifestyle)) {
        if (ch.lifestyle === Lifestyle.Street) {
          events.push({
            kind: "gameOver",
            message: "You are broke. Some thugs come to 'reposess' all of your possessions, including your cyberdeck.\nGame over.",
          });
          return { events, gameOver: true };
        }
        ch.lifestyle--;
      }
      ch.credits -= monthlyCost(cfg, ch.lifestyle);
      events.push({
        kind: "lifestyleDowngrade",
        lifestyle: ch.lifestyle,
        message: `You do not have enough money for rent. Your lifestyle has been down downgraded to ${lifestyleName(ch.lifestyle)}.`,
      });
    }
    // Zadní vrátka vydrží o měsíc méně
    for (let i = 0; i < NUM_CORP; i++) if (ch.backdoor[i]! > 0) ch.backdoor[i]!--;
  }

  // Nabízené kontrakty: vypršení, jinak roste odměna
  const list = ch.contracts;
  for (let i = 0; i < list.length; ) {
    const c = list[i]!;
    if (c.daysLeft <= days) {
      list.splice(i, 1);
      if (ctx.rng.random(cfg.time.expiredContractReplaceChanceDie) === 0) {
        const fresh = generateContract(ctx, ch);
        // Originál: InsertBefore(p) na místo vypršelé nabídky. Na konci seznamu je p == NULL
        // a MFC InsertBefore(NULL) vkládá na ZAČÁTEK seznamu – chování zachováno.
        if (i >= list.length) {
          list.unshift(fresh);
          i++;
        } else {
          list.splice(i, 0, fresh);
          i++;
        }
      }
    } else {
      c.daysLeft -= days;
      c.pay += idiv(c.pay * days, cfg.time.contractPayIncreaseDivisor);
      i++;
    }
  }

  // Přijatý kontrakt: termín
  if (ch.currentContract) {
    if (ch.currentContract.daysLeft <= days) {
      events.push({
        kind: "contractFailed",
        message: "The deadline for you contract has passed. Your reputation has suffered as a result.",
      });
      loseContractReputation(cfg, ch, ch.currentContract.difficulty);
      clearCurrentContract(cfg, ch);
    } else {
      ch.currentContract.daysLeft -= days;
    }
  }

  // Nový týden
  d.dayOfWeek += days;
  if (d.dayOfWeek >= cfg.time.daysPerWeek) {
    d.dayOfWeek %= cfg.time.daysPerWeek;
    generateShopItems(ctx, ch);
    generateContracts(ctx, ch);
    events.push({ kind: "newWeek", message: "New contracts and shop items available." });
  }

  // Vypalování čipu
  if (ch.chipBurning) {
    ch.chipBurning.timeLeft -= days * ch.hardware[HardwareType.ChipBurner]!;
    if (ch.chipBurning.timeLeft <= 0) {
      const src = ch.sources.find((s) => s.id === ch.chipBurning!.sourceId);
      ch.chipBurning = null;
      if (src) {
        const cls = src.cls as ChipType;
        ch.chipReady = { cls, rating: src.rating };
        events.push({
          kind: "chipReady",
          cls,
          rating: src.rating,
          oldRating: ch.chips[cls]!,
          message: `Your new Rating ${src.rating} ${chipName(cls)} chip is done. Do you wish to install it? (Old chip is rating ${ch.chips[cls]})`,
        });
      }
    }
  }

  // Objednávka
  if (ch.order) {
    ch.order.timeLeft -= days;
    if (ch.order.timeLeft <= 0) {
      const o = ch.order;
      events.push({ kind: "orderArrived", message: "Your order has arrived." });
      if (o.type === ItemType.Software) {
        ch.software.push(createProgram(ch, o.cls as ProgramClass, o.rating));
      } else if (o.type === ItemType.Chip) {
        ch.chips[o.cls] = o.rating;
      } else {
        ch.hardware[o.cls] = o.rating;
      }
      ch.order = null;
    }
  }

  // Pohotovost systémů korporací
  for (let i = 0; i < NUM_CORP; i++) {
    ch.systemAlerts[i] = ch.systemAlerts[i]! > days ? ch.systemAlerts[i]! - days : 0;
  }

  calcCurrentLoad(cfg, ch);
  return { events, gameOver: false };
}

/** Rozhodnutí o vypáleném čipu (originál: dotaz Ano/Ne v PassTime). */
export function installReadyChip(ch: Character, install: boolean): string {
  const ready = ch.chipReady;
  if (!ready) return "";
  ch.chipReady = null;
  if (install) {
    ch.chips[ready.cls] = ready.rating;
    return "Chip has been installed.";
  }
  return "Chip has been discarded.";
}
