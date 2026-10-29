# Rozbor MatrixView (fáze 5)

Originál: `MatrixView.cpp` (5018 řádků), `Ice.cpp` (DoAction, DoQuery, DoMove, DoWander, NoticedPlayer),
`TransferDlg.cpp`, `FileAccessDlg.cpp`, `Contract.cpp GetContractStatus`, `System.cpp RouteResponseIC /
SetReactivateTime / MarkContractNodes`, `HomeView.cpp OnMatrix`.

Cíl: oddělit **pravidla** (přepsána do `src/core/matrix/run.ts`) od **kreslení a ovládání** (nové UI ve fázi 6).

## Pravidla → `src/core/matrix/run.ts`

| Originál | Co dělá | Remaster |
|---|---|---|
| `HomeView::OnMatrix` | vygeneruje systém, nastaví zdraví decku a mysli, aktivní programy podle výchozích, vstup (portál nebo backdoor do CPU) | `startRun()` |
| `DoEnterNode` | umístí hráče a návnady, zmapuje node (+ sousedy s Proximity Mapperem), sestaví seznam ICE v nodu, vynuluje bypass | `Run.enterNode()` |
| `DoMove` | gateway blokuje směr (hide, jinak blokace), zruší přenos souboru, scan a klientský program, změní stavy ICE v opouštěném nodu | `Run.move()` |
| `UpdateControls`, `UpdateNodeAccessButtons` | kdy jsou dostupné pohyby, programy a akce v nodu | `Run.controls()` |
| `DoRunProgram` | všech 26 programů: cílené, plošné, aktivní (shield, armor, hide, reflect, boost), node (silence, smoke), decoy, medic, scan/evaluate, client | `Run.runProgram()` |
| `DoRunProgramVsIce` | hody programů proti ICE (útoky, slow, virus, confuse, weaken, hide, deceive, relocate, analyze, decrypt) | `Run.programVsIce()` |
| `OnGetFile/OnEditFile/OnEraseFile` + `CFileAccessDlg` | přístup k souborům, přenos (edit 2× rychleji), mazání | `Run.fileAction()` |
| `CTransferDlg` | nahrání programu během runu | `Run.loadProgram()` |
| `OnUseIO, OnCrash, OnGetMap, OnBackdoor, OnKillAlarm, OnKillShutDown, OnKillTrace, OnEnterPortal` | akce v nodech | stejnojmenné metody |
| `AttemptNodeAccess` | guardian / hlídající černé ICE brání akci v nodu; hide | `Run.attemptNodeAccess()` |
| `DoEndPlayerTurn` | přenosy, scan/evaluate, klientský program, trace, tahy ICE (seřazené podle senzorů), poškození, silence/smoke, boost, vypnutí systému, obnova ICE, čas | `Run.endTurn()` |
| `DoSetAlert`, `RouteResponseIC`, `MarkIceAsHostile` | alarmy a nepřátelství ICE | `Run.setAlert()` … |
| `DoCrashIce`, `DoClearTrace`, `DoRemoveProgram` | zničení ICE, zrušení trace, odebrání programu | stejnojmenné metody |
| `CIce::DoAction` | stavový automat ICE: zpomalení, virus, zmatení, sledování, pohyb, hledání, dotazy, alarm, ničení souboru, útok, trace | `Run.iceAction()` |
| `CIce::DoQuery / DoMove / DoWander / NoticedPlayer` | dotaz na hráče, pohyb ICE, náhodné bloudění, všimnutí si hráče | `Run.iceQuery()` … |
| `DoDumpDecker` + `GetContractStatus` | konec runu: důvod, trace (policie, AntiTrace Proxy, spálení čipu), vyhodnocení kontraktu, odměny, reputace, body dovedností, soubory → kredity/programy/zdrojáky, pohotovost korporace, 1 den | `Run.dump()` |

Zprávy (`m_MessageView.AddMessage` s barvou), zvuky (`PlayGameSound`) a grafické efekty
(`DrawDamage`, `DrawQuery`, `DrawAlert`, `DrawBypass`) jádro jen **hlásí** do výstupu pro UI.

## Kreslení a ovládání → nové UI (fáze 6)

- `CMatrixView` okno 640×480, rozmístění tlačítek, kurzory, tooltipy, akcelerátory (klávesy).
- `CNodeView` (pohled do nodu 9×9, klik na ICE = cíl), `CMapView` (mapa oblasti, zoom),
  `CMessageView`, `CHealthBar`, `CActiveBar`, `CAlarmBar`, `CClockView`, `CNameBar`, `CImageDisplay`.
- Dialogy: `CFileAccessDlg` a `CTransferDlg` (seznamy), `CIceDataDlg` (údaje o ICE), `CMissionResultsDlg`.
- Rychlé uložení/načtení (F-klávesy) – v remasteru přes Options; Ironman v Matrixu neukládá.

## Stav runu (co se ukládá)

Originál ukládal běh přímo v `CCharacter` (`m_bOnRun` a dál). Remaster má samostatný `RunState`
(`src/core/matrix/run.ts`), který je v savu v poli `run`: systém, poloha, cíl, aktivní programy,
návnady, trace, přenos, scan, klientský program, čas, odložené poškození, příznak alarmu, výpis zpráv.

## Chyby a zvláštnosti originálu

| Kde | Co | Remaster |
|---|---|---|
| `CIce::DoQuery` | při rušení nižších dotazů nastaví u bílého ICE stav **sobě** místo jemu (`m_nState` místo `pIce->m_nState`) – dotazující ICE pak přejde do hlídání | zachováno, přepínač `matrix.fixQueryStateBug` |
| `DoRunProgram` (Scan) | větev pro koprocesor testuje `NT_IO` podruhé – scan v koprocesoru nic neřekne | zachováno (scan v COP stejně nejde spustit, tlačítko je jen v DS a I/O) |
| `DoRunProgramVsIce` (Virus) | první hod počítá s **plným** ratingem programu místo nahraného | zachováno |
| `CIce::DoWander` | u ICE bez předchozího směru (`DIR_NONE`) se vynechá směr východ (`OppDir(-1) = 1`) | zachováno (vliv jen na první krok obnoveného ICE) |
| `CTransferDlg` | znovunahrání částečně vybitého programu počítá jeho velikost do zatížení dvakrát | zachováno |
| `DoRemoveProgram` | odebrání (crash/odnahrání) výchozího útočného programu zruší **trvale** i výchozí volbu | zachováno |
| `DoEndPlayerTurn` | ICE zničené během tahu jiného ICE se v témže tahu může ještě pokusit jednat | remaster ho přeskočí |
| `DoDumpDecker` (smrt) | `PostQuitMessage` – hra se ukončí bez uložení | konec hry, návrat na úvod, smazání automatického uložení |
| `GetContractStatus` | když zbývá poslední den, nedokončená mise se počítá jako neúspěch | zachováno (po runu uplyne 1 den) |
