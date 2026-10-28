# 5. Obchod a objednávky

Kód: `src/core/shop.ts`. Originál: `ShopItem.cpp`, `Character.cpp GenerateShopItems`, `Shop.cpp`, `OrderDlg.cpp`.

## Nabídka

Nové zboží každý týden a po upgradu lifestylu. Žádné dvě položky nejsou stejné (typ + třída + rating).

| | počet | rating |
|---|---|---|
| programy | `3 + 3 × random(4)` → 3..12 | `2 × lifestyle + 1..6` |
| hardware | `1 + random(4)` → 1..4 | `1..(lifestyle + 1)`, nejvýš max. úroveň |
| čipy | `2 + 2 × random(4)` → 2..8 | `2 × lifestyle + 2..7` |

Ceny se náhodně upraví o ±`shop.priceVariancePercent` (15 %). Parametry v sekci `shop`.

Název obchodu podle lifestylu: Thrifty Electronics, The Little Warez Shop, The Matrix Emporium, Hacker's Haven, Nullspace.

## Ceny

| | vzorec | parametry |
|---|---|---|
| program | složitost × rating² × 25 | `programs.*` |
| čip | rating² × základ | `chips.baseCost`: CPU 150, firmware 100, koprocesor 125 |
| hardware | základ × 2^(úroveň−1) | `hardware.baseCost` |

| hardware | základ | max. úroveň | k čemu |
|---|---|---|---|
| Chip Burner | 1 000 | 4 | vypalování čipů, rychlost = úroveň |
| Surge Suppressor | 500 | 5 | účinek v Matrixu (fáze 5) |
| Neural Damper | 1 000 | 5 | účinek v Matrixu (fáze 5) |
| Trace Monitor | 250 | 3 | účinek v Matrixu (fáze 5) |
| Bio Monitor | 500 | 2 | účinek v Matrixu (fáze 5); úroveň 2 = AutoDump |
| High Bandwidth Bus | 500 | 5 | rychlost nahrávání a stahování = 2^úroveň MP za tah |
| Proximity Mapper | 2 000 | 1 | účinek v Matrixu (fáze 5) |
| Design Assistant | 2 000 | 3 | rychlejší a spolehlivější projekty |
| AntiTrace Proxy | 1 500 | 1 | účinek v Matrixu (fáze 5) |

## Nákup

- **Program**: nejde koupit stejný rating, jaký už máš. Při slabší verzi se hra zeptá.
  Program zůstává v nabídce (originál ho neodebírá). Zařadí se podle třídy, v rámci třídy od nejsilnějšího.
- **Hardware**: jen vyšší úroveň než máš. Starý se vykoupí za polovinu ceny
  (`shopTrade.hardwareResaleDivisor`). Nový Chip Burner zničí rozpracovaný čip.
  Originál o výkupu hlášku připravil, ale neukázal – remaster ji ukazuje.
- **Čip**: jen vyšší rating než máš.

## Objednávky na zakázku

Kdykoli jedna objednávka. Lze objednat cokoli do ratingu `order.maxRatingBase + order.maxRatingPerLifestyle × lifestyle`
(6 + 2 × lifestyle), hardware do jeho max. úrovně.

- Cena = `order.priceMultiplier` (2) × běžná cena (bez náhodné odchylky).
- Doba dodání podle ceny (`order.priceThresholds`, `order.deliveryDays`):

| cena | < 500 | < 1 000 | < 5 000 | < 10 000 | < 50 000 | více |
|---|---|---|---|---|---|---|
| dny | 2 | 3 | 4 | 5 | 6 | 7 |

  Software o `order.softwareDaysFaster` (1) den dřív.

Odchylka od originálu: originál v objednávce nabízel i „Client Program“, remaster ho vynechává.
