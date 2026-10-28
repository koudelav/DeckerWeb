// Stav hry jako čistá data (serializovatelná do JSON).
// Odkazy mezi objekty (výchozí programy, zdroják ve vypalovačce, …) jsou přes číselná id,
// ne přes ukazatele jako v originálu.

import type {
  ChipType, ContractType, HardwareType, ItemType, Lifestyle, LoadStatus, ProgramClass, TargetObject,
} from "./constants";

/** CProgram */
export interface Program {
  id: number;
  name: string;
  cls: ProgramClass;
  rating: number;
  /** Nahrát do decku při vstupu do Matrixu. */
  loadByDefault: boolean;
  /** Rating nahrané kopie (0 = nenahráno). Mimo Matrix = rating, pokud loadByDefault. */
  loadedRating: number;
  /** Index zvuku (SOUND_*), −1 = bez zvuku. Výchozí = třída programu. */
  sound: number;
}

/** CSource – zdrojový kód programu nebo čipu */
export interface Source {
  id: number;
  type: ItemType.Software | ItemType.Chip;
  cls: number;
  rating: number;
}

/** CShopItem */
export interface ShopItem {
  text: string;
  type: ItemType;
  subType: number;
  rating: number;
  price: number;
}

/** CContract */
export interface Contract {
  corporation: number;
  systemName: string;
  systemSize: number;
  /** Bitová maska povolených cílů pro typ korporace (určuje i typy souborů v systému). */
  targetFlags: number;
  type: ContractType;
  targetObject: TargetObject;
  difficulty: number;
  pay: number;
  /** ContractFlag.* */
  flags: number;
  /** Časový limit v minutách (jen u ContractFlag.Timed). */
  timeLimit: number;
  daysLeft: number;
  numTargets: number;
}

export interface Skills {
  attack: number;
  defense: number;
  stealth: number;
  analysis: number;
  programming: number;
  chipDesign: number;
}
export type SkillName = keyof Skills;

/** Rozpracovaný projekt (m_nProject*) */
export interface Project {
  type: ItemType.Software | ItemType.Chip;
  cls: number;
  rating: number;
  initialTime: number;
  timeLeft: number;
}

/** Objednávka v obchodě (m_nOrder*) */
export interface Order {
  type: ItemType;
  cls: number;
  rating: number;
  timeLeft: number;
}

export interface GameDate {
  /** Den v měsíci od 0. */
  day: number;
  /** Měsíc 0..11. */
  month: number;
  year: number;
  /** Den v týdnu 0..6; při přechodu přes 7 je nový týden (nové kontrakty a zboží). */
  dayOfWeek: number;
}

export type DefaultSlot = "attack" | "armor" | "shield" | "hide" | "reflect";

/** CCharacter (část mimo Matrix) */
export interface Character {
  name: string;
  /** Index obrázku postavy (MISC_Characters). */
  image: number;
  ironMan: boolean;
  tooltips: boolean;

  credits: number;
  lifestyle: Lifestyle;
  repLevel: number;
  repPoints: number;
  skills: Skills;
  skillPoints: number;

  /** Zbývající měsíce zadních vrátek do systému korporace (index = korporace). */
  backdoor: number[];
  /** Zbývající dny zvýšené pohotovosti systému korporace. */
  systemAlerts: number[];

  /** Úroveň čipů (index = ChipType). */
  chips: number[];
  /** Úroveň hardwaru (index = HardwareType), 0 = nemá. */
  hardware: number[];
  software: Program[];
  defaults: Record<DefaultSlot, number | null>;
  currentLoad: number;
  loadStatus: LoadStatus;

  contracts: Contract[];
  currentContract: Contract | null;

  sources: Source[];
  project: Project | null;
  chipBurning: { sourceId: number; timeLeft: number } | null;
  /** Vypálený čip čeká na rozhodnutí hráče, zda ho nainstalovat. */
  chipReady: { cls: ChipType; rating: number } | null;

  shop: ShopItem[];
  order: Order | null;

  date: GameDate;
  onRun: boolean;
  health: { physical: number; mental: number; deck: number };

  /** Počitadlo pro přidělování id programům a zdrojákům. */
  nextId: number;
}

export type { HardwareType };
