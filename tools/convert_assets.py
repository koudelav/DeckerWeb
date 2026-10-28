"""Převod grafiky a zvuků z původních zdrojáků Decker 1.12 do assets/.

Použití: python3 tools/convert_assets.py <DeckerSource> <cílová složka assets>

- BMP z DefaultGraphics a RES -> PNG (RGBA). Barva (255,0,255) – magenta, kterou
  originál používá jako průhlednou v image listech – se převede na průhlednou.
- WAV ze Sound se kopírují beze změny.
- Názvy souborů zůstávají původní (kvůli dohledatelnosti v kódu originálu).
- Vypíše manifest assets/manifest.json (seznam souborů a které měly průhlednost).
"""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

MAGENTA = (255, 0, 255)


def convert_bmp(src: Path, dst: Path) -> bool:
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    keyed = False
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if (r, g, b) == MAGENTA:
                px[x, y] = (0, 0, 0, 0)
                keyed = True
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, optimize=True)
    return keyed


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    source = Path(sys.argv[1])
    out = Path(sys.argv[2])
    manifest = {"graphics": {}, "res": {}, "sound": []}

    for folder, key in (("DefaultGraphics", "graphics"), ("RES", "res")):
        for src in sorted((source / folder).iterdir()):
            if src.suffix.lower() != ".bmp":
                continue
            dst = out / key / (src.stem + ".png")
            keyed = convert_bmp(src, dst)
            with Image.open(src) as im:
                size = im.size
            manifest[key][src.stem] = {"size": list(size), "transparent": keyed}

    # Ikona aplikace
    ico = source / "RES" / "Decker.ico"
    if ico.exists():
        with Image.open(ico) as im:
            im.save(out / "res" / "Decker.png")

    for src in sorted((source / "Sound").iterdir()):
        if src.suffix.lower() != ".wav":
            continue
        dst = out / "sound" / src.name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        manifest["sound"].append(src.name)

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"graphics: {len(manifest['graphics'])}, res: {len(manifest['res'])}, sound: {len(manifest['sound'])}")
    print("s průhledností:", [k for d in ("graphics", "res") for k, v in manifest[d].items() if v["transparent"]])


if __name__ == "__main__":
    main()
