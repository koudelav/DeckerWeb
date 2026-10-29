# 12. Konec runu a odměny

Kód: `src/core/matrix/run.ts` (dump, contractStatus). Originál: `MatrixView.cpp DoDumpDecker`, `Contract.cpp GetContractStatus`.
Parametry v sekci `runResult`.

## Důvody konce

| důvod | kdy |
|---|---|
| odpojení | hráč se odpojí |
| poškození decku | deck pod 1 (přebytek jde do fyzického zdraví) |
| bezvědomí | mysl pod 1 (přebytek jde do fyzického zdraví) |
| smrt | fyzické zdraví pod 1 – **konec hry**, pokud nemáš Bio Monitor s AutoDump (pak zdraví 1) |
| trace | dokončený Trace & Dump / Trace & Fry |
| pád systému | úspěšný Crash System |
| vypnutí systému | odpočet po červeném alarmu doběhl |

## Trace po runu

Pokud run skončil dokončeným extended trace (nebo vyhozením při běžícím extended trace):

- **AntiTrace Proxy** se obětuje a trace zmaří,
- jinak s šancí `random(10) ≤ korporace / 5` (≈ 10 % za úroveň systému, od velikosti 10 jistota)
  pošle korporace **policii**: lifestyle klesne na Street a nabídky kontraktů se vygenerují znovu,
- Trace & Fry navíc hodí `10 − boj ICE + (čip + Surge Suppressor)` na náhodný čip; úspěch sníží jeho rating o úspěch.

## Vyhodnocení kontraktu

Každý cíl se hodnotí zvlášť (C = splněno, I = nedokončeno, F = selhalo):

| mise | splněno |
|---|---|
| Steal | cílový soubor stažen (neupravený) |
| Steal & Erase | stažen a smazán |
| Erase | smazán |
| Edit | upraven a v nodu (smazání = neúspěch) |
| Deactivate / Activate / Sabotage | cílový I/O node použit |
| Crash | systém shozen |
| Backdoor | zadní vrátka vytvořena |
| Run Program | klientský program doběhl v cílovém nodu |

Navíc: bez alarmu – červený alarm = neúspěch; časová mise – překročení limitu (minuty × 60 tahů) = neúspěch.
Nedokončená mise při posledním dni termínu = neúspěch (po runu uplyne den).

## Odměny

| výsledek | výplata | reputace | body dovedností | kontrakt |
|---|---|---|---|---|
| splněno | odměna kontraktu | + obtížnost | viz níže | končí; přibude nová nabídka |
| nedokončeno | 0 | − obtížnost / 2 | 0 | zůstává, jde to zkusit znovu |
| neúspěch | 0 | − obtížnost | 0 | končí |

**Body dovedností** = obtížnost kontraktu, snížené podle toho, o kolik je efektivní úroveň postavy vyšší než obtížnost:
o 1 → 75 %, o 2 → 50 %, o 3 → 25 %, o 4+ → 0 (`runResult.skillPointPercentByLevelGap`).
Snadné mise tedy po čase body nedávají.

**Reputace** roste jen do stropu lifestylu (kapitola 3): pak „Capped at …“ a body se zastaví těsně pod další úrovní.

**Stažené soubory** (neupravené): cenné → kredity (vyplácí se vždy, i při neúspěchu mise), programy → do decku,
zdrojáky → do projektů.

## Po runu

- Pohotovost korporace: žlutý alarm na konci → `⌈rating/5⌉ + 1` dní, červený → `7 × ⌈rating/5⌉ + 1` dní;
  další run do jejího systému začne na žlutém alarmu.
- Uplyne 1 den (`runResult.daysAfterRun`) – nájem, nabídky, nový týden atd. (kapitola 3).

**Historie:** dřív body dovedností = `1 + 2 × obtížnost − efektivní úroveň`; autor je změnil, protože dávaly příliš
mnoho bodů za snadné mise.
