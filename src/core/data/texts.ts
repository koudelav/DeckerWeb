// Textové tabulky z originálu (Decker 1.12, © 2001 Shawn Overcash, GPL v2).
// Texty hry zůstávají anglicky jako v originálu.

/** Global.cpp g_szMonthNames */
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Global.cpp g_nDaysPerMonth (únor bez přestupného roku) */
export const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Global.cpp g_szLifestyleString */
export const LIFESTYLE_NAMES = ["Poverty", "Lower Class", "Middle Class", "Upper Class", "Elite"] as const;

/** Global.cpp g_szRepLevelString */
export const REP_LEVEL_NAMES = [
  "Nobody", "Wannabe", "Cyber Surfer", "Matrix Runner", "Newbie Hacker", "Journeyman Hacker",
  "Competent Hacker", "Experienced Hacker", "Hacker Extraordinaire", "Cyber Thief", "Cyber Sleuth",
  "Cyber Warrior", "Cyber Wizard", "Ice Crusher", "Node Master", "System Master", "Ghost in the Machine",
  "Digital Dream", "Digital Nightmare", "Master of the Matrix", "Matrix God",
] as const;

/** Character.cpp g_szHardwareName */
export const HARDWARE_NAMES = [
  "Chip Burner", "Surge Suppressor", "Neural Damper", "Trace Monitor", "Bio Monitor",
  "High Bandwidth Bus", "Proximity Mapper", "Design Assistant", "AntiTrace Proxy",
] as const;

/** ShopItem.cpp g_szChipNames */
export const CHIP_NAMES = [
  "CPU", "Attack Firmware", "Defense Firmware", "Stealth Firmware", "Analysis Firmware", "Coprocessor",
] as const;

/** Contract.cpp g_szContractTypeText */
export const CONTRACT_TYPE_NAMES = [
  "Steal Files", "Steal & Erase Files", "Erase Files", "Alter Files", "Deactivate I/O",
  "Activate I/O", "Sabotage", "Crash System", "Create Backdoor", "Run Program",
] as const;

/** Contract.cpp g_szTargetObjectText */
export const TARGET_OBJECT_NAMES = [
  "valuable research data", "chemical formulae", "personnel files", "financial data", "grade reports",
  "security files", "security camera recordings", "blueprints", "employee evaluation records",
  "product information", "medical records", "records of illegal activity", "test results",
  "inventory records", "electronic doorlocks", "security cameras", "alarm systems", "fire alarms",
  "security alarms", "radiation leak alarms", "biohazard alarms", "hazardous chemical alarms",
  "manufacturing controls", "chemical production", "vault controls", "CPU", "an I/O node",
  "a datastore", "the CPU",
] as const;

/** Node.cpp g_szNodeAbbrev */
export const NODE_ABBREV = ["CPU", "SPU", "COP", "DS", "IO", "JN", "PI", "PO"] as const;

/** Názvy typů nodů pro UI. */
export const NODE_TYPE_NAMES = [
  "CPU", "SPU", "Coprocessor", "Datastore", "I/O Controller", "Junction", "Portal (in)", "Portal (out)",
] as const;

/** Ice.cpp g_szType */
export const ICE_TYPE_NAMES = ["Gateway", "Probe", "Guardian", "Tapeworm", "Attack", "Trace"] as const;
/** Ice.cpp g_szAttackType – index: 0 normální, 1 hardened, 2 phasing, 3 crash */
export const ICE_ATTACK_TYPE_NAMES = ["Attack", "Attack (Hardened)", "Attack (Phasing)", "Attack (Crash)"] as const;
export const ICE_KILLER_TYPE_NAMES = ["Killer", "Killer (Hardened)", "Killer (Phasing)", "Killer (Crash)"] as const;
export const ICE_TRACE_TYPE_NAMES = ["Trace", "Trace & Dump", "Trace & Fry"] as const;
export const ICE_TAPEWORM_TYPE_NAMES = ["Tapeworm", "DataBomb"] as const;

/** Speciální obsah souborů (DSFile.cpp) */
export const FILE_SPECIAL_CONTENT = {
  clue: "<Clue>",
  passcode: "<Passcode File>",
  program: "<Program>",
  source: "<Source Code>",
} as const;

/**
 * Šablony rozmístění uvnitř nodu 9×9 (Node.cpp g_nGridTemplate*): 1 = obsazeno grafikou nodu,
 * 0 = volné místo pro decker/ICE. Index = NodeType.
 */
const G_CPU = [
  "111000111", "110000011", "100000001", "000111000", "000111000", "000111000", "100000001", "110000011", "111000111",
];
const G_SPU = [
  "111000111", "110000011", "100000001", "000101000", "000000000", "000101000", "100000001", "110000011", "111000111",
];
const G_COP = [
  "111000111", "111000111", "110000011", "100000001", "000010000", "100000001", "110000011", "111000111", "111000111",
];
const G_PORTAL = [
  "000000000", "000000000", "000000000", "000010000", "000010000", "000010000", "000000000", "000000000", "000000000",
];
const G_DS = [
  "110000001", "000000000", "010100100", "000110000", "000010100", "000100000", "100001000", "000000011", "010000011",
];
const G_IO = [
  "111000111", "100000001", "100000001", "000000000", "000000000", "000000000", "100000001", "100000001", "111000111",
];
const G_JUNC = [
  "111101111", "111000111", "110000011", "100000001", "000000000", "100000001", "110000011", "111000111", "111101111",
];
function grid(rows: string[]): readonly (readonly number[])[] {
  return rows.map((r) => [...r].map((c) => (c === "1" ? 1 : 0)));
}
export const NODE_GRID_SIZE = 9;
export const NODE_GRIDS: readonly (readonly (readonly number[])[])[] = [
  grid(G_CPU), grid(G_SPU), grid(G_COP), grid(G_DS), grid(G_IO), grid(G_JUNC), grid(G_PORTAL), grid(G_PORTAL),
];
