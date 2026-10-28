# Kuchařka pravidel

Popis pravidel hry pro vyvažování. Kapitoly vznikají průběžně s portem jednotlivých modulů.

U každého pravidla: co dělá, vzorec, parametry v konfiguraci (`src/core/config/defaults.ts`),
odkaz do originálu (soubor, funkce) a případné starší varianty z originálu (úpravy „FSO“).

**Konvence zápisu:** `random(N)` = celé číslo 0..N−1, `random2(K, N)` = součet K takových hodů.
„k20“ = hod 1..20. Názvy parametrů jsou cesty v konfiguraci, např. `dice.sides`.
Odchylky remasteru od originálu (opravy chyb, nové funkce) jsou v textu vždy výslovně označené.

## Kapitoly

| Kapitola | Stav |
|---|---|
| [1. Kostky a úspěch](01-kostky-a-uspech.md) | hotovo (fáze 1) |
| [2. Postava a deck](02-postava.md) | hotovo (fáze 2) |
| [3. Čas, lifestyle a léčení](03-cas-a-lifestyle.md) | hotovo (fáze 2) |
| [4. Programy – cena, velikost, názvy](04-programy.md) | hotovo (fáze 2); účinky v Matrixu – fáze 5 |
| [5. Obchod a objednávky](05-obchod.md) | hotovo (fáze 2) |
| [6. Kontrakty a odměny](06-kontrakty.md) | generování hotovo (fáze 2); vyhodnocení mise – fáze 5 |
| [7. Projekty](07-projekty.md) | hotovo (fáze 2) |
| [8. Generování systému](08-generovani-systemu.md) | hotovo (fáze 2) |
| [9. ICE – generování a ratingy](09-ice.md) | hotovo (fáze 2); chování v Matrixu – fáze 5 |
| Matrix (tah, alarmy, trace, download) | fáze 5 |

## Souhrn odchylek od 1.12

| Kde | Co | Proč |
|---|---|---|
| generování ICE | chyba „nikdy 3 ICE“ **zachována**, oprava přepínačem `iceGeneration.fixThirdIceBug` | věrnost originálu |
| generování nodů | nepřipojitelný node se připojí přes jiný junction | originál nechal nedosažitelný node |
| cíl mise na I/O | po přidání nodu se oblast znovu posune do kladných souřadnic | node mohl být mimo mapu |
| obchod | hláška o výkupu starého hardwaru se zobrazí | originál ji připravil, ale neukázal |
| objednávky | nejde objednat „Client Program“ | nesmyslná položka v originálu |
| překlad programu | „odnahrát staré“ zahrne i poslední program v seznamu | chyba ve smyčce originálu |
| typ ICE | Attack (Crash) má po analýze správný název | originál četl mimo tabulku |
| kontrakty | **nové**: zrušení přijatého kontraktu za ztrátu reputace | To-Do originálu |
| generátor náhody | sfc32 místo `rand()`, stav v savu | rozdělení stejné, posloupnost ne |
