# 7. Projekty: vývoj programů a čipů

Kód: `src/core/projects.ts`. Originál: `NewProjectDlg.cpp`, `ProjectDataDlg.cpp`, `BuildDialog.cpp`.

## Postup

1. **Projekt** – napsat zdrojový kód programu (dovednost Programming) nebo návrh čipu (Chip Design).
   Nejvyšší rating = úroveň dovednosti. Klientský program nejde.
2. **Zdroják** – po dokončení projektu. Zůstává v seznamu a jde použít opakovaně.
3. **Program**: překlad zdrojáku je okamžitý. **Čip**: vypálení v Chip Burneru trvá několik dní.

## Pracnost

`s` = složitost (programy viz kapitola Programy; čipy: CPU a koprocesor 5, firmware 4 – `chips.complexity`),
`m` = nejvyšší rating zdrojáku stejné třídy, který už máš.

| cíl | pracnost |
|---|---|
| rating > m (nový / upgrade) | `s × rating² − s × m²` |
| rating ≤ m (downgrade) | `s × (r − rating)`, nejméně `projects.minWork` (1) |

U downgradu je `r` rating zdrojáku, ze kterého se vychází: poslední zdroják v seznamu s ratingem
od cílového do m (bez m), jinak m. (Komentář originálu mluví o „nejnižším vhodném“, kód bere poslední.)

**Rychlost** = dovednost × (1 + Design Assistant) bodů za den. Dny = ⌈pracnost / rychlost⌉.

Příklad: Decoy (s = 4) rating 3 od nuly = 36 bodů; s Programming 3 a bez Design Assistantu 12 dní.

## Dokončení

Když pracnost klesne na 0, hází se k20 proti `projects.successBase + rating − (dovednost + Design Assistant)`.

- úspěch → nový zdroják,
- selhání (i kritické) → „flaw in your code“: další kolo práce o ⌈původní pracnost / `projects.failureWorkDivisor`⌉ (čtvrtina).

Práce: 1 den, do konce týdne, nebo do konce projektu. Čas běží normálně (nájem, nabídky, …).
Nový projekt zruší rozpracovaný.

## Překlad programu

Program dostane jméno od hráče. Volby:

- **nahrát** (jen pokud se vejde do decku),
- **smazat** starší programy stejné třídy s nižším nebo stejným ratingem, nebo je jen **odnahrát**.
  Výchozí volby (útok, brnění…) se přesunou na nový program.

Opravená drobná chyba originálu: volba „odnahrát“ v originálu vynechala poslední program v seznamu.

## Vypalování čipu

Potřebuje Chip Burner a jen čip vyššího ratingu, než je nainstalovaný.
Práce = složitost čipu × rating, rychlost = úroveň Chip Burneru za den (Quad Speed = 4).
Hotový čip jde nainstalovat nebo zahodit. Nákup nového Chip Burneru rozpracovaný čip zničí.
