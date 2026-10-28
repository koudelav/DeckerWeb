# 3. Čas, lifestyle a léčení

Kód: `src/core/character.ts` (passTime), `src/core/rest.ts`. Originál: `Character.cpp PassTime`, `RestDlg.cpp`, `CharDataDialog.cpp`.

## Lifestyle

| Lifestyle | nájem / měsíc | upgrade na něj (× 3) |
|---|---|---|
| Street („Poverty“) | 500 | – |
| Low („Lower Class“) | 1 000 | 3 000 |
| Medium | 2 000 | 6 000 |
| High | 4 000 | 12 000 |
| Elite | 10 000 | 30 000 |

Parametry `lifestyle.monthlyCost`, `lifestyle.upgradeFactor`. Lifestyle ovlivňuje:

- rating zboží v obchodě (kapitola Obchod) a název obchodu,
- strop reputace `(lifestyle + 1) × reputation.capPerLifestyle` → Street max. úroveň 4, Elite 20,
- strop základní obtížnosti kontraktů (stejný vzorec),
- odměnu za kontrakty (+100 kr za úroveň lifestylu).

Po upgradu se okamžitě vygeneruje nové zboží a všechny nabídky kontraktů se nahradí novými.

## Plynutí času (PassTime)

Čas plyne jen doma (odpočinek, práce na projektech, čekání). Při každém posunu o N dní:

1. **Konec měsíce** → nájem. Když na něj nejsou peníze, lifestyle klesá, dokud na nájem nejsou;
   na Street bez peněz **konec hry**. Zadní vrátka (backdoor) do systémů vydrží o měsíc méně.
2. **Nabídky kontraktů**: vypršelé zmizí a s šancí 1 / `time.expiredContractReplaceChanceDie` (½)
   se na jejich místo vygeneruje nová. Ostatním roste odměna o `odměna × N / time.contractPayIncreaseDivisor`
   (+10 % za den, počítáno z aktuální odměny – čekání se vyplatí, pokud nabídka nevyprší).
3. **Přijatý kontrakt**: po termínu propadne, reputace klesne o obtížnost kontraktu (případně i úroveň).
4. **Nový týden** (každých `time.daysPerWeek` dní): nové zboží v obchodě a doplnění nabídek kontraktů.
5. **Vypalování čipu** pokračuje (rychlost = úroveň Chip Burneru za den). Hotový čip lze nainstalovat nebo zahodit.
6. **Objednávka** dorazí po uplynutí doby dodání.
7. **Pohotovost systémů** korporací klesá o N dní.

Zvláštnost originálu (zachována): když vyprší **poslední** nabídka v seznamu, náhrada se vloží na začátek seznamu.

## Léčení (RestDlg)

`d` = chybějící body fyzického zdraví (max 20).

| volba | dny | cena |
|---|---|---|
| doma, 1 bod | `d` | 0 |
| doma, vše | `d × (d + 2) / 3` | 0 |
| nemocnice, 1 bod | dny doma (1 bod) / 2, nahoru | 100 × `d` |
| nemocnice, vše | dny doma (vše) / 2, nahoru | 100 × `d(d+2)/3` |
| čekat | 1 | 0 |

Nemocnice jde použít až od 2 chybějících bodů. Zdraví se doplní až **po** uplynutí času – nájem
a ostatní události přijdou dřív.

Parametry: `rest.homeDaysPerDamage`, `rest.fullHealOffset`, `rest.fullHealDivisor`,
`rest.hospitalTimeDivisor`, `rest.hospitalCostPerDay`.

**Historie:** komentář „FSO 7-25-01 Cut hospital time from 1/2 to 1/3“ – dělitel ve vzorci pro úplné vyléčení byl dřív 2.
