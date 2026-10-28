# 6. Kontrakty a odměny

Kód: `src/core/contract.ts`. Originál: `Contract.cpp Generate`, `Character.cpp GenerateContracts`, `ContractListDialog.cpp`.
Vyhodnocení mise a odměny (reputace, body dovedností) doplní fáze 5.

## Počet nabídek

Maximum = `contracts.countBase + reputace / contracts.countRepDivisor` (3 + rep/5).
Každý týden se přidá 1..max nových, ale celkem nejvýš maximum. Staré nabídky vyprší samy.

## Obtížnost a cílový systém

1. **Základní obtížnost** = reputace, nejvýš `(lifestyle + 1) × contracts.difficultyCapPerLifestyle`, nejméně 1.
2. **Posun** podle hodu random(10) (`contracts.difficultySpread`): 10 % −2, 20 % −1, 40 % 0, 20 % +1, 10 % +2,
   v rozsahu 1..`contracts.maxDifficulty` (20).
3. **Velikost systému** = takto posunutá obtížnost. Korporace se vybere náhodně z pěti korporací dané velikosti
   (databáze 100 korporací seřazených podle velikosti).
4. **Typ mise** podle vah `contracts.typeWeights`:

| typ | váha | cíl |
|---|---|---|
| Steal Files | 15 | soubor v datastoru |
| Steal & Erase | 10 | soubor |
| Erase Files | 10 | soubor |
| Alter Files (Edit) | 10 | soubor |
| Deactivate I/O | 15 | zámky, kamery, alarmy |
| Activate I/O | 15 | požární, bezpečnostní, radiační, biohazard, chemické alarmy |
| Sabotage | 10 | cokoli z I/O (od zámků po trezor) |
| Crash System | 5 | CPU |
| Create Backdoor | 5 | CPU |
| Run Program | 5 | I/O, datastore nebo CPU |

5. **Cíl** musí odpovídat typu korporace (banka nemá výrobu, laboratoř má chemické alarmy…).
   Povolené cíle určují i typy cenných souborů v systému.

## Ztěžující podmínky

| podmínka | šance | obtížnost | parametry |
|---|---|---|---|
| bez alarmu (N) | 20 %, Edit 40 %, Backdoor 50 %, Crash 0 % | +1 | `contracts.noAlarmChance`, `noAlarmDifficulty` |
| časový limit (T) | 10 %, jen od základní obtížnosti 5 | +2 | `contracts.timed*` |
| víc cílů (2..5) | základní obtížnost / 40 (2,5 % … 50 %), ne u CPU | + počet / 2 | `contracts.multiTarget*` |

Časový limit = 3 minuty × počet oblastí systému. Časově omezená mise se musí splnit do 1 dne.

## Termín a odměna

- Dny na splnění: 1..5 (`contracts.daysDie`), časová mise 1 den.
- Odměna = `contracts.payPerDifficulty × (obtížnost + lifestyle)` (100 × …),
  upravená o `(3 − dny) × 10 %` (rychlé mise víc) a o náhodných ±15 %.
- Nabídka zdražuje o 10 % za každý den čekání (kapitola Čas).
- Obtížnost se ve hře ukazuje jako procenta (obtížnost × 5 %).

## Přijetí a zrušení

- Přijmout jde jen jeden kontrakt. Run Program přidá klientský program (kapitola Programy).
- Systém se vygeneruje až při vstupu do Matrixu.
- **Novinka remasteru** (To-Do originálu „Cancel a contract“): přijatý kontrakt jde zrušit doma.
  Reputace klesne o obtížnost × `contracts.cancelRepPenaltyFactor` – stejně jako při propadnutí termínu.
