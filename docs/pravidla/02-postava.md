# 2. Postava a deck

Kód: `src/core/character.ts`, `src/core/deck.ts`. Originál: `Character.cpp`, `CharDataDialog.cpp`, `DeckDataDialog.cpp`, `IntroDlg.cpp`.

## Nová postava

Začíná s `character.startCredits` (100) kredity, lifestylem Street, reputací 0, všemi šesti
dovednostmi na `character.startSkill` (1) a všemi čipy na `character.startChip` (1). Hardware nemá.
Rok je `character.startYear` (2132).

**Startovní programy** (`character.startPrograms`), všechny rating 1 a nahrané:
Attack, Silence, Smoke, Medic, Armor, Hide, Deceive, Analyze, Scan, Evaluate, Decrypt.
Výchozí útok, brnění a hide jsou nastavené na startovní Attack, Armor a Hide.

**Startovní bonus** (jeden z):

| Bonus | Účinek | Parametr |
|---|---|---|
| None („Tough Guy“) | nic | – |
| Skills | všechny dovednosti 2 | `character.bonusSkill` |
| Hardware | všechny čipy 2 | `character.bonusChip` |
| Software | startovní programy rating 2 | `character.bonusSoftwareRating` |
| Money | 2000 kr | `character.bonusCredits` |

## Dovednosti

Attack, Defense, Stealth, Analysis (boj v Matrixu), Programming, Chip Design (projekty).
Zvýšení dovednosti o 1 stojí tolik bodů dovedností, kolik je **současná** úroveň
(× `skills.costPerLevel`). Z úrovně 1 na 5 tedy 1 + 2 + 3 + 4 = 10 bodů. Body se získávají za mise (fáze 5).

**Efektivní úroveň** (`GetEffectiveLevel`, používá se v Matrixu): všechny body vložené do dovedností
(n(n−1)/2 za každou) + nevyužité body, vydělit 6, a převést zpět na úroveň „jako by se dělilo rovnoměrně“.

## Deck: čipy a zatížení

Šest čipů: CPU, Attack/Defense/Stealth/Analysis Firmware, Coprocessor.

**Hranice zatížení** (`GetLoadRatings`), kde `S = CPU + min(Coprocessor, CPU)`:

| | vzorec | výchozí S = 2 |
|---|---|---|
| lehké pod | `deckLoad.lightFactor × S` | < 20 MP |
| těžké nad | `deckLoad.heavyFactor × S` | > 40 MP |
| maximum | `deckLoad.maxFactor × S` | 60 MP |

Lehké zatížení dává `+deckLoad.lightBonus` (+1) ke všem ratingům, těžké `−deckLoad.heavyPenalty` (−2).
Programy nad maximum nejdou nahrát. Startovní deck má 23 MP = normální zatížení.

Velikost programu = složitost × rating (viz kapitola Programy).

## Efektivní ratingy

`GetEffectiveRating` – rating postavy pro hody v Matrixu:

`rating = min(firmware, CPU) + dovednost`

a k tomu:

| okolnost | Attack | Defense | Stealth | Analysis | parametr |
|---|---|---|---|---|---|
| Smoke v nodu | −4 | +4 | +4 | −4 | `ratings.smoke*` |
| aktivní odpovídající Boost | +3 | +3 | +3 | +3 | `ratings.boostBonus` |
| po dokončeném trace | | | −4 | | `ratings.tracedStealth` |
| lehký / těžký deck | +1 / −2 | +1 / −2 | +1 / −2 | +1 / −2 | `deckLoad.*` |
| běží klientský program | −3 | −3 | −3 | −3 | `ratings.clientProgramPenalty` |
| poškozený deck | postih/2 | postih/2 | postih/2 | postih/2 | `ratings.deckConditionDivisor` |
| zranění (horší z fyzického a mentálního) | postih | postih | postih | postih | viz kapitola 1 |

Firmware je omezené výkonem CPU – drahý Attack Firmware bez lepšího CPU nepomůže.

## Správa programů (DeckDataDialog)

- **Load/Unload** – zda se program nahraje při vstupu do Matrixu. Nesmí se překročit maximum.
- **Default** – výchozí program pro slot útok (Attack/Area/Piercing), Shield, Armor, Hide, Reflect.
  Nastavení výchozího program i nahraje. Odnahrání výchozí volbu zruší.
- Pořadí, přejmenování, zvuk, smazání. Vše jen mimo Matrix.
