"""Build a clean DOCX presenter script from the Markdown source."""

import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "deliverables" / "EDAS_Presentation_Script.md"
OUT = ROOT / "deliverables" / "EDAS_Presentation_Script.docx"

NAVY = RGBColor(0x19, 0x37, 0x5F)
BLUE = RGBColor(0x23, 0x73, 0xAF)
MUTED = RGBColor(0x6D, 0x78, 0x85)
INK = RGBColor(0x1E, 0x2A, 0x38)

doc = Document()
section = doc.sections[0]
section.top_margin = Inches(0.8)
section.bottom_margin = Inches(0.75)
section.left_margin = Inches(0.9)
section.right_margin = Inches(0.9)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(10.5)
normal.font.color.rgb = INK
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.15
normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")

for name, size, color, before, after in [
    ("Heading 1", 15, NAVY, 16, 6),
    ("Heading 2", 12, BLUE, 10, 3),
]:
    style = styles[name]
    style.font.name = "Calibri"
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = color
    style.paragraph_format.space_before = Pt(before)
    style.paragraph_format.space_after = Pt(after)
    style.paragraph_format.keep_with_next = True


def add_page_number(paragraph):
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_end)
    run.font.name = "Calibri"
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED


# footer
footer = section.footer
f_para = footer.paragraphs[0]
f_para.text = ""
f_para.paragraph_format.tab_stops.add_tab_stop(Inches(6.7), WD_ALIGN_PARAGRAPH.RIGHT)
r = f_para.add_run("EDAS · IEEE SMART CITY WORKATHON 2026\t")
r.font.name = "Calibri"
r.font.size = Pt(8)
r.font.color.rgb = MUTED
add_page_number(f_para)

# cover
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(60)
r = p.add_run("EDAS")
r.font.name = "Calibri"
r.font.size = Pt(38)
r.font.bold = True
r.font.color.rgb = NAVY

p = doc.add_paragraph()
r = p.add_run("Enroute Driver Assistance System")
r.font.name = "Calibri"
r.font.size = Pt(18)
r.font.color.rgb = BLUE

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(10)
p.paragraph_format.space_after = Pt(24)
r = p.add_run("Presentation script · four speakers · working prototype")
r.font.size = Pt(11)
r.font.color.rgb = MUTED

border = OxmlElement("w:pBdr")
bottom = OxmlElement("w:bottom")
bottom.set(qn("w:val"), "single")
bottom.set(qn("w:sz"), "12")
bottom.set(qn("w:space"), "1")
bottom.set(qn("w:color"), "2373AF")
border.append(bottom)
p._p.get_or_add_pPr().append(border)

meta = [
    ("Event", "IEEE Smart City Workathon 2026"),
    ("Format", "16 slides · four speakers · live Vision Lab demo"),
    ("Target duration", "8 min 45 s (hard stop 10:00)"),
    ("Team", "Mahek Shukla · Sonakshi Chowgule · Ankit Raj · Vaishnavi Zavar"),
]
table = doc.add_table(rows=len(meta), cols=2)
table.autofit = False
table.columns[0].width = Inches(1.35)
table.columns[1].width = Inches(5.35)
for row, (label, value) in zip(table.rows, meta):
    row.cells[0].width = Inches(1.35)
    row.cells[1].width = Inches(5.35)
    for cell, text, bold, color in [
        (row.cells[0], label, True, MUTED),
        (row.cells[1], value, False, INK),
    ]:
        cell.text = ""
        para = cell.paragraphs[0]
        para.paragraph_format.space_after = Pt(3)
        run = para.add_run(text)
        run.font.name = "Calibri"
        run.font.size = Pt(9.5)
        run.font.bold = bold
        run.font.color.rgb = color
doc.add_page_break()

# parse markdown from the run of show
lines = SOURCE.read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if line.startswith("## Run of show"))
lines = lines[start:]


def add_runs(paragraph, text, size=10.5, color=INK):
    """Render **bold** and *italic* inline markers."""
    text = text.replace("`", "")
    for token in re.split(r"(\*\*.+?\*\*|\*[^*]+?\*)", text):
        if not token:
            continue
        bold = token.startswith("**") and token.endswith("**")
        italic = token.startswith("*") and token.endswith("*") and not bold
        content = token[2:-2] if bold else (token[1:-1] if italic else token)
        run = paragraph.add_run(content)
        run.font.name = "Calibri"
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.color.rgb = color


def shade(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


i = 0
while i < len(lines):
    line = lines[i].rstrip()

    if not line or line.strip() == "---":
        i += 1
        continue

    if line.startswith("|"):
        block = []
        while i < len(lines) and lines[i].startswith("|"):
            block.append(lines[i])
            i += 1
        rows = []
        for row in block:
            cells = [cell.strip() for cell in row.strip().strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", cell) for cell in cells):
                continue
            rows.append(cells)
        if not rows:
            continue
        cols = max(len(row) for row in rows)
        table = doc.add_table(rows=len(rows), cols=cols)
        table.style = "Table Grid"
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        for r_idx, row in enumerate(rows):
            for c_idx in range(cols):
                cell = table.cell(r_idx, c_idx)
                cell.text = ""
                para = cell.paragraphs[0]
                para.paragraph_format.space_after = Pt(1)
                add_runs(para, row[c_idx] if c_idx < len(row) else "",
                         size=9, color=RGBColor(0xFF, 0xFF, 0xFF) if r_idx == 0 else INK)
                if r_idx == 0:
                    shade(cell, "19375F")
                    for run in para.runs:
                        run.font.bold = True
                elif r_idx % 2 == 0:
                    shade(cell, "F2F6FA")
        doc.add_paragraph().paragraph_format.space_after = Pt(2)
        continue

    if line.startswith("### "):
        doc.add_heading(line[4:], level=2)
    elif line.startswith("## "):
        doc.add_heading(line[3:], level=1)
    elif line.startswith("# "):
        doc.add_heading(line[2:], level=1)
    elif line.startswith("- "):
        para = doc.add_paragraph(style="List Bullet")
        para.paragraph_format.space_after = Pt(2)
        add_runs(para, line[2:])
    elif re.match(r"^\d+\.\s", line):
        para = doc.add_paragraph(style="List Number")
        para.paragraph_format.space_after = Pt(2)
        add_runs(para, re.sub(r"^\d+\.\s", "", line))
    elif line.startswith("**") and line.endswith("**") and len(line) < 120:
        para = doc.add_paragraph()
        para.paragraph_format.space_before = Pt(8)
        add_runs(para, line, size=10.5, color=NAVY)
    else:
        para = doc.add_paragraph()
        add_runs(para, line)
    i += 1

# doc properties
doc.core_properties.title = "EDAS — Presentation Script"
doc.core_properties.author = "Team EDAS"
doc.core_properties.subject = "IEEE Smart City Workathon 2026 working prototype"

doc.save(OUT)
print("saved", OUT)
