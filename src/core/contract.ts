// Kontrakty. Originál: Contract.cpp, Character.cpp GenerateContracts, ContractListDialog.cpp.
// Kuchařka: docs/pravidla/06-kontrakty.md

import type { RulesConfig } from "./config";
import {
  ContractFlag, ContractType, CorpType, NUM_CONTRACT_TYPES, ProgramClass, TARGET_RANGE, TargetObject,
} from "./constants";
import type { Ctx } from "./context";
import { CORPORATIONS } from "./data/corporations";
import { CONTRACT_TYPE_NAMES, TARGET_OBJECT_NAMES } from "./data/texts";
import { applyVariance } from "./dice";
import { createProgram } from "./program";
import type { Character, Contract } from "./state";
import { idiv } from "./util";

const bit = (t: TargetObject) => 1 << t;
const T = TargetObject;

/** Cíle dostupné u všech korporací (Contract.cpp CTF_COMMON). */
const COMMON =
  bit(T.PersonnelFiles) | bit(T.FinancialData) | bit(T.SecurityFiles) | bit(T.SecurityCamRec) | bit(T.EmployeeEval) |
  bit(T.IllegalActivity) | bit(T.Doorlocks) | bit(T.SecurityCameras) | bit(T.AlarmSystems) | bit(T.FireAlarms) |
  bit(T.SecurityAlarms);

/** Povolené cíle podle typu korporace (Contract.cpp g_dwValidTarget). */
export const VALID_TARGETS: Record<CorpType, number> = {
  [CorpType.MegaCorp]: COMMON | bit(T.ResearchData) | bit(T.ChemFormula) | bit(T.Blueprints) | bit(T.ProductInfo) |
    bit(T.MedicalRecords) | bit(T.TestResults) | bit(T.InventoryData),
  [CorpType.Electronics]: COMMON | bit(T.ResearchData) | bit(T.Blueprints) | bit(T.ProductInfo) | bit(T.TestResults) |
    bit(T.InventoryData) | bit(T.ChemAlarms) | bit(T.ManufControls),
  [CorpType.Bank]: COMMON,
  [CorpType.Lab]: COMMON | bit(T.ResearchData) | bit(T.ChemFormula) | bit(T.ProductInfo) | bit(T.MedicalRecords) |
    bit(T.TestResults) | bit(T.InventoryData) | bit(T.RadiationAlarms) | bit(T.BiohazardAlarms) | bit(T.ChemAlarms) |
    bit(T.ChemProduction),
  [CorpType.Consumer]: COMMON | bit(T.ProductInfo) | bit(T.InventoryData),
  [CorpType.Medical]: COMMON | bit(T.ResearchData) | bit(T.ChemFormula) | bit(T.MedicalRecords) | bit(T.TestResults) |
    bit(T.RadiationAlarms) | bit(T.BiohazardAlarms) | bit(T.ChemProduction),
  [CorpType.Oil]: COMMON | bit(T.ChemFormula) | bit(T.TestResults) | bit(T.ChemAlarms) | bit(T.ChemProduction),
  [CorpType.Manufacturing]: COMMON | bit(T.Blueprints) | bit(T.ProductInfo) | bit(T.InventoryData) | bit(T.ManufControls),
  [CorpType.School]: COMMON | bit(T.ResearchData) | bit(T.ChemFormula) | bit(T.GradeReports) | bit(T.Blueprints) |
    bit(T.MedicalRecords) | bit(T.TestResults) | bit(T.RadiationAlarms) | bit(T.BiohazardAlarms) | bit(T.ChemAlarms),
  [CorpType.Environmental]: COMMON | bit(T.TestResults) | bit(T.BiohazardAlarms) | bit(T.ChemAlarms),
};

/** Základní obtížnost kontraktů pro postavu: reputace, omezená lifestylem, nejméně 1. */
export function baseDifficulty(cfg: RulesConfig, ch: Character): number {
  const cap = (ch.lifestyle + 1) * cfg.contracts.difficultyCapPerLifestyle;
  const base = ch.repLevel > cap ? cap : ch.repLevel;
  return base === 0 ? 1 : base;
}

function weightedPick(ctx: Ctx, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = ctx.rng.random(total);
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]!) return i;
    roll -= weights[i]!;
  }
  return weights.length - 1;
}

/** Contract.cpp CContract::Generate */
export function generateContract(ctx: Ctx, ch: Character): Contract {
  const { cfg, rng } = ctx;
  const k = cfg.contracts;
  const base = baseDifficulty(cfg, ch);
  let difficulty = base;

  // Velikost systému kolem cílové obtížnosti
  const shift = k.difficultySpread[rng.random(k.difficultySpread.length)]!;
  for (let s = 0; s < Math.abs(shift); s++) {
    if (shift < 0 && difficulty !== 1) difficulty--;
    if (shift > 0 && difficulty !== k.maxDifficulty) difficulty++;
  }
  const systemSize = difficulty;
  const corporation = (systemSize - 1) * 5 + rng.random(5);
  const corp = CORPORATIONS[corporation]!;

  const type = weightedPick(ctx, k.typeWeights.slice(0, NUM_CONTRACT_TYPES)) as ContractType;
  const targetFlags = VALID_TARGETS[corp.type];

  let targetObject: TargetObject;
  let range: readonly [number, number] | null = null;
  switch (type) {
    case ContractType.Steal:
    case ContractType.StealErase:
    case ContractType.Erase:
    case ContractType.Edit:
      range = TARGET_RANGE.datastore;
      break;
    case ContractType.DeactivateIO:
      range = TARGET_RANGE.deactivate;
      break;
    case ContractType.ActivateIO:
      range = TARGET_RANGE.activate;
      break;
    case ContractType.SabotageIO:
      range = TARGET_RANGE.sabotage;
      break;
  }
  if (type === ContractType.CrashSystem || type === ContractType.Backdoor) {
    targetObject = TargetObject.Cpu;
  } else if (type === ContractType.RunProgram) {
    const [lo, hi] = TARGET_RANGE.runProgram;
    targetObject = (lo + rng.random(1 + hi - lo)) as TargetObject;
  } else {
    const [lo, hi] = range!;
    do {
      targetObject = (lo + rng.random(1 + hi - lo)) as TargetObject;
    } while ((targetFlags & (1 << targetObject)) === 0);
  }

  let flags = 0;
  if (rng.random(k.noAlarmChanceDie) < k.noAlarmChance[type]!) {
    flags |= ContractFlag.NoAlarms;
    difficulty += k.noAlarmDifficulty;
  }

  let timeLimit = 0;
  if (base >= k.timedMinBaseDifficulty && rng.random(k.timedChanceDie) === 0) {
    flags |= ContractFlag.Timed;
    timeLimit = k.timedMinutesPerArea * idiv(systemSize + 3, 4);
    difficulty += k.timedDifficulty;
  }

  let numTargets = 1;
  if (targetObject !== TargetObject.Cpu && targetObject !== TargetObject.NodeCpu) {
    if (rng.random(k.multiTargetChanceDie) < base) {
      numTargets = k.multiTargetMin + rng.random(k.multiTargetExtraDie);
      difficulty += idiv(numTargets, k.multiTargetDifficultyDivisor);
    }
  }

  const daysLeft = flags & ContractFlag.Timed ? 1 : rng.random(k.daysDie) + 1;

  let pay = k.payPerDifficulty * (difficulty + ch.lifestyle);
  pay += idiv(pay * (k.payDaysPivot - daysLeft), k.payDaysDivisor);
  pay = applyVariance(ctx, pay, k.payVariancePercent);

  return {
    corporation,
    systemName: corp.name,
    systemSize,
    targetFlags,
    type,
    targetObject,
    difficulty,
    pay,
    flags,
    timeLimit,
    daysLeft,
    numTargets,
  };
}

/** Character.cpp GenerateContracts: doplní nabídky až do maxima (1..max nových). */
export function generateContracts(ctx: Ctx, ch: Character): void {
  const k = ctx.cfg.contracts;
  const max = k.countBase + idiv(ch.repLevel, k.countRepDivisor);
  let count = 1 + ctx.rng.random(max);
  if (count + ch.contracts.length > max) count = max - ch.contracts.length;
  while (count-- > 0) ch.contracts.push(generateContract(ctx, ch));
}

/** Contract.cpp GetTypeText: "Steal Files (2NT)" */
export function contractTypeText(c: Contract): string {
  let q = c.numTargets !== 1 ? String(c.numTargets) : "";
  if (c.flags & ContractFlag.NoAlarms) q += "N";
  if (c.flags & ContractFlag.Timed) q += "T";
  return CONTRACT_TYPE_NAMES[c.type] + (q ? ` (${q})` : "");
}

export function targetObjectText(t: TargetObject): string {
  return TARGET_OBJECT_NAMES[t]!;
}

/** Contract.cpp GetDescriptiveText */
export function contractDescription(c: Contract): string {
  const obj = targetObjectText(c.targetObject);
  const sys = c.systemName;
  let text: string;
  switch (c.type) {
    case ContractType.Steal:
      text = `A client needs access to ${obj} from the ${sys} system. You must recover a copy of this data.`;
      break;
    case ContractType.StealErase:
      text = `A client desires sole access to ${obj} from the ${sys} system. You must recover a copy of this data and erase it from the system.`;
      break;
    case ContractType.Erase:
      text = `A client wishes to destroy ${obj} located on the ${sys} system. You must locate this data and erase it from the system.`;
      break;
    case ContractType.Edit:
      text = `A client wishes to alter ${obj} located on the ${sys} system. You must locate this data in the system and edit it to the client's specifications.`;
      break;
    case ContractType.DeactivateIO:
      text = `A client wishes to deactivate ${obj} from the ${sys} system. You must locate the I/O node controlling this and deactivate it.`;
      break;
    case ContractType.ActivateIO:
      text = `A client wishes to activate ${obj} from the ${sys} system. You must locate the I/O node controlling this and activate it.`;
      break;
    case ContractType.SabotageIO:
      text = `A client wishes to sabotage ${obj} at the ${sys} system. You must locate the I/O node controlling this and sabotage it.`;
      break;
    case ContractType.CrashSystem:
      text = `A client wishes to crash the ${sys} system. You must locate the CPU for the system and initiate a system failure.`;
      break;
    case ContractType.Backdoor:
      text = `A client wishes for a backdoor to be created into the ${sys} system. You must locate the CPU for the system and create this back door. The client's decker will take care of the rest.`;
      break;
    case ContractType.RunProgram:
      text = `A client needs a special program activated on the ${sys} system. Locate the target node(s) by running the program, then activate the program within the node. You must remain in the node until the program finishes running.`;
      break;
  }
  if (c.numTargets > 1) text += `(${c.numTargets} targets)`;
  if (c.flags & ContractFlag.NoAlarms) text += " The target system must not become aware of any tampering.";
  if (c.flags & ContractFlag.Timed) text += ` The mission must be completed within ${c.timeLimit} minutes of system entry`;
  return text;
}

/** Obtížnost v procentech, jak ji ukazuje originál (obtížnost × 5 %). */
export function difficultyPercent(c: Contract): number {
  return c.difficulty * 5;
}

/** Contract.cpp HintAvailable: u misí na soubory a I/O nody mohou být v systému nápovědy. */
export function hintAvailable(c: Contract): boolean {
  return c.type <= ContractType.SabotageIO;
}

/** Contract.cpp GetFileTypePerCorp: náhodný typ cenného souboru odpovídající korporaci. */
export function fileTypeForCorp(ctx: Ctx, c: Contract): TargetObject {
  const max = TARGET_RANGE.datastore[1];
  for (;;) {
    const t = ctx.rng.random(1 + max) as TargetObject;
    if (c.targetFlags & (1 << t)) return t;
  }
}

/** ContractListDialog OnVcView: přijetí nabídky. U Run Program dostane hráč klientský program. */
export function acceptContract(ctx: Ctx, ch: Character, index: number): Contract {
  if (ch.currentContract) throw new Error("Už máš přijatý kontrakt");
  const c = ch.contracts[index];
  if (!c) throw new Error("Neplatný kontrakt");
  ch.contracts.splice(index, 1);
  ch.currentContract = c;
  if (c.type === ContractType.RunProgram) {
    const rating = idiv(c.corporation + 4, ctx.cfg.contracts.clientProgramRatingDivisor);
    ch.software.push(createProgram(ch, ProgramClass.Client, rating));
  }
  return c;
}
