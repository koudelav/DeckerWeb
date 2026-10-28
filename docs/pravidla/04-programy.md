# 4. Programy – cena, velikost, názvy

Kód: `src/core/program.ts`. Originál: `Program.cpp`. Účinky programů v Matrixu doplní fáze 5.

## Složitost

Každá třída programu má složitost (`programs.complexity`, index = třída):

| složitost | programy |
|---|---|
| 1 | Smoke, Analyze, Scan, Evaluate |
| 2 | Attack, Slow, Weaken, Deceive, Relocate, Decrypt |
| 3 | Area Attack, Piercing Attack, Virus, Silence, Shield, Armor, Hide, Attack/Defense/Stealth/Analysis Boost |
| 4 | Confuse, Decoy, Medic, Reflect, Client Program |

## Vzorce

| | vzorec | příklad Attack 5 (složitost 2) |
|---|---|---|
| cena | složitost × rating² × `programs.priceFactor` (25) | 1 250 kr |
| velikost | složitost × rating MP | 10 MP |
| čas nahrání v Matrixu | ⌈velikost / 2^(High Bandwidth Bus)⌉, nejméně 1 tah; s aktivním vysokorychlostním I/O 1 tah | 10 tahů bez busu |
| práce na vývoji | složitost × rating² (viz Projekty) | 50 bodů |

Cena roste se čtvercem ratingu, velikost lineárně. Vysoké ratingy jsou drahé, ale deck unesou.

## Názvy

Každá třída má 20 názvů podle ratingu (Attack 1 = „Zap 1.0“, Attack 20 = „GigaBlaster“), nad 20 se
použije název pro 20. Text v obchodě: „Zap 1.0 (Attack 1)“. Tabulky jsou v `src/core/data/programNames.ts`,
vytažené skriptem z originálu.

## Klientský program

Mise **Run Program** přidá do decku „Client Supplied Program“ s ratingem
`(číslo korporace + 4) / contracts.clientProgramRatingDivisor`. Korporace jsou seřazené podle velikosti
(5 na úroveň), takže rating ≈ velikost systému. Zvláštnost originálu: nejmenší korporace (číslo 0)
dá rating 0. Po skončení kontraktu program zmizí. Nejde koupit ani vyvíjet.
