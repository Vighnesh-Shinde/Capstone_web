"""Turn project_explain.txt + diagrams.html into one styled HTML document for printing.

The text file is deliberately plain (ASCII rules, aligned tables). This converts it to
HTML without rewriting any content: headings become headings, aligned blocks stay
preformatted so tables keep their columns, prose is re-flowed into paragraphs, and the
question bank gets its own styling.
"""
import html
import pathlib
import re

ROOT = pathlib.Path("C:/Projects/Depression_Detection_Web")
SCRATCH = pathlib.Path(__file__).parent
SRC = ROOT / "project_explain.txt"
DIAGRAMS = (SCRATCH / "diagrams.html").read_text(encoding="utf-8")
OUT = SCRATCH / "project_explain.html"

lines = SRC.read_text(encoding="utf-8").splitlines()

RULE = re.compile(r"^={10,}$")
SECTION = re.compile(r"^(\d{1,2})\.\s+(.+)$")
SUBSECTION = re.compile(r"^\s{0,3}(\d{1,2}\.\d{1,2})\s+(.+)$")
QUESTION = re.compile(r"^Q(\d{1,2})\.\s+(.*)$")
ANSWER = re.compile(r"^A\.\s{2}(.*)$")
GROUP = re.compile(r"^---\s+(.+?)\s+-+$")


def esc(text):
    return html.escape(text)


def is_preformatted(line):
    """Aligned content - tables, definition columns, code - keeps its spacing."""
    if not line.strip():
        return False
    if line.startswith("  ") and re.search(r"\S {2,}\S", line):
        return True
    if re.match(r"^\s{2,}[-*]\s", line):
        return True
    if re.match(r"^\s{4,}\S", line):
        return True
    return False


out = []
para: list[str] = []
pre: list[str] = []
answer: list[str] = []
in_title = True
i = 0


def flush_para():
    global para
    if para:
        out.append(f"<p>{esc(' '.join(para))}</p>")
        para = []


def flush_pre():
    global pre
    while pre and not pre[-1].strip():
        pre.pop()
    if pre:
        out.append("<pre>" + esc("\n".join(pre)) + "</pre>")
        pre = []


def flush_answer():
    global answer
    if answer:
        out.append(f"<p class='a'>{esc(' '.join(answer))}</p>")
        answer = []


def flush_all():
    flush_para()
    flush_pre()
    flush_answer()


while i < len(lines):
    line = lines[i]

    # ---- title banner and section headings: ==== / text / ====
    if RULE.match(line.strip()) and i + 2 < len(lines) and RULE.match(lines[i + 2].strip()):
        flush_all()
        heading = lines[i + 1].strip()
        i += 3
        if heading.upper().startswith("END OF DOCUMENT"):
            in_title = False
            continue
        m = SECTION.match(heading)
        if m:
            # Headings keep their original casing: title-casing turned DAIC-WOZ into Daic-Woz.
            out.append(f'<h2 class="page-break"><span class="num">{m.group(1)}</span>'
                       f'{esc(m.group(2))}</h2>')
        else:
            out.append(f'<h2 class="page-break">{esc(heading)}</h2>')
        in_title = False
        continue

    if RULE.match(line.strip()):
        i += 1
        continue

    stripped = line.strip()

    if in_title:
        # Cover block before the first section. The index is laid out in two
        # columns with spaces, so it has to keep its alignment - flattening it
        # merges the columns into nonsense like "1 Problem statement 14 Backend".
        if is_preformatted(line):
            flush_para()
            pre.append(line.rstrip())
        elif stripped:
            flush_pre()
            out.append(f'<p class="cover-line">{esc(stripped)}</p>')
        else:
            flush_pre()
        i += 1
        continue

    if not stripped:
        flush_para()
        flush_answer()
        if pre:
            pre.append("")
        i += 1
        continue

    m = GROUP.match(stripped)
    if m:
        flush_all()
        out.append(f'<h4 class="group">{esc(m.group(1))}</h4>')
        i += 1
        continue

    m = QUESTION.match(stripped)
    if m:
        flush_all()
        out.append(f'<p class="q"><b>Q{m.group(1)}.</b> {esc(m.group(2))}</p>')
        i += 1
        continue

    m = ANSWER.match(line)
    if m:
        flush_para()
        flush_pre()
        answer = [m.group(1).strip()]
        i += 1
        while i < len(lines) and lines[i].startswith("    ") and lines[i].strip():
            answer.append(lines[i].strip())
            i += 1
        flush_answer()
        continue

    m = SUBSECTION.match(line)
    if m and not is_preformatted(line):
        flush_all()
        out.append(f'<h3>{esc(m.group(1))} {esc(m.group(2))}</h3>')
        i += 1
        continue

    if is_preformatted(line):
        flush_para()
        pre.append(line)
        i += 1
        continue

    flush_pre()
    para.append(stripped)
    i += 1

flush_all()

body = "\n".join(out)
# The diagrams go straight after the cover, before section 1.
first_section = body.index('<h2 class="page-break">')
body = body[:first_section] + DIAGRAMS + body[first_section:]

CSS = """
@page { size: A4; margin: 14mm 13mm 15mm 13mm; }
:root { --violet:#5b21b6; --ink:#1f2937; --muted:#6b7280; --line:#d8d5e6; }
* { box-sizing:border-box; }
body { font-family:"Segoe UI",Calibri,Arial,sans-serif; color:var(--ink); font-size:10.2pt;
       line-height:1.45; margin:0; }
h2 { color:var(--violet); font-size:15pt; border-bottom:2px solid var(--violet);
     padding-bottom:4px; margin:0 0 12px; }
h2 .num { display:inline-block; min-width:30px; }
h3 { font-size:11.5pt; color:#3b0764; margin:15px 0 5px; }
h4.group { font-size:11pt; color:var(--violet); margin:16px 0 6px; letter-spacing:.02em; }
p { margin:6px 0 9px; }
p.q { margin:12px 0 3px; color:#3b0764; }
p.a { margin:0 0 10px; padding-left:14px; border-left:2px solid var(--line); }
p.cover-line { margin:3px 0; }
pre { font-family:Consolas,"Courier New",monospace; font-size:8.7pt; line-height:1.35;
      background:#faf9fe; border:1px solid var(--line); border-radius:6px;
      padding:8px 10px; margin:8px 0 12px; white-space:pre-wrap; overflow-wrap:anywhere;
      page-break-inside:avoid; }
.page-break { page-break-before:always; }
figure { margin:14px 0 18px; page-break-inside:avoid; text-align:center; }
figure svg { width:100%; height:auto; }
figcaption { font-size:8.8pt; color:var(--muted); margin-top:4px; text-align:left; }
.diagrams h2 { page-break-before:always; }
.lead { color:var(--muted); }
/* diagram element styles */
.bx { fill:#ffffff; stroke:var(--violet); stroke-width:1.6; }
.bx.db { fill:#f2fbf6; stroke:#15803d; }
.bx.ml { fill:#f5f2ff; }
.bx.tool { fill:#fffbf2; stroke:#b45309; }
.bx.blk { fill:#f7f5ff; }
.bx.step { fill:#ffffff; }
.bx.stop { fill:#fdf6f6; stroke:#b91c1c; }
.note { fill:#faf9fe; stroke:var(--line); stroke-width:1.4; }
text { font-family:"Segoe UI",Arial,sans-serif; }
text.t { font-size:12.5px; font-weight:700; fill:#3b0764; }
text.t.big { font-size:15px; }
text.t.r { fill:#b91c1c; }
text.s { font-size:11.2px; fill:#374151; }
text.s.mono { font-family:Consolas,monospace; font-size:10.5px; }
text.lb { font-size:10.5px; fill:#6b7280; }
.ln { stroke:var(--violet); stroke-width:1.6; fill:none; }
.ln.dash { stroke-dasharray:5 4; }
.lnx { stroke:#b91c1c; stroke-width:1.6; }
"""

OUT.write_text(
    "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
    "<title>Depression Detection Platform - Project Report</title>"
    f"<style>{CSS}</style></head><body>{body}</body></html>",
    encoding="utf-8")
print("wrote", OUT, OUT.stat().st_size, "bytes")
