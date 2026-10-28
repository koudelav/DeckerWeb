# 1. Kostky a úspěch

Základní mechanika, na které stojí boj, programy i ICE. Kód: `src/core/dice.ts`. Originál: `Global.cpp`.

## Hod proti cílovému číslu

Většina akcí v Matrixu je hod **k20** proti **cílovému číslu** (target number, TN). Čím nižší TN, tím snazší.

1. Cíl se ořízne shora na `dice.maxTarget` (20). Hod 20 tedy vždy uspěje, i když je cíl 35.
2. Hodí se `1 + random(dice.sides)`, tj. 1..20.
3. Hod `dice.criticalFailure` (1) je **kritické selhání** (výsledek −1), i proti cíli 0 nebo zápornému.
4. Hod pod cílem je **selhání** (0).
5. Jinak **stupeň úspěchu** = `(hod − cíl + dice.successOffset) / dice.successStep`, nejvýš `dice.maxSuccess`.

S výchozími hodnotami (offset 4, krok 4, max 5):

| hod − cíl | stupeň úspěchu |
|---|---|
| 0–3 | 1 |
| 4–7 | 2 |
| 8–11 | 3 |
| 12–15 | 4 |
| 16+ | 5 |

Šance na úspěch (stupeň ≥ 1) = `(21 − cíl) / 20` pro cíl 2..20, kritické selhání vždy 5 %.

**Historie (zakomentováno v originálu, úprava „FSO“):** dřív byla nelineární tabulka
0–1 → 1, 2–4 → 2, 5–8 → 3, 9–13 → 4, 14–19 → 5. Nižší stupně byly vzácnější.

| Parametr | Výchozí | Význam |
|---|---|---|
| `dice.sides` | 20 | stěny kostky |
| `dice.criticalFailure` | 1 | hod, který je vždy kritické selhání |
| `dice.maxTarget` | 20 | horní ořez cílového čísla |
| `dice.successOffset` | 4 | posun ve vzorci stupně úspěchu |
| `dice.successStep` | 4 | šířka jednoho stupně |
| `dice.maxSuccess` | 5 | nejvyšší stupeň |

## Poškození

`Global.cpp ComputeDamage`: poškození = stupeň úspěchu ^ `combat.damageExponent`.

| úspěch | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| poškození (exponent 2) | 1 | 4 | 9 | 16 | 25 |

Zdraví je 20 (`health.max`), takže úspěch 5 zničí cíl jednou ranou, úspěch 4 téměř.
Autor v komentáři: „původně poškození = úspěch (moc málo), teď úspěch² (moc hodně)“.
Pro vyvažování je to jeden z nejsilnějších knoflíků – např. exponent 1.5 dává 1, 3, 5, 8, 11.

## Zranění a postih

`Global.cpp GetConditionModifier`: postih = `(zdraví − health.max) / health.conditionStep`,
zaokrouhleno **k nule** (jako celočíselné dělení v C).

| zdraví | 20–17 | 16–13 | 12–9 | 8–5 | 4–1 | 0 |
|---|---|---|---|---|---|---|
| postih | 0 | −1 | −2 | −3 | −4 | −5 |

Platí pro postavu (fyzické/mentální zdraví, deck poloviční vahou – viz kapitola Postava) i pro ICE.

**Historie:** dřív schodovitě ≤4 → −6, ≤7 → −4, ≤9 → −2, jinak 0.

| Parametr | Výchozí | Význam |
|---|---|---|
| `combat.damageExponent` | 2 | exponent poškození |
| `health.max` | 20 | maximální zdraví |
| `health.conditionStep` | 4 | kolik bodů zdraví = −1 k ratingům |

## Reputace

Body potřebné k dosažení úrovně L+1 (`CalcRepPointsForNextLevel`):
`reputation.levelFactor × (L+1) × (L+2) / 2`.

| úroveň | 0→1 | 1→2 | 2→3 | 3→4 | 4→5 | 9→10 | 19→20 |
|---|---|---|---|---|---|---|---|
| body celkem | 5 | 15 | 30 | 50 | 75 | 275 | 1050 |

Úrovní je 21 (Nobody … Matrix God). Po ztrátě úrovně (`CalcRepPointsAfterLoss`) se body nastaví na
`(L+1)² × levelFactor / 2`.

| Parametr | Výchozí | Význam |
|---|---|---|
| `reputation.levelFactor` | 5 | násobitel bodů reputace |

## Náhodná odchylka

Ceny v obchodě, odměny za kontrakty a hodnota souborů se upravují o ±15 %:
`x += x × (random(31) − 15) / 100`. Procenta jsou v příslušných sekcích (`…VariancePercent`).

## Generátor náhody

Originál používal `rand()` z C knihovny. Remaster má seedovatelný generátor (`src/core/rng.ts`)
se stavem, který se ukládá do savu. Stejný seed dá stejný svět, což využívají testy.
Rozdělení hodů je stejné, konkrétní posloupnost čísel ne – hry tedy nejsou hod po hodu shodné s originálem.
