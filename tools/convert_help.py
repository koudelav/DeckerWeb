#!/usr/bin/env python3
"""Převod nápovědy originálu (WinHelp RTF: ../DeckerSource/Help/Decker.rtf) do src/ui/help/content.ts.

WinHelp: témata oddělená \\page, poznámky pod čarou # (id tématu), $ (název), K (klíčová slova),
odkazy = text s dvojitým podtržením (\\uldb) následovaný skrytým textem (\\v) s id cíle.
Obrázky ({bmc x.bmp}) jsou snímky původního rozhraní – vynechány.

Použití: python3 tools/convert_help.py [cesta k Decker.rtf]
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "DeckerSource" / "Help" / "Decker.rtf"
CNT = SRC.with_suffix(".cnt")
OUT = ROOT / "src" / "ui" / "help" / "content.ts"

SKIP_DEST = {"fonttbl", "colortbl", "stylesheet", "info", "rsidtbl", "pntext", "fldinst", "listtable",
             "listoverridetable", "latentstyles", "generator", "xmlnstbl", "pgdsctbl"}
SYMBOLS = {"lquote": "\u2018", "rquote": "\u2019", "ldblquote": "\u201c", "rdblquote": "\u201d",
           "emdash": "\u2014", "endash": "\u2013", "bullet": "\u2022", "tab": "\t"}

TOKEN = re.compile(r"\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-z])|([{}])|([^\\{}\r\n]+)|[\r\n]+")


class State:
    def __init__(self, other=None):
        if other:
            self.__dict__.update(other.__dict__)
        else:
            self.b = self.i = self.link = self.hidden = self.up = self.sup = False
            self.skip = False
            self.footnote = None  # seznam znaků poznámky, když jsme uvnitř


def convert(rtf: str):
    topics = []
    cur = {"id": None, "title": None, "keys": [], "blocks": []}
    para = []          # segmenty: (text, b, i, sup) nebo ("link", text, target)
    pend_link = []     # text odkazu čekající na skrytý cíl
    hidden_buf = []
    pstate = {"style": 0, "intbl": False, "list": False}
    table = None       # seznam řádků, řádek = seznam buněk (html)
    row = []
    stack = []
    st = State()
    first_ctrl = False

    def flush_link():
        nonlocal pend_link, hidden_buf
        if hidden_buf:
            raw = "".join(hidden_buf).strip()
            ext = re.match(r"%?!?EF\(([^,)]*)", raw)
            target = ("ext:" + ext.group(1)) if ext else raw.split(">")[0].split("@")[0].lstrip("!%*")
            text = "".join(pend_link)
            if text:
                para.append(("link", text, target))
            pend_link, hidden_buf = [], []

    def para_html():
        out = []
        for seg in para:
            if seg[0] == "link" and seg[2].startswith("ext:"):
                url = seg[2][4:]
                if url.startswith("http"):
                    out.append(f'<a href="{html.escape(url)}" target="_blank" rel="noopener">{html.escape(seg[1])}</a>')
                else:
                    out.append(html.escape(seg[1]))
            elif seg[0] == "link":
                out.append(f'<a href="#" data-topic="{html.escape(seg[2])}">{html.escape(seg[1])}</a>')
            else:
                t, b, i, sup = seg
                t = html.escape(t).replace("\t", " &emsp; ")
                if sup:
                    t = f"<sup>{t}</sup>"
                if i:
                    t = f"<em>{t}</em>"
                if b:
                    t = f"<strong>{t}</strong>"
                out.append(t)
        s = "".join(out)
        s = re.sub(r"\{bm[clr] [^}]*\}", "", s)
        s = re.sub(r"\s+", " ", s).strip()
        s = s.replace("</strong><strong>", "").replace("</em><em>", "")
        return s

    def end_para():
        nonlocal para
        flush_link()
        if pend_link:
            para.append((("".join(pend_link)), st.b, st.i, False))
            pend_link.clear()
        h = para_html()
        para = []
        return h

    def close_table():
        nonlocal table
        if table:
            rows = []
            for i, r in enumerate(table):
                tag = "th" if i == 0 and all(c.startswith("<strong>") for c in r if c) else "td"
                strip = lambda c: re.sub(r"^<strong>(.*)</strong>$", r"\1", c) if tag == "th" else c
                cells = "".join("<%s>%s</%s>" % (tag, strip(c), tag) for c in r)
                rows.append(f"<tr>{cells}</tr>")
            cur["blocks"].append("<table>" + "".join(rows) + "</table>")
        table = None

    def add_block(h):
        if pstate["intbl"]:
            return
        close_table()
        if not h:
            return
        if pstate["style"] == 1:
            cur["blocks"].append(f"<h2>{h}</h2>")
        elif pstate["style"] == 2:
            cur["blocks"].append(f"<h3>{h}</h3>")
        elif pstate["list"]:
            if cur["blocks"] and cur["blocks"][-1].startswith("<ul>"):
                cur["blocks"][-1] = cur["blocks"][-1][:-5] + f"<li>{h}</li></ul>"
            else:
                cur["blocks"].append(f"<ul><li>{h}</li></ul>")
        else:
            cur["blocks"].append(f"<p>{h}</p>")

    def end_topic():
        nonlocal cur
        add_block(end_para())
        close_table()
        if cur["id"]:
            topics.append(cur)
        cur = {"id": None, "title": None, "keys": [], "blocks": []}

    def text(t):
        if st.skip:
            return
        if st.footnote is not None:
            st.footnote.append(t)
            return
        if st.up:
            return  # značka poznámky pod čarou v textu
        if st.hidden:
            hidden_buf.append(t)
            return
        if hidden_buf:
            flush_link()
        if st.link:
            pend_link.append(t)
            return
        if pend_link:
            para.append(("".join(pend_link), st.b, st.i, False))
            pend_link.clear()
        para.append((t, st.b, st.i, st.sup))

    for m in TOKEN.finditer(rtf):
        word, num, hexc, sym, brace, plain = m.groups()
        if brace == "{":
            stack.append(st)
            st = State(st)
            first_ctrl = True
            continue
        if brace == "}":
            if st.footnote is not None and (not stack or stack[-1].footnote is None):
                ft = "".join(st.footnote).strip()
                if ft:
                    kind, val = ft[0], ft[1:].strip()
                    if kind == "#" and not cur["id"]:
                        cur["id"] = val
                    elif kind == "$":
                        cur["title"] = val
                    elif kind == "K":
                        cur["keys"] = [k.strip() for k in val.split(";") if k.strip()]
            st = stack.pop() if stack else State()
            first_ctrl = False
            continue
        was_first, first_ctrl = first_ctrl, False
        if word:
            n = int(num) if num is not None else None
            if word in SKIP_DEST or (was_first and word in ("info",)):
                st.skip = True
            elif word == "footnote":
                st.footnote = []
            elif word == "fldrslt":
                pass
            elif word == "par":
                if pstate["intbl"]:
                    para.append(("\n", False, False, False))
                else:
                    add_block(end_para())
            elif word == "page":
                end_topic()
            elif word == "cell":
                row.append(end_para())
            elif word == "row":
                if table is None:
                    table = []
                table.append(row)
                row = []
            elif word == "intbl":
                pstate["intbl"] = True
            elif word == "pard":
                if pstate["intbl"] and not para:
                    pass
                pstate.update(style=0, intbl=False, list=False)
            elif word == "s" and st.footnote is None:
                pstate["style"] = n or 0
            elif word == "pnlvlblt" or word == "pnlvlbody":
                pstate["list"] = True
            elif word == "plain":
                st.b = st.i = st.link = st.hidden = st.up = st.sup = False
            elif word == "b":
                st.b = n != 0
            elif word == "i":
                st.i = n != 0
            elif word in ("uldb", "ul"):
                st.link = n != 0
            elif word in ("ulnone",):
                st.link = False
            elif word == "v":
                st.hidden = n != 0
            elif word == "up":
                st.up = (n or 0) != 0
            elif word == "super":
                st.sup = True
            elif word == "nosupersub":
                st.sup = False
            elif word in SYMBOLS:
                text(SYMBOLS[word])
            elif word == "line":
                text(" ")
        elif hexc:
            text(bytes([int(hexc, 16)]).decode("cp1252", errors="replace"))
        elif sym:
            if sym == "*":
                st.skip = True if was_first else st.skip
            elif sym in "\\{}":
                text(sym)
            elif sym == "~":
                text("\u00a0")
            elif sym == "-":
                pass
        elif plain:
            text(plain)
    end_topic()
    return topics


def read_contents():
    """Decker.cnt: obsah nápovědy (úroveň, název, id tématu)."""
    out = []
    for line in CNT.read_text("latin1").splitlines():
        m = re.match(r"(\d) (.*?)(?:=(.*))?$", line)
        if m:
            out.append({"level": int(m.group(1)), "title": m.group(2), "topic": m.group(3)})
    return out


def main():
    rtf = SRC.read_bytes().decode("latin1")
    topics = convert(rtf)
    contents = read_contents()
    ids = {t["id"].lower(): t["id"] for t in topics}
    data = []
    for t in topics:
        title = t["title"] or t["id"]
        blocks = list(t["blocks"])
        if blocks:  # značky poznámek (#$AK) před nadpisem tématu
            blocks[0] = re.sub(r"^(<(?:p|h2|h3)>(?:<strong>)?)[#$KA+]*[#$][#$KA+]*", r"\1", blocks[0])
        blocks = [re.sub(r"^<p>(\s|&emsp;)+", "<p>", b) for b in blocks]
        blocks = [re.sub(r"^<p><strong>([^<]{1,60})</strong></p>$", r"<h3>\1</h3>", b) for b in blocks]
        if blocks and re.sub(r"<[^>]+>", "", blocks[0]).strip().lower() == title.lower():
            blocks = blocks[1:]
        body = "".join(blocks)
        body = re.sub(r'data-topic="([^"]+)"', lambda m: f'data-topic="{ids.get(m.group(1).lower(), m.group(1))}"', body)
        data.append({"id": t["id"], "title": title, "html": body})
    ids = {t["id"] for t in data}
    for t in data:
        for target in re.findall(r'data-topic="([^"]+)"', t["html"]):
            if target not in ids:
                print(f"varování: odkaz na neznámé téma {target} v {t['id']}", file=sys.stderr)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// Vygenerováno skriptem tools/convert_help.py z Help/Decker.rtf originálu – needitovat ručně.\n"
        "export interface HelpTopic { id: string; title: string; html: string }\n"
        "export interface HelpEntry { level: number; title: string; topic: string | null }\n"
        f"export const HELP_TOPICS: HelpTopic[] = {json.dumps(data, ensure_ascii=False, indent=1)};\n"
        f"export const HELP_CONTENTS: HelpEntry[] = {json.dumps(contents, ensure_ascii=False, indent=1)};\n",
        encoding="utf-8",
    )
    print(f"{len(data)} témat, {sum(len(t['html']) for t in data)} znaků -> {OUT}")


if __name__ == "__main__":
    main()
