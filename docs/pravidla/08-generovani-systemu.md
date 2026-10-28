# 8. Generování systému

Kód: `src/core/matrix/generate.ts`, `src/core/matrix/node.ts`. Originál: `System.cpp Generate`,
`Area.cpp GenerateArea`, `Node.cpp CreateClusters / CreateFileList`, `DSFile.cpp Generate`.

Systém se generuje při vstupu do Matrixu podle přijatého kontraktu. **Rating systému** = velikost
z kontraktu (1..20); určuje obtížnost ICE, hodnotu souborů i velikost sítě.

## Oblasti

- Počet oblastí = ⌈velikost / 4⌉ (1..5).
- Velikost první oblasti = `((velikost − 1) mod 4) + počet oblastí`, každá další o 1 větší.
- Oblast 0 obsahuje **CPU**, ostatní **SPU**. Mezi oblastmi se chodí přes portály
  (Portal Out jedné oblasti → Portal In další). Vstup do systému je Portal Out poslední oblasti.
- Žlutý alarm od začátku, pokud má korporace zvýšenou pohotovost po předchozím útoku.

## Nody v oblasti

Všechny se připojují k CPU/SPU stromem přes junctiony:

| node | počet |
|---|---|
| bezpečnostní koprocesor (COP, security) | 1 |
| datastore (DS) | `system.dsBase + random2(system.dsDice, velikost oblasti + 1)` |
| I/O | `system.ioBase + random2(system.ioDice, velikost oblasti + 1)` |
| ICE port (I/O, odtud se obnovuje ICE) | 1 |
| externí alarm (I/O) | 1, jen v oblasti 0 |
| vysokorychlostní I/O (matrix port) | šance rating / `system.highSpeedIoDie` (30) |
| portály | Portal In (mimo oblast 0) a Portal Out |
| koprocesor u DS/I/O | ke každému `system.copEvery`-tému (4.) základnímu nodu |

Nový node jde náhodným směrem od rodiče. Když je místo obsazené, pokračuje se přes existující
junction, nebo se na místě souseda vytvoří nový junction. DS a COP se pak s šancí ½
(`system.auxConnectionChanceDie`) propojí i s dalšími sousedy (ne s portály) – vznikají smyčky.

Oprava remasteru: ve vzácných případech (asi 0,4 % systémů) originál nový node nedokázal připojit
(„Error - Could not add node“) a nechal ho nedosažitelný. Remaster ho připojí přes jiný junction oblasti.

## Clustery a gateway

Větve od CPU/SPU se dělí na **clustery**: junction, za kterým je koprocesor a aspoň 4 nody, začne nový
cluster; každý portál je cluster sám o sobě. Na každém spojení mezi různými clustery stojí **Gateway ICE**.
Název nodu = typ-oblast-cluster-číslo, např. `DS-12015`.

## Soubory v datastoru

Počet = `files.countBase + random2(files.countDice, files.countDie)` = 5..20.

| hod random(100) | soubor |
|---|---|
| < 10 (`files.valuablePercent`) | cenný |
| 99 (a mise na soubory / I/O) | nápověda (Clue) |
| 98 | passcode |
| 97 | 70 % program, 20 % zdroják programu, 10 % zdroják čipu |
| jinak | bezcenný; z toho 25 % vypadá jako cenný typ, ale nemá cenu |

- **Cena** cenného souboru = `5 + 5k9 + 10 × rating` (průměr 25 + 10 × rating), ±15 %.
- **Rating programu/zdrojáku** = rating systému −2 (15 %), −1 (30 %), 0 (40 %), +1 (10 %), +2 (5 %), nejméně 1.
- **Velikost** = `2 × rating + (2 × rating)k4` MP; program = jeho velikost, zdroják 2× víc.

**Historie (FSO 12-17-01):** dřív šance na cenný soubor klesala s počtem oblastí (12 % − 2 % za oblast).
Autor ji zvedl na pevných 10 %, protože ve velkých systémech nebyly v mnoha DS žádné cenné soubory.

## Cíle kontraktu

- **Mise na soubory**: do náhodného DS náhodné oblasti se na náhodné místo vloží cílový soubor (za každý cíl).
- **Mise na I/O**: náhodný obyčejný I/O node náhodné oblasti se označí jako cíl. Když žádný volný není,
  přidá se nový I/O node. Remaster po přidání znovu přepočítá souřadnice oblasti (originál ne – node mohl ležet mimo mapu).
- **Crash / Backdoor**: cílem je CPU.
- **Run Program**: I/O nebo DS jako výše; u cíle CPU se nic neoznačuje.

Každý cíl se losuje zvlášť, takže dva cíle mohou padnout na stejný node.
