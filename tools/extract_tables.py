"""Jednorázové vytažení textových tabulek z originálu do TypeScriptu.

Použití: python3 tools/extract_tables.py <DeckerSource> src/core/data
Generuje programNames.ts, iceNames.ts, corporations.ts, fileContents.ts.
"""
import re
import sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path(sys.argv[2])


def read(name: str) -> str:
    return (src / name).read_text(encoding="latin-1").replace("\r", "")


def str_array(text: str, var: str) -> list[str]:
    m = re.search(r"\b" + re.escape(var) + r"\s*\[[^\]]*\]\s*=\s*\{(.*?)\};", text, re.S)
    if not m:
        raise SystemExit(f"nenalezeno: {var}")
    body = re.sub(r"//[^\n]*", "", m.group(1))
    return [s.encode("latin-1").decode("unicode_escape") for s in re.findall(r'"((?:[^"\\]|\\.)*)"', body)]


def js(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


HEADER = "// Vygenerováno skriptem tools/extract_tables.py z původních zdrojáků Decker 1.12.\n// © 2001 Shawn Overcash, GPL v2. Neupravovat ručně.\n\n"

# Programy
prog = read("Program.cpp")
order = ["g_szAttackPrograms", "g_szAttackAPrograms", "g_szAttackPPrograms", "g_szSlowPrograms", "g_szVirusPrograms",
         "g_szSilencePrograms", "g_szConfusionPrograms", "g_szWeakenPrograms", "g_szShieldPrograms", "g_szSmokePrograms",
         "g_szDecoyPrograms", "g_szMedicPrograms", "g_szArmorPrograms", "g_szHidePrograms", "g_szDeceivePrograms",
         "g_szRelocatePrograms", "g_szAnalyzePrograms", "g_szScanPrograms", "g_szEvaluatePrograms", "g_szDecryptPrograms",
         "g_szReflectPrograms", "g_szAttackBoostPrograms", "g_szDefenseBoostPrograms", "g_szStealthBoostPrograms",
         "g_szAnalysisBoostPrograms"]
lines = [HEADER, "/** Názvy programů podle třídy (index = ProgramClass) a ratingu (index = rating-1, max 20). Program.cpp */\n",
         "export const PROGRAM_NAMES: readonly (readonly string[])[] = [\n"]
for v in order:
    names = str_array(prog, v)
    assert len(names) == 20, v
    lines.append("  [" + ", ".join(js(n) for n in names) + "],\n")
lines.append("];\n\n")
lines.append("/** Názvy tříd programů. Program.cpp g_szProgramClassName */\n")
lines.append("export const PROGRAM_CLASS_NAMES: readonly string[] = [" + ", ".join(js(n) for n in str_array(prog, "g_szProgramClassName")) + "];\n")
(out / "programNames.ts").write_text("".join(lines), encoding="utf-8")

# ICE
ice = read("Ice.cpp")
ig = dict((m.group(1), int(m.group(2))) for m in re.finditer(r"#define\s+(IG_\w+)\s+(\d+)", ice))
tables = ["g_idGateway", "g_idProbe", "g_idGuardian", "g_idTapeworm", "g_idDataBomb", "g_idAttack", "g_idAttackHardened",
          "g_idAttackPhasing", "g_idAttackCrash", "g_idAttackLethal", "g_idAttackLethalHardened", "g_idAttackLethalPhasing",
          "g_idAttackLethalCrash", "g_idTrace", "g_idTraceDump", "g_idTraceFry"]
lines = [HEADER, "export interface IceNameEntry { readonly name: string; readonly image: number }\n\n",
         "/** Tabulky názvů a obrázků ICE. Ice.cpp g_id*. Obrázek = index v image listu il_ice. */\n",
         "export const ICE_NAMES = {\n"]
for t in tables:
    m = re.search(re.escape(t) + r"\[\d+\]\s*=\s*\{(.*?)\n\};", ice, re.S)
    entries = re.findall(r'\{"((?:[^"\\]|\\.)*)",\s*(IG_\w+)\}', m.group(1))
    key = t[len("g_id"):]
    key = key[0].lower() + key[1:]
    lines.append(f"  {key}: [\n")
    for name, g in entries:
        lines.append(f"    {{ name: {js(name)}, image: {ig[g]} }},\n")
    lines.append("  ],\n")
lines.append("} as const satisfies Record<string, readonly IceNameEntry[]>;\n")
(out / "iceNames.ts").write_text("".join(lines), encoding="utf-8")

# Korporace
con = read("Contract.cpp")
m = re.search(r"g_CorpDB\[NUM_CORP\]\s*=\s*\{(.*?)\n\};", con, re.S)
corps = re.findall(r'\{"((?:[^"\\]|\\.)*)",\s*(CT_\w+)\}', m.group(1))
assert len(corps) == 100
lines = [HEADER, 'import { CorpType } from "../constants";\n\n',
         "export interface Corporation { readonly name: string; readonly type: CorpType }\n\n",
         "/** Databáze korporací seřazená podle velikosti (5 na každou úroveň obtížnosti). Contract.cpp g_CorpDB */\n",
         "export const CORPORATIONS: readonly Corporation[] = [\n"]
cmap = {"CT_MEGACORP": "MegaCorp", "CT_ELECTRONICS": "Electronics", "CT_BANK": "Bank", "CT_LAB": "Lab", "CT_CONSUMER": "Consumer",
        "CT_MEDICAL": "Medical", "CT_OIL": "Oil", "CT_MFG": "Manufacturing", "CT_SCHOOL": "School", "CT_ENVIRON": "Environmental"}
for name, t in corps:
    lines.append(f"  {{ name: {js(name)}, type: CorpType.{cmap[t]} }},\n")
lines.append("];\n")
(out / "corporations.ts").write_text("".join(lines), encoding="utf-8")

# Soubory
ds = read("DSFile.cpp")
lines = [HEADER,
         "/** Obsah cenných souborů (index = cílový objekt CT_*). DSFile.cpp */\n",
         "export const VALUABLE_FILE_CONTENTS: readonly string[] = [" + ", ".join(js(n) for n in str_array(ds, "g_szValuableFileContents")) + "];\n\n",
         "/** Obsah bezcenných souborů. DSFile.cpp */\n",
         "export const USELESS_FILE_CONTENTS: readonly string[] = [\n" + "".join(f"  {js(n)},\n" for n in str_array(ds, "g_szUselessFileContents")) + "];\n\n",
         "/** Výsledek skenu podle typu souboru. DSFile.cpp */\n",
         "export const FILE_SCAN_STRINGS: readonly string[] = [" + ", ".join(js(n) for n in str_array(ds, "g_szScanString")) + "];\n"]
(out / "fileContents.ts").write_text("".join(lines), encoding="utf-8")
print("ok")
