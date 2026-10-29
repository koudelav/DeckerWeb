# 10. Matrix: tah, pohyb, alarmy, ICE

Kód: `src/core/matrix/run.ts`. Originál: `MatrixView.cpp`, `Ice.cpp`. Rozbor: `docs/matrix-analyza.md`.
Parametry jsou v sekci `matrix` konfigurace, pokud není uvedeno jinak.

## Vstup

- Deck a mysl začínají na 20, fyzické zdraví zůstává z domova.
- Aktivní jsou výchozí programy (útok, brnění, štít, hide, reflect). Výchozí útok se vždy nahraje.
- Vstup je výstupní portál poslední oblasti. Se zadními vrátky do korporace lze vstoupit přímo do CPU.
- Korporace s pohotovostí po minulém útoku začíná na **žlutém alarmu**.

## Tah

Každá akce hráče, která „něco dělá“, ukončí tah (pohyb, program, akce v nodu, čekání). Bez tahu jsou:
výběr cíle, nastavení výchozího útoku, odnahrání programu, prohlížení. Na konci tahu (`DoEndPlayerTurn`):

1. pokračuje přenos (nahrání programu, stažení/úprava souboru),
2. pokračuje Scan/Evaluate,
3. odpočet klientského programu,
4. odpočet trace (hotový trace: normální = vše nepřátelské, Dump/Fry = vyhození),
5. **tahy všech ICE** – seřazené podle senzorů; ICE, které čeká na odpověď na dotaz, jde první.
   Pozor: komentář originálu říká „silnější první“, kód ale řadí **vzestupně** (slabší první) – zachováno,
6. poškození (mysl, pak deck) – pokles pod 1 = vyhození, přebytek jde do fyzického zdraví,
7. Silence a Smoke v nodech odpočítávají, Boost ztratí 1 rating,
8. možné vypnutí systému, obnova zničených ICE, čas +1 s.

Poškození se během tahu sčítá a odečte se až na konci, takže více zásahů v jednom tahu se sečte.

## Pohyb

Gateway hlídá přechod do jiného clusteru. Bez bypassu (Deceive) se zkusí aktivní Hide; jinak „blocks your passage“
a tah uplyne. Pohyb není možný ani přes gateway, když je v nodu nepřátelské ICE nebo čekající dotaz.
Odchodem z nodu se zruší stahování souboru, Scan/Evaluate a klientský program (ne nahrávání programu).
Proximity Mapper zmapuje i sousední nody.

## Přístup k nodu (AttemptNodeAccess)

Akce v nodu (soubory, I/O, mapa, alarm…) hlídá **Guardian**, jinak hlídající Attack ICE s nejlepšími senzory.
Bez bypassu se zkusí Hide, jinak „blocks your access“ a tah uplyne. Akce nejsou dostupné vůbec, když je v nodu
nepřátelské ICE nebo čekající dotaz a zároveň Guardian nebo černé ICE.

## Dotazy a alarmy

- Bílé ICE (gateway, guardian) se zeptá, když se hráč pokusí o průchod/přístup; černé ICE a probe, když si hráče všimnou
  (Hide může všimnutí zabránit).
- Dotaz = hráč má **3 tahy** na Deceive (ICE pak počítá Queried 1 → 2 → 3). Bez odpovědi ICE vyhlásí **žlutý alarm** a ptá se znovu; při žlutém alarmu
  (nebo v tichém nodu) přejde do nepřátelství.
- Deceive obejde cílové ICE i všechna ICE v nodu se stejným nebo nižším ratingem; ICE, které do nodu přijde později,
  je obejité, pokud jeho rating nepřevyšuje nejvyšší oklamaný.
- Návnady (Decoy) při dotazu rovnou vyvolají červený alarm.
- **Červený alarm**: aktivuje všechna spící ICE, response ICE z oblasti míří k místu alarmu, ICE v nodu hráče útočí.
  Splní se tím podmínka „alarm“ u misí bez alarmu (mise selže).
- Silence v nodu zabrání ICE v nodu vyvolat alarm (ICE ale zezlobí).

## Útok ICE na hráče

`TN = 10 − (2 × rating systému + boj ICE) + (defense + brnění)`, Killer + Neural Damper.

- Návnady: zásah s šancí `n / (n + 1)` trefí návnadu místo hráče.
- Reflect: druhý hod s bonusem ratingu Reflect; odrazí 20 % poškození za stupeň úspěchu. Kritické selhání Reflect zhroutí.
- Shield pohltí poškození do svého nahraného ratingu (pak se zhroutí).
- Killer ICE poškozuje mysl, ostatní deck. Crash ICE s šancí `poškození / 10` zhroutí náhodný nahraný program.

| Parametr | Výchozí | |
|---|---|---|
| `iceAttackBase` | 10 | základ cílového čísla útoku ICE |
| `dataBombBase` | 6 | data bomb (výbuch tapewormu) |
| `reflectDivisor` | 5 | 20 % za stupeň |
| `crashProgramChanceDie` | 10 | |

## Trace

Trace ICE v nodu hráče: `TN` jako útok, −1 za každé další trace ICE v nodu. Úspěch spustí trace na
`12 − 2 × úspěch` tahů (`traceTimeBase`, `traceTimePerSuccess`). První trace je vždy „normální“ – po dokončení jsou všechna
ICE nepřátelská a stealth −4. Další trace (Dump/Fry) po dokončení hráče vyhodí (Fry navíc může spálit čip).
Relocate trace zruší, Kill Trace v security nodu zruší stav „vystopován“.

## Chování ICE (stavový automat)

| stav | co ICE dělá |
|---|---|
| Inactive | nic (černé ICE spí do červeného alarmu) |
| Guarding | bílé: zeptá se, když hráč zkusil průchod/přístup; černé: zeptá se, když si hráče všimne |
| Following | jde za hráčem do sousedního nodu (ne přes Smoke), zeptá se |
| Moving | jde nejkratší cestou k cíli (domů / k alarmu); po návratu černé ICE mimo červený alarm usne |
| Searching | bloudí náhodně, zeptá se, když si hráče všimne |
| Queried 1–3 | čeká na odpověď |
| Attacking | útočí / trasuje; když hráč odejde, jde za ním (ne přes Smoke), jinak hledá nebo jde domů |
| Guarding/Moving hostile | hlídá / vrací se a vyhlašuje červený alarm |
| Destroying | tapeworm zničí soubor (data bomb vybuchne) a sám zanikne |

Zpomalené ICE jedná jen každý druhý tah, virus ubírá 1 zdraví za tah, zmatené ICE dělá náhodnou akci
(sebepoškození, útok na hráče, útok na jiné ICE, bloudění, nic; 25 % šance zrušit vlastní trace).

## Vypnutí systému a obnova ICE

- Při červeném alarmu, pokud není vypnutý externí alarm (I/O node v oblasti 0), hrozí každý tah s šancí
  `rating / 1000` vypnutí systému za `15 × počet oblastí` tahů (`shutdownChanceDie`, `shutdownTurnsPerArea`).
  Zastaví ho Kill Shutdown v CPU/SPU.
- Zničená ICE (kromě tapewormů) se postupně obnovují z ICE portu oblasti. Doba = `10 − rating/4` tahů + náhodná část
  intervalu kontroly (`21 − rating` při červeném alarmu, jinak `31 − rating`). Uzavřený ICE port obnovu v oblasti zastaví.

## Chyby originálu zachované v pravidlech

| | |
|---|---|
| `matrix.fixQueryStateBug` | DoQuery nastaví při rušení nižších dotazů stav sobě místo nižšímu bílému ICE (false = chování 1.12) |
| řazení ICE | vzestupně podle senzorů (komentář originálu tvrdí opak) |
| bloudění | ICE bez předchozího směru nevybere jako první krok východ |
