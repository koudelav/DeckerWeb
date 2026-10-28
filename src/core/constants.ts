// Číselníky z originálu (Decker 1.12). Číselné hodnoty odpovídají původním #define,
// aby šlo kód snadno porovnávat s C++ zdrojáky.

/** Program.h PROGRAM_* */
export enum ProgramClass {
  Attack = 0,
  AttackArea = 1,
  AttackPiercing = 2,
  Slow = 3,
  Virus = 4,
  Silence = 5,
  Confuse = 6,
  Weaken = 7,
  Shield = 8,
  Smoke = 9,
  Decoy = 10,
  Medic = 11,
  Armor = 12,
  Hide = 13,
  Deceive = 14,
  Relocate = 15,
  Analyze = 16,
  Scan = 17,
  Evaluate = 18,
  Decrypt = 19,
  Reflect = 20,
  AttackBoost = 21,
  DefenseBoost = 22,
  StealthBoost = 23,
  AnalysisBoost = 24,
  /** Program dodaný klientem – jen pro mise typu Run Program. */
  Client = 25,
}
export const NUM_PROGRAMS = 26;

/** Character.h LS_* (lifestyle) */
export enum Lifestyle {
  Street = 0,
  Low = 1,
  Medium = 2,
  High = 3,
  Elite = 4,
}
export const MAX_LIFESTYLE = 4;

/** Character.h IT_* */
export enum ItemType {
  Software = 0,
  Chip = 1,
  Hardware = 2,
}

/** Character.h CHIP_* */
export enum ChipType {
  Cpu = 0,
  Attack = 1,
  Defense = 2,
  Stealth = 3,
  Analysis = 4,
  Coprocessor = 5,
}
export const NUM_CHIPS = 6;

/** Character.h HW_* */
export enum HardwareType {
  ChipBurner = 0,
  SurgeSuppressor = 1,
  NeuralDamper = 2,
  TraceMonitor = 3,
  BioMonitor = 4,
  HighBandwidthBus = 5,
  ProximityMapper = 6,
  DesignAssistant = 7,
  AntiTraceProxy = 8,
}
export const NUM_HW = 9;

/** Character.h RATING_* (efektivní rating postavy) */
export enum CharRating {
  Attack = 0,
  Defense = 1,
  Stealth = 2,
  Analysis = 3,
}

/** Character.h LS_LIGHT.. (zatížení decku) */
export enum LoadStatus {
  Light = 0,
  Normal = 1,
  Heavy = 2,
}

/** Character.h BONUS_* (startovní bonus) */
export enum StartBonus {
  None = 0,
  Skills = 1,
  Hardware = 2,
  Software = 3,
  Money = 4,
}

export const MAX_DECOYS = 5;

/** Contract.h – počet korporací */
export const NUM_CORP = 100;

/** Contract.h CONT_* */
export enum ContractType {
  Steal = 0,
  StealErase = 1,
  Erase = 2,
  Edit = 3,
  DeactivateIO = 4,
  ActivateIO = 5,
  SabotageIO = 6,
  CrashSystem = 7,
  Backdoor = 8,
  RunProgram = 9,
}
export const NUM_CONTRACT_TYPES = 10;

/** Contract.h CT_* (cílový objekt kontraktu) */
export enum TargetObject {
  ResearchData = 0,
  ChemFormula = 1,
  PersonnelFiles = 2,
  FinancialData = 3,
  GradeReports = 4,
  SecurityFiles = 5,
  SecurityCamRec = 6,
  Blueprints = 7,
  EmployeeEval = 8,
  ProductInfo = 9,
  MedicalRecords = 10,
  IllegalActivity = 11,
  TestResults = 12,
  InventoryData = 13,
  Doorlocks = 14,
  SecurityCameras = 15,
  AlarmSystems = 16,
  FireAlarms = 17,
  SecurityAlarms = 18,
  RadiationAlarms = 19,
  BiohazardAlarms = 20,
  ChemAlarms = 21,
  ManufControls = 22,
  ChemProduction = 23,
  VaultControls = 24,
  Cpu = 25,
  NodeIO = 26,
  NodeDS = 27,
  NodeCpu = 28,
}
/** Rozsahy cílů podle typu mise (Contract.cpp CT_MIN_* / CT_MAX_*) */
export const TARGET_RANGE = {
  datastore: [TargetObject.ResearchData, TargetObject.InventoryData],
  deactivate: [TargetObject.Doorlocks, TargetObject.AlarmSystems],
  activate: [TargetObject.FireAlarms, TargetObject.ChemAlarms],
  sabotage: [TargetObject.Doorlocks, TargetObject.VaultControls],
  runProgram: [TargetObject.NodeIO, TargetObject.NodeCpu],
} as const;

/** Contract.h CF_* */
export const ContractFlag = {
  NoAlarms: 0x1,
  Timed: 0x2,
} as const;

/** Contract.cpp CT_MEGACORP.. (typ korporace) */
export enum CorpType {
  MegaCorp = 0,
  Electronics = 1,
  Bank = 2,
  Lab = 3,
  Consumer = 4,
  Medical = 5,
  Oil = 6,
  Manufacturing = 7,
  School = 8,
  Environmental = 9,
}

/** Node.h NT_* */
export enum NodeType {
  Cpu = 0,
  Spu = 1,
  Cop = 2,
  DataStore = 3,
  IO = 4,
  Junction = 5,
  PortalIn = 6,
  PortalOut = 7,
}

/** Node.h DIR_* */
export enum Dir {
  North = 0,
  East = 1,
  South = 2,
  West = 3,
  None = -1,
  Center = -2,
}
export function oppDir(d: number): number {
  return (d + 2) % 4;
}
/** System.cpp g_ptDirCoord – posun souřadnic pro směr (y roste dolů). */
export const DIR_COORD: readonly { x: number; y: number }[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Node.h NST_* (podtypy nodů) */
export const NodeSubtype = {
  IoUseless: 0,
  IoQuest: 1,
  IoAlarm: 2,
  IoIcePort: 3,
  IoMatrix: 4,
  DsNormal: 0,
  DsQuest: 1,
  CopNormal: 0,
  CopSecurity: 1,
} as const;

/** Ice.h ICE_* */
export enum IceType {
  Gateway = 0,
  Probe = 1,
  Guardian = 2,
  Tapeworm = 3,
  Attack = 4,
  Trace = 5,
}
/** Nejvyšší číslo bílého ICE (Gateway..Tapeworm). */
export const MAX_WHITE = 3;

/** Ice.h AST_* (podtypy útočného ICE – bitové příznaky) */
export const AttackSubtype = {
  Normal: 0x0000,
  Hardened: 0x0001,
  Phasing: 0x0002,
  Crash: 0x0004,
  Killer: 0x1000,
} as const;

/** Ice.h TST_* */
export enum TraceSubtype {
  Normal = 0,
  Dump = 1,
  Fry = 2,
}

/** Ice.h TWST_* */
export enum TapewormSubtype {
  Normal = 0,
  DataBomb = 1,
}

/** Ice.h RATING_* (typ ratingu ICE) */
export enum IceRating {
  Normal = 0,
  Combat = 1,
  Sensors = 2,
}

/** Ice.h STATE_* */
export const IceState = {
  Inactive: 0x00,
  Guarding: 0x01,
  Following: 0x02,
  Moving: 0x03,
  Searching: 0x04,
  Destroying: 0x05,
  Queried1: 0x06,
  Queried2: 0x07,
  Queried3: 0x08,
  GuardingHostile: 0x11,
  Attacking: 0x12,
  MovingHostile: 0x13,
  MaskHostile: 0x10,
} as const;

/** System.h ALERT_* */
export enum Alert {
  Green = 0,
  Yellow = 1,
  Red = 2,
}

/** DSFile.h FT_* */
export enum FileType {
  Useless = 0,
  Valuable = 1,
  Passcode = 2,
  Clue = 3,
  Quest = 4,
  Program = 5,
  ProgramSource = 6,
  ChipSource = 7,
}

/** DSFile.h STATE_* (stav souboru – bitové příznaky) */
export const FileState = {
  InNode: 0x01,
  InDeck: 0x02,
  EditedInNode: 0x04,
  EditedInDeck: 0x08,
  Scanned: 0x10,
  Evaluated: 0x20,
} as const;
