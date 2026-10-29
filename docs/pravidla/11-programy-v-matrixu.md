# 11. Programy a akce v Matrixu

Kód: `src/core/matrix/run.ts` (runProgram, programVsIce, akce v nodu). Originál: `MatrixView.cpp DoRunProgram, DoRunProgramVsIce, On*`.

Zkratky: `S` = rating systému, `ICE(boj/senzory/normal)` = efektivní rating ICE (kapitola 9),
`útok/defense/stealth/analýza` = efektivní rating postavy (kapitola 2), `P` = nahraný rating programu.
Hod je k20 proti cílovému číslu (kapitola 1).

## Útočné programy

`TN = 10 + 2S + ICE(boj) − (útok + P)` (`matrix.attackBase`, `matrix.sysMult`), poškození = úspěch² (kapitola 1).
Útok na ICE vždy rozzlobí všechna ICE v nodu; napadený tapeworm zničí svůj soubor.

| program | cíl | proti hardened | proti phasing | proti ostatním |
|---|---|---|---|---|
| Attack | jedno ICE | +3 | +3 | – |
| Area Attack | všechna ICE v nodu | +6, ½ poškození | – | +2 |
| Piercing Attack | jedno ICE | – | +6, ½ poškození | −3, ½ poškození |

(Hardened/phasing jsou jen útočná ICE. Poloviční poškození se zaokrouhluje nahoru.)

## Oslabující programy

Stejné cílové číslo jako útok. Účinek trvá `úspěch × 4` tahů (`matrix.effectTurnsPerSuccess`), delší účinek přepíše kratší.

| program | účinek | nepřátelství |
|---|---|---|
| Slow (všechna ICE v nodu) | ICE jedná jen každý druhý tah | vždy |
| Virus | −1 zdraví za tah | jen když si ICE všimne: hod `10 + 2S + ICE(senzory) − (stealth + P)`; první hod počítá s plným ratingem programu (originál) |
| Confuse | náhodné akce (kapitola 10) | jen při neúspěchu nebo když je v nodu víc ICE |
| Weaken | −4 ke všem ratingům ICE | vždy |

## Klamání a ochrana

| program | cílové číslo | účinek |
|---|---|---|
| Deceive | `10 + 2S + ICE(senzory) − (stealth + P)`, −4 po přečtení passcode souboru | obejde ICE (a slabší v nodu); proti nepřátelskému ICE nefunguje; neúspěch = žlutý alarm |
| Hide (stále aktivní) | `10 + 2S + ICE(senzory) − (stealth + P)`, +4 s návnadami | zkouší se automaticky při průchodu gateway, přístupu k nodu a všimnutí |
| Relocate | `10 + 2S + ICE(boj) − (stealth + P)` proti trasujícímu ICE | zruší probíhající trace |
| Decoy | `8 + 3S − (stealth + P)` | návnady = úspěch (max 5) |
| Silence, Smoke (node) | `10 + 3S − (stealth + P)`, selže jen kritickým selháním | `2 + 2 × úspěch` tahů; Silence brání alarmům z nodu, Smoke: útok −4, defense a stealth +4, analýza −4, ICE nevidí do sousedních nodů |
| Shield, Armor, Reflect, Boost | – | aktivace (jeden program od každého druhu); Armor přidává rating k defense proti útokům ICE, Shield pohlcuje poškození, Boost +3 k ratingu a ztrácí 1 rating za tah |

## Analýza a soubory

| program | cílové číslo | účinek |
|---|---|---|
| Analyze | `8 + 2S + ICE(normal) − (analýza + P)` | úroveň analýzy = úspěch (20 % za stupeň, opakováním jde zlepšit); analyzované ICE má −úroveň ke všem ratingům a ukáže typ i rating |
| Decrypt (jen tapeworm) | `10 + 2S + ICE(normal) − (analýza + P)`, −2 po passcode | zničí tapeworm; při neúspěchu hod na všimnutí `8 + …` – všimnutí = tapeworm zničí soubor |
| Scan | – | v DS skenuje soubory `5 × P` MP za tah (obsah souboru, cíl mise); v I/O řekne, co node ovládá |
| Evaluate | – | u naskenovaných souborů zjistí hodnotu; nápověda označí cílové nody, passcode dá bonus k Deceive a Decrypt |
| Medic | `8 + 3S − (P + defense)` | opraví deck o `4 × úspěch`; program ztratí 1 rating, kritické selhání ho zhroutí |
| Client | – | v cílovém nodu běží `6 + rating/2` tahů (hráč musí zůstat); mimo cíl ukáže, kde cíle jsou |

Soubor hlídaný tapewormem nejde stáhnout, upravit ani smazat (nejdřív Decrypt nebo zničit).
Stažení trvá `⌈velikost / 2^Bus⌉` tahů (s aktivovaným vysokorychlostním I/O 1 tah), úprava 2× rychleji, mazání okamžitě.
Upravený a pak stažený soubor je bezcenný (i jako cíl mise).

## Akce v nodu

Všechny nejdřív projdou přístupem k nodu (kapitola 10).

| akce | node | cílové číslo | účinek |
|---|---|---|---|
| Use I/O | I/O | – | cíl mise / externí alarm vypnut / ICE port zavřen / vysokorychlostní I/O; jinak 1/3 šance na červený alarm (`useIoAlarmChanceDie`) |
| Crash System | CPU (bez Guardiana) | `10 + 2S − útok` | shodí systém (konec runu); neúspěch = červený alarm |
| Backdoor | CPU | `12 + 2S − analýza` | zadní vrátka na tolik měsíců, kolik je úspěch; kritické selhání = alarm |
| Get Map | CPU, SPU | – | zmapuje oblast včetně zvláštních nodů |
| Kill Alarm | security COP | `10 + 2S − útok` | červený → žlutý (ICE jdou domů), žlutý → zelený |
| Kill Trace | security COP | `10 + 2S − útok` | zruší stav „vystopován“ |
| Kill Shutdown | CPU, SPU | `8 + 2S − útok` | zastaví vypínání systému |
| Enter Portal | portál | – | přechod do sousední oblasti |

Neúspěch u Backdoor, Kill Alarm/Trace/Shutdown vyvolá alarm jen při kritickém selhání.
