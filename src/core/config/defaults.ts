// Výchozí parametry pravidel = hodnoty z Decker 1.12.
//
// Každý parametr je popsaný v kuchařce docs/pravidla/ pod stejným názvem (např. dice.sides).
// U každé sekce je odkaz na místo v originálu, odkud hodnoty pocházejí.
//
// Konvence:
//  - "…Die" = počet stěn hodu random(N), tj. výsledek 0..N-1
//  - "…Chance" s "…ChanceDie" = úspěch, když random(die) < chance
//  - "…Percent" = procenta

import { ProgramClass } from "../constants";

export const DEFAULT_CONFIG = {
  baseline: "1.12" as const,

  /** Hod kostkou a stupeň úspěchu. Global.cpp DoDieRoll */
  dice: {
    /** Počet stěn kostky (k20). */
    sides: 20,
    /** Hodnota hodu, která je vždy kritické selhání. */
    criticalFailure: 1,
    /** Cílové číslo se ořízne shora na tuto hodnotu (20 = nejvyšší hod vždy uspěje). */
    maxTarget: 20,
    /** Stupeň úspěchu = (hod − cíl + successOffset) / successStep, nejvýš maxSuccess. */
    successOffset: 4,
    successStep: 4,
    maxSuccess: 5,
  },

  /** Global.cpp ComputeDamage */
  combat: {
    /** Poškození = stupeň úspěchu ^ damageExponent (originál: 2). */
    damageExponent: 2,
  },

  /** Global.h MAX_HEALTH, Global.cpp GetConditionModifier */
  health: {
    /** Maximální zdraví (fyzické, mentální, deck, ICE). */
    max: 20,
    /** Postih za zranění = (zdraví − max) / conditionStep (zaokrouhleno k nule). */
    conditionStep: 4,
  },

  /** Global.h REP_LEVEL_FACTOR, Global.cpp CalcRepPoints* */
  reputation: {
    /** Body na další úroveň = levelFactor × (L+1) × (L+2) / 2. */
    levelFactor: 5,
    /** Strop reputace = (lifestyle + 1) × capPerLifestyle (MatrixView.cpp, CharDataDialog.cpp). */
    capPerLifestyle: 4,
  },

  /** Global.cpp g_nLifestyleMonthlyCost, Global.h LIFESTYLE_UPGRADE_FACTOR */
  lifestyle: {
    /** Měsíční nájem podle lifestylu (Street..Elite). */
    monthlyCost: [500, 1000, 2000, 4000, 10000],
    /** Upgrade lifestylu stojí upgradeFactor × měsíční nájem nového lifestylu. */
    upgradeFactor: 3,
  },

  /** Character.cpp CCharacter(), CreateNew */
  character: {
    startCredits: 100,
    startSkill: 1,
    startChip: 1,
    startYear: 2132,
    /** Bonus "Skills": všechny dovednosti na tuto hodnotu. */
    bonusSkill: 2,
    /** Bonus "Hardware": všechny čipy na tuto hodnotu. */
    bonusChip: 2,
    /** Bonus "Money": počáteční kredity. */
    bonusCredits: 2000,
    /** Bonus "Software": rating startovních programů (jinak 1). */
    bonusSoftwareRating: 2,
    /** Startovní programy (g_bInitialProgramFlag). */
    startPrograms: [
      ProgramClass.Attack, ProgramClass.Silence, ProgramClass.Smoke, ProgramClass.Medic, ProgramClass.Armor,
      ProgramClass.Hide, ProgramClass.Deceive, ProgramClass.Analyze, ProgramClass.Scan, ProgramClass.Evaluate,
      ProgramClass.Decrypt,
    ] as ProgramClass[],
  },

  /** Character.cpp GetLoadRatings, GetEffectiveRating (zatížení decku) */
  deckLoad: {
    /** Hranice = faktor × (CPU + min(koprocesor, CPU)). */
    lightFactor: 10,
    heavyFactor: 20,
    maxFactor: 30,
    /** Úprava všech ratingů při lehkém / těžkém zatížení. */
    lightBonus: 1,
    heavyPenalty: 2,
  },

  /** Character.cpp GetEffectiveRating – úpravy efektivních ratingů v Matrixu */
  ratings: {
    smokeAttack: -4,
    smokeDefense: 4,
    smokeStealth: 4,
    smokeAnalysis: -4,
    /** Postih stealth po dokončeném trace. */
    tracedStealth: -4,
    /** Bonus aktivního boost programu k odpovídajícímu ratingu. */
    boostBonus: 3,
    /** Postih všech ratingů, když běží klientský program. */
    clientProgramPenalty: 3,
    /** Postih za poškození decku se dělí tímto číslem (poloviční vliv). */
    deckConditionDivisor: 2,
  },

  /** CharDataDialog.cpp – zvýšení dovednosti stojí tolik bodů, kolik je současná úroveň. */
  skills: {
    /** Cena zvýšení = úroveň × costPerLevel. */
    costPerLevel: 1,
  },

  /** RestDlg.cpp – léčení fyzického zdraví */
  rest: {
    /** Léčení 1 bodu doma trvá tolik dní, kolik je chybějících bodů × homeDaysPerDamage. */
    homeDaysPerDamage: 1,
    /** Úplné vyléčení doma: dny = d × (d + fullHealOffset) / fullHealDivisor, d = chybějící body. */
    fullHealOffset: 2,
    fullHealDivisor: 3,
    /** Nemocnice: čas / hospitalTimeDivisor (zaokrouhleno nahoru), cena = hospitalCostPerDay × domácí dny. */
    hospitalTimeDivisor: 2,
    hospitalCostPerDay: 100,
  },

  /** Character.cpp PassTime */
  time: {
    daysPerWeek: 7,
    /** Nabízené kontrakty: odměna += odměna × dny / payIncreaseDivisor (10 = +10 % za den). */
    contractPayIncreaseDivisor: 10,
    /** Po vypršení nabídky se nová vytvoří s pravděpodobností 1 / replaceChanceDie. */
    expiredContractReplaceChanceDie: 2,
  },

  /** Program.cpp g_nProgramComplexity, GetSoftwarePrice, GetProgramSize */
  programs: {
    /** Složitost podle třídy programu (index = ProgramClass). */
    complexity: [2, 3, 3, 2, 3, 3, 4, 2, 3, 1, 4, 4, 3, 3, 2, 2, 1, 1, 1, 2, 4, 3, 3, 3, 3, 4],
    /** Cena = složitost × rating² × priceFactor. */
    priceFactor: 25,
  },

  /** ShopItem.cpp g_nChipBaseCost, Character.cpp GetChipComplexity */
  chips: {
    /** Cena = rating² × baseCost (index = ChipType). */
    baseCost: [150, 100, 100, 100, 100, 125],
    /** Složitost pro vývoj (CPU a koprocesor 5, firmware 4). */
    complexity: [5, 4, 4, 4, 4, 5],
  },

  /** ShopItem.cpp g_nMaxHWLevel, g_nHWBaseCost */
  hardware: {
    /** Nejvyšší úroveň hardwaru (index = HardwareType). */
    maxLevel: [4, 5, 5, 3, 2, 5, 1, 3, 1],
    /** Cena = baseCost × 2^(úroveň−1). */
    baseCost: [1000, 500, 1000, 250, 500, 500, 2000, 2000, 1500],
  },

  /** Shop.cpp – výkup starého hardwaru při koupi lepšího */
  shopTrade: {
    /** Za starý hardware dostaneš cenu / hardwareResaleDivisor. */
    hardwareResaleDivisor: 2,
  },

  /** OrderDlg.cpp – objednávka na zakázku */
  order: {
    /** Objednávka stojí priceMultiplier × běžná cena. */
    priceMultiplier: 2,
    /** Max. rating programů a čipů = maxRatingBase + maxRatingPerLifestyle × lifestyle. */
    maxRatingBase: 6,
    maxRatingPerLifestyle: 2,
    /** Doba dodání podle ceny: cena < priceThresholds[i] → deliveryDays[i], jinak poslední hodnota. */
    priceThresholds: [500, 1000, 5000, 10000, 50000],
    deliveryDays: [2, 3, 4, 5, 6, 7],
    /** Software se dodává o tolik dní dříve. */
    softwareDaysFaster: 1,
  },

  /** NewProjectDlg.cpp, ProjectDataDlg.cpp – vývoj programů a čipů */
  projects: {
    /** Pracovní body nového ratingu = složitost × rating²; při upgradu se odečte už hotový zdroják. */
    /** Při downgradu: složitost × (rating zdroje − cílový rating), nejméně minWork. */
    minWork: 1,
    /** Rychlost = dovednost × (1 + Design Assistant) bodů za den. */
    /** Dokončení: hod proti cíli successBase + rating − (dovednost + Design Assistant). */
    successBase: 10,
    /** Při neúspěchu se pokračuje dalším kolem s prací = původní práce / failureWorkDivisor (nahoru). */
    failureWorkDivisor: 4,
    /** Vypalování čipu: práce = složitost čipu × rating, rychlost = úroveň Chip Burneru za den. */
  },

  /** Character.cpp GenerateShopItems, ShopItem.cpp Generate */
  shop: {
    /** Počet programů = softwareBase + softwareDice × random(softwareDie). */
    softwareBase: 3,
    softwareDice: 3,
    softwareDie: 4,
    /** Počet hardwaru = hardwareBase + random(hardwareDie). */
    hardwareBase: 1,
    hardwareDie: 4,
    /** Počet čipů = chipBase + chipDice × random(chipDie). */
    chipBase: 2,
    chipDice: 2,
    chipDie: 4,
    /** Rating programu = perLifestyle × lifestyle + 1 + random(ratingDie). */
    softwareRatingPerLifestyle: 2,
    softwareRatingDie: 6,
    /** Rating čipu = perLifestyle × lifestyle + chipRatingMin + random(ratingDie). */
    chipRatingPerLifestyle: 2,
    chipRatingMin: 2,
    chipRatingDie: 6,
    /** Úroveň hardwaru = 1 + random(lifestyle + 1), nejvýš hardware.maxLevel. */
    hardwareRatingBase: 1,
    /** Náhodná úprava ceny ± tolik procent. */
    priceVariancePercent: 15,
  },

  /** Character.cpp GenerateContracts, Contract.cpp Generate */
  contracts: {
    /** Max. počet nabídek = countBase + reputace / countRepDivisor; nově 1..max. */
    countBase: 3,
    countRepDivisor: 5,
    /** Základní obtížnost = reputace, nejvýš (lifestyle+1) × difficultyCapPerLifestyle, nejméně 1. */
    difficultyCapPerLifestyle: 4,
    maxDifficulty: 20,
    /** Posun obtížnosti podle hodu random(10) (index = hod). Originál: 10 % −2, 20 % −1, 40 % 0, 20 % +1, 10 % +2. */
    difficultySpread: [-2, -1, -1, 2, 1, 1, 0, 0, 0, 0],
    /** Váhy typů misí (index = ContractType), součet 100. */
    typeWeights: [15, 10, 10, 10, 15, 15, 10, 5, 5, 5],
    /** Šance na "bez alarmu" z 10 podle typu mise (index = ContractType). */
    noAlarmChance: [2, 2, 2, 4, 2, 2, 2, 0, 5, 2],
    noAlarmChanceDie: 10,
    noAlarmDifficulty: 1,
    /** Časově omezená mise: jen od základní obtížnosti timedMinBaseDifficulty, šance 1 / timedChanceDie. */
    timedMinBaseDifficulty: 5,
    timedChanceDie: 10,
    /** Limit = timedMinutesPerArea × počet oblastí systému. */
    timedMinutesPerArea: 3,
    timedDifficulty: 2,
    /** Víc cílů: šance základní obtížnost / multiTargetChanceDie; počet multiTargetMin + random(multiTargetExtraDie). */
    multiTargetChanceDie: 40,
    multiTargetMin: 2,
    multiTargetExtraDie: 4,
    /** Obtížnost += počet cílů / multiTargetDifficultyDivisor. */
    multiTargetDifficultyDivisor: 2,
    /** Dny na splnění = 1 + random(daysDie); časově omezené mise mají 1 den. */
    daysDie: 5,
    /** Odměna = payPerDifficulty × (obtížnost + lifestyle). */
    payPerDifficulty: 100,
    /** Úprava odměny podle dnů: × (1 + (payDaysPivot − dny) / payDaysDivisor). */
    payDaysPivot: 3,
    payDaysDivisor: 10,
    payVariancePercent: 15,
    /** Rating klientského programu (mise Run Program) = (číslo korporace + 4) / clientProgramRatingDivisor. */
    clientProgramRatingDivisor: 5,
    /**
     * Nová funkce remasteru (To-Do originálu): zrušení přijatého kontraktu.
     * Ztráta reputace = obtížnost × cancelRepPenaltyFactor (stejně jako při propadnutí termínu).
     */
    cancelRepPenaltyFactor: 1,
  },

  /** System.cpp Generate, Area.cpp GenerateArea */
  system: {
    /** Počet datastorů v oblasti = dsBase + random2(dsDice, velikost oblasti + 1). Totéž pro I/O. */
    dsBase: 1,
    dsDice: 2,
    ioBase: 1,
    ioDice: 2,
    /** Za každý copEvery-tý základní node se k němu připojí koprocesor. */
    copEvery: 4,
    /** Šance na vysokorychlostní I/O node v oblasti = rating / highSpeedIoDie. */
    highSpeedIoDie: 30,
    /** Šance na pomocné propojení DS/COP se sousedem = 1 / auxConnectionChanceDie. */
    auxConnectionChanceDie: 2,
  },

  /** Node.cpp GenerateICE */
  iceGeneration: {
    /** ICE v CPU/SPU (u gateway i sousedící s CPU/SPU) a v security koprocesoru má rating +1. */
    importantNodeBonus: 1,
    /** Náhodné zvýšení ratingu: random(bumpDie) < bumpPlus1Chance → +1 (od obtížnosti 2), < +bumpPlus2Chance → +2 (od obtížnosti 4). */
    bumpDie: 20,
    bumpPlus1Chance: 1,
    bumpPlus1MinDifficulty: 2,
    bumpPlus2Chance: 2,
    bumpPlus2MinDifficulty: 4,
    /** Počet ICE: hod random(countDie) + bonus podle typu nodu, převod přes countTable. */
    countDie: 4,
    countBonusSpuPortal: 1,
    countBonusCpuCop: 2,
    /** Převod hodu na počet ICE (index = hod 0..5). */
    countTable: [0, 1, 2, 2, 3, 3],
    /**
     * Chyba v 1.12: podmínka `(nRoll == 2) || (nRoll = 3)` dává pro hod ≥ 2 vždy 2 ICE,
     * třetí ICE tedy nikdy nevznikne. false = chování originálu, true = použije countTable.
     */
    fixThirdIceBug: false,
    /** Nejvýš tolik ICE ve vstupním portálu systému. */
    systemPortalMaxIce: 1,
    /** Druhé ICE je trace s šancí 1 / traceChanceDie, jen od obtížnosti traceMinDifficulty. */
    traceChanceDie: 4,
    traceMinDifficulty: 3,
    /** Killer: random(100)+1 < (obtížnost − killerBaseLevel) × killerPercentPerLevel. */
    killerBaseLevel: 10,
    killerPercentPerLevel: 5,
    /** Volby útočného ICE: random(100)+1 < (obtížnost − optionBaseLevel) × optionPercentPerLevel. */
    optionBaseLevel: 5,
    optionPercentPerLevel: 3,
    /** Váhy voleb: hardened, phasing, crash. */
    optionWeights: [2, 2, 1],
    /** Trace normal: 5 × (25 − obtížnost) %, fry: 2 × (obtížnost − 10) %, zbytek dump. */
    traceNormalBase: 25,
    traceNormalPercentPerLevel: 5,
    traceFryBaseLevel: 10,
    traceFryPercentPerLevel: 2,
    /**
     * Šance na tapeworm ze 20 podle typu souboru (index = FileType).
     * −1 = v originálu nedefinováno (proměnná si drží hodnotu z předchozího souboru).
     */
    tapewormChance: [1, 4, 20, 15, 6, -1, -1, -1],
    tapewormChanceDie: 20,
    /** Data bomb: random(100)+1 < (obtížnost − dataBombBaseLevel) × dataBombPercentPerLevel. */
    dataBombBaseLevel: 10,
    dataBombPercentPerLevel: 5,
  },

  /** Ice.cpp GetEffectiveRating */
  ice: {
    /** Postih bílého ICE v boji. */
    whiteCombatPenalty: 2,
    /** Bonus senzorů bílého ICE při žlutém/červeném alarmu. */
    whiteAlertSensorBonus: 2,
    /** Postih oslabeného ICE (program Weaken). */
    weakenPenalty: 4,
  },

  /** Node.cpp CreateFileList, DSFile.cpp Generate */
  files: {
    /** Počet souborů v datastoru = countBase + random2(countDice, countDie). */
    countBase: 5,
    countDice: 5,
    countDie: 4,
    /** Hod random(100): < valuablePercent cenný; hody clueRoll/passcodeRoll/programRoll speciální soubory. */
    valuablePercent: 10,
    clueRoll: 99,
    passcodeRoll: 98,
    programRoll: 97,
    /** Speciální soubor s programem: random(100) < programPercent program, < +programSourcePercent zdroják programu, jinak zdroják čipu. */
    programPercent: 70,
    programSourcePercent: 20,
    /** Bezcenný soubor je s šancí 1 / fakeValuableChanceDie "cenný typ bez ceny". */
    fakeValuableChanceDie: 4,
    /** Cena = valueBase + random2(valueDice, valueDie) + valuePerRating × rating systému, ± valueVariancePercent. */
    valueBase: 5,
    valueDice: 5,
    valueDie: 9,
    valuePerRating: 10,
    valueVariancePercent: 15,
    /** Rating programu/zdrojáku v souboru = rating systému + posun podle hodu random(100) (kumulativní hranice). */
    programRatingThresholds: [15, 45, 85, 95, 100],
    programRatingOffsets: [-2, -1, 0, 1, 2],
    /** Velikost běžného souboru = základ + random2(základ, sizeDie), kde základ = sizePerRating × rating systému. */
    sizePerRating: 2,
    sizeDie: 4,
    /** Zdroják je sourceSizeMultiplier× větší než hotový program/čip. */
    sourceSizeMultiplier: 2,
  },
};

type Widen<T> = T extends string
  ? T
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? Widen<U>[]
        : T extends object
          ? { [K in keyof T]: Widen<T[K]> }
          : T;

export type RulesConfig = Widen<typeof DEFAULT_CONFIG>;
