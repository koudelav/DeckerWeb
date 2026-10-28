# 9. ICE – generování a ratingy

Kód: `src/core/matrix/generate.ts` (generateNodeIce), `src/core/matrix/ice.ts`. Originál: `Node.cpp GenerateICE`, `Ice.cpp`.
Chování ICE v Matrixu (dotazy, útoky, trace, pohyb) doplní fáze 5.

## Typy

| bílé | | černé | |
|---|---|---|---|
| Gateway | brání průchodu do jiného clusteru | Attack | útočí (na deck nebo, Killer, na deckera) |
| Probe | hledá vetřelce | Trace | sleduje signál, varianty Dump a Fry |
| Guardian | hlídá přístup do nodu | | |
| Tapeworm | hlídá soubor, při útoku ho zničí; varianta Data Bomb útočí | | |

**Response ICE** (útočné ICE v koprocesorech a ve výstupním portálu oblasti) čeká neaktivní a probudí se při alarmu.

## Kolik ICE a jaké

V každém nodu kromě junctionů:

1. Hod `random(4)`, +1 v SPU a portálech, +2 v CPU a koprocesorech.
2. Výsledek 0 → žádné ICE, 1 → jedno, ≥ 2 → dvě.
   **Chyba 1.12:** podmínka `(nRoll == 2) || (nRoll = 3)` je vždy pravdivá, takže **3 ICE nevzniknou nikdy**.
   Zamýšlená tabulka je `iceGeneration.countTable` (0, 1, 2, 2, 3, 3) a zapne se přepínačem
   `iceGeneration.fixThirdIceBug: true`.
3. Ve vstupním portálu systému nejvýš `iceGeneration.systemPortalMaxIce` (1).

| pořadí | ICE |
|---|---|
| 1. | koprocesor: Probe; výstupní portál oblasti: response Attack; jinak Guardian (uprostřed nodu) |
| 2. | Trace s šancí ¼ (od obtížnosti 3), jinak Attack; v koprocesoru response |
| 3. | Attack (jen s opravou chyby) |

**Gateway** na každém spojení s jiným clusterem, stojí přímo u vstupu.
**Tapeworm** hlídá soubor s šancí podle typu (ze 20, `iceGeneration.tapewormChance`):
bezcenný 1 (5 %), cenný 4 (20 %), cíl mise 6 (30 %), nápověda 15 (75 %), passcode 20 (100 %).
U programů a zdrojáků originál šanci nenastavil (proměnná si drží hodnotu předchozího souboru) – zachováno.

## Rating

Základ = rating systému, pak:

- +1 (`iceGeneration.importantNodeBonus`) v CPU, SPU, security koprocesoru; gateway i na spojení s CPU/SPU,
- náhodně: 5 % +1 (od obtížnosti 2), 10 % +2 (od obtížnosti 4) (`iceGeneration.bump*`).

## Varianty černého ICE

| varianta | šance | parametry |
|---|---|---|
| Killer (útočí na deckera) | `(obtížnost − 10) × 5 %` → od 11, 50 % na 20 | `killerBaseLevel`, `killerPercentPerLevel` |
| volba Hardened / Phasing / Crash | `(obtížnost − 5) × 3 %` → od 6, 45 % na 20; váhy 2 : 2 : 1 | `option*` |
| Trace normal | `5 × (25 − obtížnost) %` → 100 % do 5, 25 % na 20 | `traceNormal*` |
| Trace & Fry | `2 × (obtížnost − 10) %` → od 11, 20 % na 20 | `traceFry*` |
| Trace & Dump | zbytek | |
| Data Bomb (tapeworm) | `(obtížnost − 10) × 5 %` | `dataBomb*` |

Hod je `random(100) + 1 < šance`, takže skutečná šance je o 1 procentní bod nižší.

## Efektivní rating ICE (GetEffectiveRating)

`rating + postih za poškození − 4 při Weaken − úroveň analýzy hráčem`, a dále:

- bílé ICE v boji −2 (`ice.whiteCombatPenalty`),
- bílé ICE při žlutém/červeném alarmu +2 k senzorům (`ice.whiteAlertSensorBonus`).

## Názvy

Každý typ má tabulku 20 názvů podle ratingu (pokročilé varianty od ratingu 6 nebo 11) a k názvu se
přidá náhodné hex číslo („Golem II 3FA0“). Obrázek je index v image listu `il_ice`.
Oprava: originál u analyzovaného Attack (Crash) četl název mimo tabulku.
