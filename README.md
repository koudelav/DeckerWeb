# Decker Remaster (TypeScript)

Remaster hry **Decker – A Cyberspace RPG** verze 1.12 do prohlížeče.

- Původní hra: © 2001 Shawn Overcash, licence GNU GPL v2 (nebo pozdější).
- Tento projekt je odvozené dílo a je šířen pod stejnou licencí – viz `LICENSE`.
- Původní zdrojáky: `../DeckerSource` (beze změn). Plán: `../plan.md`.

## Struktura

| Cesta | Obsah |
|---|---|
| `src/core/` | herní logika bez UI (čisté TypeScript moduly) |
| `src/core/config/` | parametry pravidel; výchozí hodnoty = Decker 1.12 |
| `src/ui/` | uživatelské rozhraní (HTML/CSS) |
| `assets/` | grafika (PNG) a zvuky (WAV) převedené z originálu |
| `tests/` | unit testy (Vitest) |
| `docs/pravidla/` | kuchařka pravidel |
| `tools/` | pomocné skripty |

## Příkazy

```
npm install        # instalace závislostí
npm run dev        # vývojový server
npm test           # testy
npm run build      # build do dist/index.html (jedna samostatná stránka)
npm run assets     # znovu převést grafiku a zvuky z ../DeckerSource (vyžaduje Python + Pillow)
```

## Assety

`tools/convert_assets.py` převádí BMP z `DefaultGraphics` a `RES` na PNG. Magenta `(255,0,255)`,
kterou originál používá jako průhlednou barvu, se převádí na průhlednost. Názvy souborů
zůstávají původní, aby šly dohledat v kódu originálu. Seznam je v `assets/manifest.json`.
