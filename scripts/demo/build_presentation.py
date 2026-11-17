"""Build the EDAS presentation (16:9, editable PowerPoint shapes)."""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "deliverables" / "assets"
OUT = ROOT / "deliverables" / "EDAS_Presentation.pptx"

W, H = 13.333, 7.5
M = 0.62
# Palette follows the supplied IEEE Smart City Workathon template.
INK = RGBColor(0x1E, 0x2A, 0x38)
INK2 = RGBColor(0x33, 0x41, 0x4F)
MUTED = RGBColor(0x6D, 0x78, 0x85)
GREEN = RGBColor(0x23, 0x55, 0x87)
GREEN_D = RGBColor(0x19, 0x37, 0x5F)
MINT = RGBColor(0xE8, 0xF0, 0xF7)
MINT2 = RGBColor(0xF4, 0xF7, 0xFB)
CREAM = RGBColor(0xFF, 0xFF, 0xFF)
LINE = RGBColor(0xDD, 0xE5, 0xEE)
AMBER = RGBColor(0xBD, 0x81, 0x4F)
RED = RGBColor(0xB4, 0x3B, 0x35)
BLUE = RGBColor(0x23, 0x73, 0xAF)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
PALE = RGBColor(0xC9, 0xD8, 0xE8)
BODY = "Calibri"
HEAD = "Calibri"
MONO = "Consolas"

prs = Presentation()
prs.slide_width = Inches(W)
prs.slide_height = Inches(H)
BLANK = prs.slide_layouts[6]


def new_slide(color=CREAM):
    slide = prs.slides.add_slide(BLANK)
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(W), Inches(H))
    bg.fill.solid()
    bg.fill.fore_color.rgb = color
    bg.line.fill.background()
    bg.shadow.inherit = False
    return slide


def add_text(slide, x, y, w, h, text, size=11, bold=False, color=INK, font=BODY,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, line_spacing=1.0, space_after=0):
    shape = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = shape.text_frame
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for index, line in enumerate(str(text).split("\n")):
        paragraph = tf.paragraphs[0] if index == 0 else tf.add_paragraph()
        paragraph.alignment = align
        paragraph.line_spacing = line_spacing
        paragraph.space_after = Pt(space_after)
        run = paragraph.add_run()
        run.text = line
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.name = font
        run.font.color.rgb = color
    return shape


def rect(slide, x, y, w, h, fill=None, line=None, radius=0.08, line_width=0.75):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.adjustments[0] = radius
    if fill is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(line_width)
    shape.shadow.inherit = False
    return shape


def card(slide, x, y, w, h, fill=WHITE, line=LINE, radius=0.08):
    return rect(slide, x, y, w, h, fill, line, radius)


def pill(slide, x, y, w, h, text, fill=MINT, color=GREEN, size=8.5, border=None):
    shape = rect(slide, x, y, w, h, fill, border, radius=0.5)
    tf = shape.text_frame
    tf.word_wrap = False
    tf.margin_left = Inches(0.06)
    tf.margin_right = Inches(0.06)
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.name = BODY
    run.font.bold = True
    run.font.color.rgb = color
    return shape


def line(slide, x1, y1, x2, y2, color=LINE, width=0.75, dash=None):
    connector = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    connector.line.color.rgb = color
    connector.line.width = Pt(width)
    if dash:
        from pptx.enum.dml import MSO_LINE_DASH_STYLE
        connector.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    return connector


def arrow(slide, x, y, w, h, color=GREEN, direction=MSO_SHAPE.RIGHT_ARROW):
    shape = slide.shapes.add_shape(direction, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    shape.shadow.inherit = False
    return shape


def eyebrow(slide, text, color=GREEN):
    add_text(slide, M, 0.36, 9.5, 0.24, text.upper(), size=8.5, bold=True, color=color, font=MONO)


def heading(slide, title, subtitle=None, color=GREEN_D):
    two_lines = "\n" in title
    add_text(slide, M, 0.6, 11.9, 1.0 if two_lines else 0.62, title,
             size=25 if two_lines else 27, bold=True, color=color, font=HEAD, line_spacing=0.95)
    if subtitle:
        add_text(slide, M, 1.46 if two_lines else 1.22, 11.4, 0.4, subtitle, size=11, color=MUTED, line_spacing=1.15)


def footer(slide, number, section):
    line(slide, M, 7.08, W - M, 7.08, LINE, 0.6)
    add_text(slide, M, 7.16, 4.6, 0.2, "EDAS · ENROUTE DRIVER ASSISTANCE SYSTEM", size=7, color=MUTED, font=MONO)
    add_text(slide, 5.2, 7.16, 4.6, 0.2, section.upper(), size=7, color=MUTED, font=MONO, align=PP_ALIGN.CENTER)
    add_text(slide, W - M - 0.6, 7.16, 0.6, 0.2, f"{number:02d}", size=7, color=MUTED, font=MONO, align=PP_ALIGN.RIGHT)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def stat_card(slide, x, y, w, h, number, label, note, accent=GREEN):
    card(slide, x, y, w, h)
    add_text(slide, x + 0.18, y + 0.14, w - 0.36, 0.16, label.upper(), size=7.5, color=MUTED, font=MONO)
    add_text(slide, x + 0.18, y + 0.34, w - 0.36, 0.5, number, size=30, bold=True, color=GREEN_D, font=HEAD)
    add_text(slide, x + 0.18, y + h - 0.48, w - 0.36, 0.34, note, size=8.5, color=MUTED, line_spacing=1.08)
    line(slide, x + 0.18, y + h - 0.12, x + 0.18 + 0.6, y + h - 0.12, accent, 2.2)


# ------------------------------------------------------------------ slide 1
s = new_slide(GREEN_D)
s.shapes.add_picture(str(ASSETS / "title-bg.jpg"), 0, 0, width=Inches(W), height=Inches(H))
# supplied template logo strip
rect(s, M, 0.3, 4.55, 1.1, RGBColor(0xF7, 0xF1, 0xE4), None, 0.02)
s.shapes.add_picture(str(ASSETS / "ieee-logos.png"), Inches(M + 0.07), Inches(0.35), width=Inches(4.4))
add_text(s, 8.55, 0.46, 4.15, 0.22, "IEEE SMART CITY WORKATHON 2026", size=7.5, bold=True, color=PALE, font=MONO, align=PP_ALIGN.RIGHT)
add_text(s, 8.55, 0.7, 4.15, 0.2, "WORKING PROTOTYPE & IMPLEMENTATION", size=6.5, color=RGBColor(0x9F, 0xB6, 0xCE), font=MONO, align=PP_ALIGN.RIGHT)
add_text(s, M, 1.78, 8.0, 0.24, "IEEE SMART CITY WORKATHON 2026  ·  WORKING PROTOTYPE", size=8.5, bold=True, color=PALE, font=MONO)
add_text(s, M, 2.08, 3.2, 0.9, "EDAS", size=56, bold=True, color=WHITE, font=HEAD, line_spacing=0.85)
add_text(s, M, 3.0, 8.0, 0.5, "Enroute Driver Assistance System", size=24, bold=False, color=WHITE, font=HEAD)
add_text(s, M, 3.66, 6.7, 0.9, "Turning every smartphone into a road safety sensor —\nand every vehicle into a contributor to smarter roads.", size=12.5, color=RGBColor(0xD3, 0xE4, 0xD8), line_spacing=1.35)
line(s, M, 4.72, 5.5, 4.72, RGBColor(0x6F, 0x9C, 0xC4), 1.2)
add_text(s, M, 4.94, 3.0, 0.2, "TEAM EDAS", size=7.5, bold=True, color=PALE, font=MONO)
names = [("Mahek Shukla", "Problem & product"), ("Sonakshi Chowgule", "Solution & demo"), ("Ankit Raj", "AI & architecture"), ("Vaishnavi Zavar", "Civic & scale")]
for index, (name, role) in enumerate(names):
    x = M + index * 2.35
    add_text(s, x, 5.26, 2.2, 0.24, name, size=11, bold=True, color=WHITE)
    add_text(s, x, 5.5, 2.2, 0.2, role, size=7.5, color=PALE)
add_text(s, M, 6.34, 7.5, 0.22, "PUNE PILOT  ·  MAHARASHTRA, INDIA", size=8, bold=True, color=RGBColor(0xF0, 0xD5, 0xA8), font=MONO)
notes(s, "Mahek opens. Introduce the team and the single idea: the phone already on the dashboard can become road-safety infrastructure.")

# ------------------------------------------------------------------ slide 2
s = new_slide()
eyebrow(s, "01 · PROBLEM & WORKING SOLUTION")
heading(s, "Road hazards are seen too late —\nand recorded too slowly.")
stat_card(s, M, 1.85, 2.75, 1.5, "4.88 lakh", "Road accidents · India 2024", "More than 1,300 crashes every day, across India.", RED)
stat_card(s, M + 2.93, 1.85, 2.75, 1.5, "1.77 lakh", "Road fatalities · India 2024", "Maharashtra alone recorded 15,715 deaths.", RED)
quote = card(s, M, 3.6, 5.68, 2.15, MINT2, RGBColor(0xD8, 0xE6, 0xDA))
add_text(s, M + 0.24, 3.82, 0.5, 0.5, "“", size=40, bold=True, color=GREEN, font=HEAD)
add_text(s, M + 0.24, 4.22, 5.1, 1.0, "A pothole is not just a road defect.\nIt is an unpredicted event in a driver’s path.", size=14.5, bold=True, color=GREEN_D, font=HEAD, line_spacing=1.2)
add_text(s, M + 0.24, 5.28, 5.1, 0.3, "The warning arrives after the wheel does.", size=9, color=MUTED)
add_text(s, 6.65, 1.8, 5.9, 0.24, "WHAT BREAKS TODAY", size=8, bold=True, color=GREEN, font=MONO)
problems = [
    ("01", "Reactive reporting", "Complaints, inspections and repair queues lag the defect by days or weeks."),
    ("02", "Maps know the road, not its condition", "Navigation optimises the route but cannot warn about a fresh pothole."),
    ("03", "Safety hardware is locked to premium vehicles", "Dashcams and ADAS remain isolated, expensive and vehicle-bound."),
    ("04", "No civic feedback loop", "Verified evidence rarely reaches the crew that can fix the road."),
]
for index, (num, title, body) in enumerate(problems):
    y = 2.14 + index * 0.96
    add_text(s, 6.65, y, 0.4, 0.3, num, size=9, bold=True, color=AMBER, font=MONO)
    add_text(s, 7.1, y - 0.02, 5.4, 0.26, title, size=11.5, bold=True, color=INK)
    add_text(s, 7.1, y + 0.25, 5.35, 0.44, body, size=9.5, color=MUTED, line_spacing=1.2)
add_text(s, M, 6.38, 12.0, 0.4, "Sources: MoRTH, Road Accidents in India 2024; Lok Sabha Unstarred Question No. 6401, 2 April 2026.", size=7.5, color=MUTED)
footer(s, 2, "01 · Problem")
notes(s, "Mahek: the cost is not only crashes; it is the missing data loop between a driver and a repair crew.")

# ------------------------------------------------------------------ slide 3
s = new_slide()
eyebrow(s, "01 · PROBLEM & WORKING SOLUTION")
heading(s, "Why existing tools stop short", "Each tool solves one slice. None closes the loop from observation to repair.")
rows = [
    ["Capability", "Navigation apps", "Manual complaints", "Dashcam / ADAS", "EDAS"],
    ["Warns before the hazard", "Partial", "No", "Yes — vehicle-bound", "Yes"],
    ["Continuously maps road condition", "No", "No", "No", "Yes"],
    ["Runs on an existing smartphone", "Yes", "Yes", "No", "Yes"],
    ["Independent verification", "No", "No", "No", "Yes"],
    ["Connects drivers to repair workflow", "No", "Partial", "No", "Yes"],
]
table_shape = s.shapes.add_table(len(rows), 5, Inches(M), Inches(1.9), Inches(12.0), Inches(3.65))
table = table_shape.table
widths = [3.75, 2.05, 2.05, 2.3, 1.85]
for index, width in enumerate(widths):
    table.columns[index].width = Inches(width)
for r, row in enumerate(rows):
    table.rows[r].height = Inches(0.55 if r else 0.5)
    for c, value in enumerate(row):
        cell = table.cell(r, c)
        cell.text = ""
        cell.margin_left = Inches(0.14)
        cell.margin_right = Inches(0.08)
        cell.margin_top = Inches(0.04)
        cell.margin_bottom = Inches(0.04)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = cell.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT if c == 0 else PP_ALIGN.CENTER
        run = p.add_run()
        run.text = value
        run.font.name = BODY
        run.font.size = Pt(10.5 if r else 9)
        run.font.bold = (r == 0 or c == 4)
        if r == 0:
            run.font.color.rgb = WHITE
            cell.fill.solid(); cell.fill.fore_color.rgb = GREEN
        else:
            if c == 4:
                cell.fill.solid(); cell.fill.fore_color.rgb = MINT
                run.font.color.rgb = GREEN_D
            else:
                cell.fill.solid(); cell.fill.fore_color.rgb = WHITE if r % 2 else RGBColor(0xFA, 0xFB, 0xF8)
                run.font.color.rgb = INK2 if c == 0 else MUTED
        if r > 0 and c in (1, 2, 3) and value == "No":
            run.font.color.rgb = RGBColor(0xA8, 0xAF, 0xA9)
tip = card(s, M, 5.95, 12.0, 0.72, MINT2, RGBColor(0xD8, 0xE6, 0xDA))
add_text(s, M + 0.22, 6.11, 0.4, 0.24, "↳", size=16, bold=True, color=GREEN)
add_text(s, M + 0.62, 6.09, 11.1, 0.44, "EDAS is not a replacement for vehicle safety systems. It is the missing road-intelligence layer between the driver, the city and the repair crew.", size=10, color=GREEN_D, line_spacing=1.2)
footer(s, 3, "01 · Problem")
notes(s, "Positioning matters: we are complementary to ADAS, not competing with it.")

# ------------------------------------------------------------------ slide 4
s = new_slide()
eyebrow(s, "01 · PROBLEM & WORKING SOLUTION")
heading(s, "One smartphone. Two outcomes.", "A single observation improves the next driver’s safety — and the city’s maintenance queue.")
values = [
    ("Driver assistance", "Hazard alerts arrive before the vehicle reaches the defect, with distance, severity and a recommended action."),
    ("Civic intelligence", "Verified, geotagged evidence enters a repair workflow with confidence, history and independent re-observation."),
    ("Network effect", "Every participating vehicle improves the corridor map. Coverage grows without new roadside hardware."),
]
for index, (title, body) in enumerate(values):
    y = 1.85 + index * 1.4
    add_text(s, 3.4, y - 0.02, 0.5, 0.35, f"0{index + 1}", size=9, bold=True, color=AMBER, font=MONO)
    add_text(s, M, y, 2.7, 0.3, title, size=12.5, bold=True, color=GREEN_D, font=HEAD)
    add_text(s, M, y + 0.34, 2.72, 0.9, body, size=9.5, color=MUTED, line_spacing=1.25)
    if index < 2:
        line(s, M, y + 1.2, 3.25, y + 1.2, LINE, 0.6)
add_text(s, M, 6.2, 3.1, 0.2, "NO NEW HARDWARE  ·  NO NEW DRIVER BEHAVIOUR", size=7.5, bold=True, color=GREEN, font=MONO)
# right composition
s.shapes.add_picture(str(ASSETS / "before.jpg"), Inches(3.62), Inches(1.78), width=Inches(4.1))
s.shapes.add_picture(str(ASSETS / "after.jpg"), Inches(8.02), Inches(1.78), width=Inches(4.1))
pill(s, 3.78, 1.92, 0.75, 0.24, "BEFORE", WHITE, INK, 7)
pill(s, 8.18, 1.92, 0.7, 0.24, "AFTER", RGBColor(0xA9, 0xE0, 0xBE), GREEN_D, 7)
add_text(s, 3.62, 4.12, 4.1, 0.22, "Raw dashcam survey", size=8.5, color=MUTED)
add_text(s, 8.02, 4.12, 4.1, 0.22, "Analysed output with marked defects", size=8.5, color=MUTED)
flow = card(s, 3.62, 4.58, 8.5, 1.55, GREEN_D, None, 0.06)
add_text(s, 3.85, 4.76, 8.0, 0.2, "THE EDAS LOOP", size=7.5, bold=True, color=PALE, font=MONO)
steps = ["Observe", "Verify", "Alert", "Repair", "Re-verify"]
for index, step in enumerate(steps):
    x = 3.88 + index * 1.63
    add_text(s, x, 5.2, 1.4, 0.3, step, size=12, bold=True, color=WHITE, font=HEAD)
    if index < len(steps) - 1:
        add_text(s, x + 1.25, 5.16, 0.35, 0.3, "→", size=13, color=RGBColor(0x8F, 0xE0, 0xB0))
add_text(s, 3.85, 5.72, 7.9, 0.24, "One loop, two beneficiaries: the driver and the city.", size=8.5, color=PALE)
footer(s, 4, "01 · Solution")
notes(s, "Sonakshi introduces the dual-purpose product; the photographs are from the supplied reference survey.")

# ------------------------------------------------------------------ slide 5
s = new_slide()
eyebrow(s, "01 · PROBLEM & WORKING SOLUTION")
heading(s, "How EDAS works", "A smartphone observes. A verification engine decides. Two products act on it.")
chain = [
    ("01", "Sense", "Camera, GPS,\naccelerometer"),
    ("02", "Detect", "YOLOv8 on-device\nroad-damage model"),
    ("03", "Locate", "GPS projected to\nthe corridor"),
    ("04", "Verify", "Independent vehicles\nwithin 35 m"),
    ("05", "Act", "Driver alert ·\ncivic case"),
    ("06", "Learn", "Re-observation and\nrepair feedback"),
]
start_x = M
step_w = 1.9
gap = 0.15
for index, (num, title, body) in enumerate(chain):
    x = start_x + index * (step_w + gap)
    card(s, x, 1.86, step_w, 1.9)
    add_text(s, x + 0.16, 1.98, 0.5, 0.2, num, size=8, bold=True, color=AMBER, font=MONO)
    add_text(s, x + 0.16, 2.26, step_w - 0.32, 0.28, title, size=13, bold=True, color=GREEN_D, font=HEAD)
    add_text(s, x + 0.16, 2.66, step_w - 0.32, 0.7, body, size=8.5, color=MUTED, line_spacing=1.2)
    if index < len(chain) - 1:
        arrow(s, x + step_w + 0.02, 2.72, 0.11, 0.18, RGBColor(0x9D, 0xC0, 0xA8))
outcomes = [
    ("Driver app", "Distance, severity and a recommended action — not a generic map warning.", MINT),
    ("Road network", "Every pass refreshes condition data for the corridor.", MINT2),
    ("City workspace", "A prioritised, evidence-backed repair queue with a full audit trail.", MINT),
]
for index, (title, body, fill) in enumerate(outcomes):
    x = M + index * 4.02
    card(s, x, 4.08, 3.85, 1.25, fill, RGBColor(0xD8, 0xE6, 0xDA))
    add_text(s, x + 0.2, 4.22, 3.4, 0.24, title, size=11, bold=True, color=GREEN_D)
    add_text(s, x + 0.2, 4.52, 3.45, 0.62, body, size=9, color=MUTED, line_spacing=1.2)
strip = card(s, M, 5.55, 12.0, 0.85, GREEN_D, None, 0.06)
add_text(s, M + 0.22, 5.7, 8.0, 0.22, "SAFETY CONSTRAINT", size=7.5, bold=True, color=PALE, font=MONO)
add_text(s, M + 0.22, 5.92, 11.5, 0.34, "Alerts are advisory. EDAS never controls steering, braking or throttle. Critical hazards always interrupt; the driver remains in control.", size=10, color=WHITE)
add_text(s, M, 6.6, 12.0, 0.24, "A privacy-preserving design: hazard frames and metadata only — no continuous cabin video.", size=8, color=MUTED)
footer(s, 5, "01 · How it works")
notes(s, "Sonakshi walks the six-step flow in 40 seconds, then hands to Ankit for architecture.")

# ------------------------------------------------------------------ slide 6 architecture
s = new_slide(WHITE)
eyebrow(s, "02 · ARCHITECTURE & TECHNOLOGY")
heading(s, "System architecture", "Edge-first detection, network verification, and an accountable civic workflow.")
layer_data = [
    ("01", "DATA ACQUISITION", RGBColor(0xF6, 0xEE, 0xE2), [
        ("Smartphone camera", "1080p · 10 fps target"),
        ("GPS + map matching", "Corridor and direction"),
        ("Accelerometer + gyro", "Ride-quality evidence"),
        ("Vehicle context", "Speed · route · time"),
    ]),
    ("02", "EDGE PROCESSING", MINT, [
        ("Frame sampling", "10 fps · 640 px"),
        ("YOLOv8 detection", "Pothole · crack · manhole"),
        ("Hazard classification", "Class + confidence"),
        ("Sensor fusion", "GPS + IMU association"),
    ]),
    ("03", "INTELLIGENCE", RGBColor(0xE3, 0xEE, 0xE6), [
        ("Cross-vehicle consensus", "Independent observations"),
        ("Duplicate removal", "35 m spatial match"),
        ("RL alert policy", "Safety-first decisions"),
        ("Severity scoring", "Driver + civic priority"),
    ]),
    ("04", "COMMUNICATION", RGBColor(0xE9, 0xEF, 0xF5), [
        ("REST + WebSocket API", "Jobs, events, status"),
        ("Hazard metadata sync", "Corridor-wide updates"),
        ("Geo-fenced alerts", "1.2 km alert radius"),
        ("Private evidence store", "Signed, time-limited URLs"),
    ]),
    ("05", "APPLICATION", RGBColor(0xFA, 0xF0, 0xE2), [
        ("Driver application", "Alerts · report · review"),
        ("Connected fleet view", "Corridor health"),
        ("Civic dashboard", "Cases · crews · SLAs"),
    ]),
]
col_w = 2.22
col_gap = 0.16
for index, (num, label, fill, boxes) in enumerate(layer_data):
    x = M - 0.08 + index * (col_w + col_gap)
    header = rect(s, x, 1.56, col_w, 0.32, GREEN_D if index == 2 else RGBColor(0xF1, 0xF4, 0xEE), None, 0.2)
    add_text(s, x + 0.1, 1.62, col_w - 0.2, 0.2, f"{num}  {label}", size=7.5, bold=True,
             color=WHITE if index == 2 else GREEN, font=MONO)
    for box_index, (title, body) in enumerate(boxes):
        by = 2.0 + box_index * 0.75
        card(s, x, by, col_w, 0.65, fill if index != 2 else RGBColor(0xE9, 0xF3, 0xEC), RGBColor(0xD8, 0xE1, 0xD7), 0.06)
        add_text(s, x + 0.1, by + 0.08, col_w - 0.2, 0.22, title, size=8.8, bold=True, color=INK)
        add_text(s, x + 0.1, by + 0.31, col_w - 0.2, 0.24, body, size=7.2, color=MUTED)
    if index < len(layer_data) - 1:
        arrow(s, x + col_w + 0.015, 3.15, 0.12, 0.16, RGBColor(0x92, 0xB5, 0x9D))
# data layer
data_y = 5.55
data = rect(s, M - 0.08, data_y, 12.14, 0.7, RGBColor(0xEE, 0xF1, 0xEC), RGBColor(0xD8, 0xE1, 0xD7), 0.05)
add_text(s, M + 0.04, data_y + 0.09, 1.45, 0.2, "06  DATA LAYER", size=7.5, bold=True, color=GREEN, font=MONO)
add_text(s, M + 1.62, data_y + 0.08, 10.2, 0.52, "PostgreSQL + PostGIS  ·  hazard records  ·  observations & consensus  ·  repair workflow  ·  geospatial analytics  ·  model-run metadata", size=8.3, color=INK2, line_spacing=1.25)
add_text(s, M - 0.02, 6.42, 12.1, 0.42, "Verified observations return to the network as fresh evidence — the feedback loop is the product.", size=9.5, bold=True, color=GREEN_D)
add_text(s, M - 0.02, 6.72, 12.0, 0.24, "Editable diagram · one traceable path from a frame on the road to a repair record in the city workspace.", size=7.5, color=MUTED)
footer(s, 6, "02 · Architecture")
notes(s, "Ankit: explain left-to-right in 60 seconds. Emphasise the feedback loop and the human review gate.")

# ------------------------------------------------------------------ slide 7 CV
s = new_slide()
eyebrow(s, "02 · ARCHITECTURE & TECHNOLOGY")
heading(s, "Computer vision finds the damage.\nA person confirms the case.", "YOLOv8 turns road footage into timestamped hazard events, with confidence attached.")
bullets = [
    ("Detection", "Five road-damage classes: potholes, cracks, open manholes, waterlogging and obstructions."),
    ("Association", "Each box is linked to a timestamp, a GPS fix and the corridor’s direction of travel."),
    ("Review", "Events are ranked by confidence; a reviewer confirms the location before a civic case is opened."),
    ("Evidence", "The annotated clip and event metadata travel together — the city sees what the model saw."),
]
for index, (title, body) in enumerate(bullets):
    y = 1.9 + index * 0.92
    rect(s, M, y + 0.03, 0.06, 0.5, GREEN if index < 3 else AMBER, None, 0.4)
    add_text(s, M + 0.18, y, 3.9, 0.24, title, size=10, bold=True, color=GREEN_D)
    add_text(s, M + 0.18, y + 0.25, 3.85, 0.58, body, size=8.6, color=MUTED, line_spacing=1.2)
# model facts card
card(s, M, 5.6, 4.0, 0.9, GREEN_D, None, 0.05)
add_text(s, M + 0.16, 5.7, 3.7, 0.2, "MODEL", size=6.5, bold=True, color=PALE, font=MONO)
add_text(s, M + 0.16, 5.9, 3.7, 0.5, "YOLOv8s-road checkpoint  ·  640 px  ·  review-gated", size=8.2, color=WHITE)
# images
img_y = 1.82
s.shapes.add_picture(str(ASSETS / "before.jpg"), Inches(5.0), Inches(img_y), width=Inches(3.75))
s.shapes.add_picture(str(ASSETS / "after.jpg"), Inches(8.95), Inches(img_y), width=Inches(3.75))
pill(s, 5.14, img_y + 0.12, 0.72, 0.24, "INPUT", WHITE, INK, 6.5)
pill(s, 9.09, img_y + 0.12, 0.78, 0.24, "OUTPUT", RGBColor(0xA9, 0xE0, 0xBE), GREEN_D, 6.5)
add_text(s, 5.0, img_y + 2.24, 3.75, 0.22, "Raw survey frame", size=8, color=MUTED)
add_text(s, 8.95, img_y + 2.24, 3.75, 0.22, "Marked potholes and count", size=8, color=MUTED)
# pipeline strip
pipe_y = 4.48
steps = ["Frame\nsampling", "YOLOv8\ninference", "Hazard\nclassification", "GPS + IMU\nfusion", "Event for\nreview"]
for index, step in enumerate(steps):
    x = 5.0 + index * 1.58
    card(s, x, pipe_y, 1.42, 0.72, MINT2 if index != 1 else GREEN_D, RGBColor(0xD8, 0xE6, 0xDA), 0.06)
    add_text(s, x + 0.08, pipe_y + 0.16, 1.26, 0.45, step, size=8, bold=index == 1,
             color=WHITE if index == 1 else INK2, align=PP_ALIGN.CENTER, line_spacing=1.0)
    if index < 4:
        add_text(s, x + 1.38, pipe_y + 0.26, 0.2, 0.2, "→", size=9, color=GREEN)
add_text(s, 5.0, 5.4, 7.9, 0.4, "Reference 10-second survey  ·  6 hazard events surfaced for human review  ·  confidence 0.84–0.96", size=9, bold=True, color=GREEN_D)
add_text(s, 5.0, 5.72, 7.8, 0.65, "Confidence is the model’s per-detection score, not an accuracy benchmark. The review gate keeps uncertainty away from drivers and crews.", size=7.8, color=MUTED, line_spacing=1.25)
add_text(s, 5.0, 6.5, 7.8, 0.2, "ROLLING STOCK OF THE PIPELINE: FIVE CLASSES · TRACKING-READY EVENT SCHEMA", size=7, bold=True, color=GREEN, font=MONO)
footer(s, 7, "02 · AI & vision")
notes(s, "Ankit explains that RL is not the vision model. The CV layer produces evidence; the review gate protects the workflow.")

# ------------------------------------------------------------------ slide 8 RL
s = new_slide()
eyebrow(s, "02 · ARCHITECTURE & TECHNOLOGY")
heading(s, "Reinforcement learning decides\nwhen to interrupt the driver.", "The detector answers “what is there?” The policy answers “what should EDAS do about it?”.")
# loop diagram
loop_x, loop_y = M, 1.92
card(s, loop_x, loop_y, 5.7, 4.55, MINT2, RGBColor(0xDB, 0xE7, 0xDB), 0.05)
node_w, node_h = 2.35, 0.95
nodes = [
    ("STATE", "Hazard class · distance · confidence · route context", 0.22, 0.22),
    ("ACTION", "Alert now · monitor · suppress · escalate", 3.0, 0.22),
    ("REWARD", "Safety + accuracy + relevance − penalties", 3.0, 2.35),
    ("POLICY", "Adaptive rule selection under safety constraints", 0.22, 2.35),
]
for title, body, dx, dy in nodes:
    card(s, loop_x + dx, loop_y + dy, node_w, node_h, WHITE, RGBColor(0xD7, 0xE3, 0xD7), 0.06)
    add_text(s, loop_x + dx + 0.14, loop_y + dy + 0.11, node_w - 0.28, 0.2, title, size=7.5, bold=True, color=GREEN, font=MONO)
    add_text(s, loop_x + dx + 0.14, loop_y + dy + 0.34, node_w - 0.28, 0.5, body, size=8.2, color=INK2, line_spacing=1.2)
arrow(s, loop_x + 2.62, loop_y + 0.52, 0.3, 0.16, RGBColor(0x8F, 0xB5, 0x9B))
arrow(s, loop_x + 2.62, loop_y + 2.65, 0.3, 0.16, RGBColor(0x8F, 0xB5, 0x9B), MSO_SHAPE.LEFT_ARROW)
arrow(s, loop_x + 4.35, loop_y + 1.28, 0.16, 0.95, RGBColor(0x8F, 0xB5, 0x9B), MSO_SHAPE.DOWN_ARROW)
arrow(s, loop_x + 1.2, loop_y + 1.28, 0.16, 0.95, RGBColor(0x8F, 0xB5, 0x9B), MSO_SHAPE.UP_ARROW)
add_text(s, loop_x + 1.6, loop_y + 1.5, 2.4, 0.3, "adaptive policy", size=7.5, color=MUTED, font=MONO, align=PP_ALIGN.CENTER)
add_text(s, loop_x + 0.22, loop_y + 3.55, 5.25, 0.7, "The policy is trained to prioritise safe, relevant alerts — not to maximise the number of alerts. Safety constraints bound every reward.", size=8.6, color=MUTED, line_spacing=1.25)
# formula
formula = card(s, 6.66, 1.92, 6.0, 2.25, GREEN_D, None, 0.05)
add_text(s, 6.88, 2.08, 5.6, 0.2, "ILLUSTRATIVE REWARD FUNCTION", size=7.5, bold=True, color=PALE, font=MONO)
add_text(s, 6.88, 2.4, 5.55, 0.7, "R = 0.40·Safety + 0.25·AlertAccuracy\n     + 0.20·RouteRelevance\n     − 0.10·FalseAlerts − 0.05·DriverDistraction", size=10.5, color=WHITE, font=MONO, line_spacing=1.3)
add_text(s, 6.88, 3.55, 5.4, 0.45, "Weights and ranges are proposed design parameters — not measured results. They are tuned during the pilot.", size=7.6, color=PALE, line_spacing=1.2)
# constraints
card(s, 6.66, 4.32, 6.0, 1.6)
add_text(s, 6.86, 4.45, 5.6, 0.2, "SAFETY OVERRIDES OPTIMISATION", size=7.5, bold=True, color=RED, font=MONO)
rules = [
    "A critical hazard always produces an alert, whatever the reward.",
    "An alert never asks the driver to look away from the road.",
    "EDAS is advisory: no steering, braking or throttle control.",
]
for index, rule in enumerate(rules):
    add_text(s, 6.86, 4.72 + index * 0.36, 5.55, 0.32, f"✓  {rule}", size=8.5, color=INK2)
add_text(s, 6.66, 6.1, 6.0, 0.45, "State → policy → action → reward → updated policy. Crowd feedback becomes the next state.", size=8.6, color=MUTED, line_spacing=1.2)
footer(s, 8, "02 · AI & RL")
notes(s, "Ankit distinguishes detection from decision-making and makes clear the RL policy is not the object detector.")

# ------------------------------------------------------------------ slide 9 crowd
s = new_slide()
eyebrow(s, "02 · CROWDSOURCED INTELLIGENCE")
heading(s, "One pothole. Three independent witnesses.", "A hazard becomes trusted only when separate vehicles agree — not when one model is confident.")
vehicles = [
    ("A", "MH12 ED 4821", "08:42:16", 0.72, "First observation · 38 m ahead", MINT2),
    ("B", "MH12 ED 1934", "08:43:02", 0.88, "Independent match inside 35 m", MINT),
    ("C", "MH14 KL 7720", "08:43:40", 0.94, "Third observation crosses threshold", RGBColor(0xE3, 0xEE, 0xE6)),
]
for index, (letter, plate, time, conf, body, fill) in enumerate(vehicles):
    y = 1.85 + index * 1.1
    card(s, M, y, 3.45, 0.95, fill, RGBColor(0xD8, 0xE6, 0xDA))
    circle = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(M + 0.14), Inches(y + 0.2), Inches(0.52), Inches(0.52))
    circle.fill.solid(); circle.fill.fore_color.rgb = GREEN; circle.line.fill.background(); circle.shadow.inherit = False
    add_text(s, M + 0.14, y + 0.32, 0.52, 0.24, letter, size=12, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    add_text(s, M + 0.78, y + 0.14, 2.5, 0.22, plate, size=9.5, bold=True, color=GREEN_D)
    add_text(s, M + 0.78, y + 0.38, 2.55, 0.2, f"{time}  ·  {int(conf * 100)}% confidence", size=7.8, color=MUTED, font=MONO)
    add_text(s, M + 0.78, y + 0.6, 2.55, 0.24, body, size=7.6, color=MUTED)
    if index < 2:
        add_text(s, M + 1.49, y + 0.97, 0.4, 0.2, "↓", size=10, color=GREEN)
# hazard card
hx = 4.5
card(s, hx, 2.15, 3.15, 2.5, WHITE, LINE)
add_text(s, hx + 0.2, 2.3, 2.7, 0.2, "HAZARD CANDIDATE", size=7, bold=True, color=AMBER, font=MONO)
add_text(s, hx + 0.2, 2.55, 2.7, 0.3, "Pothole", size=17, bold=True, color=GREEN_D, font=HEAD)
add_text(s, hx + 0.2, 2.92, 2.7, 0.4, "Sinhagad Road\nNanded City gate", size=8.5, color=MUTED, line_spacing=1.2)
line(s, hx + 0.2, 3.45, hx + 2.95, 3.45, LINE, 0.6)
add_text(s, hx + 0.2, 3.56, 2.7, 0.2, "INDEPENDENT REPORTERS", size=6.5, bold=True, color=MUTED, font=MONO)
add_text(s, hx + 0.2, 3.77, 1.0, 0.4, "3", size=25, bold=True, color=GREEN_D, font=HEAD)
add_text(s, hx + 0.95, 3.88, 2.0, 0.4, "vehicles agree\ninside 35 m", size=8, color=MUTED, line_spacing=1.15)
# confidence ladder
cx = 8.0
card(s, cx, 1.85, 4.7, 3.55, GREEN_D, None, 0.05)
add_text(s, cx + 0.22, 2.0, 4.2, 0.2, "CONSENSUS SCORE", size=7.5, bold=True, color=PALE, font=MONO)
for index, (value, label) in enumerate([(72, "Single observation"), (88, "Second vehicle"), (94, "Verified · alert published")]):
    y = 2.4 + index * 0.86
    add_text(s, cx + 0.22, y, 3.8, 0.2, label, size=8.5, color=RGBColor(0xD3, 0xE4, 0xD8))
    track = rect(s, cx + 0.22, y + 0.24, 3.5, 0.11, RGBColor(0x2B, 0x4B, 0x38), None, 0.5)
    rect(s, cx + 0.22, y + 0.24, 3.5 * value / 100, 0.11, RGBColor(0x8F, 0xE0, 0xB0), None, 0.5)
    add_text(s, cx + 3.82, y + 0.12, 0.7, 0.3, f"{value}%", size=11, bold=True, color=WHITE, font=MONO, align=PP_ALIGN.RIGHT)
add_text(s, cx + 0.22, 4.72, 4.2, 0.3, "1 duplicate frame merged  ·  alert reach 1.2 km", size=7.5, color=PALE, font=MONO)
# bottom flow
flow = card(s, M, 5.7, 12.0, 0.8, MINT2, RGBColor(0xD8, 0xE6, 0xDA), 0.06)
flow_steps = ["Observe", "Match ≤ 35 m", "Deduplicate", "Score", "Publish"]
for index, step in enumerate(flow_steps):
    add_text(s, M + 0.22 + index * 2.38, 5.9, 1.9, 0.26, step, size=10.5, bold=True, color=GREEN_D)
    if index < 4:
        add_text(s, M + 2.05 + index * 2.38, 5.88, 0.3, 0.3, "→", size=11, color=GREEN)
add_text(s, M, 6.62, 12.0, 0.24, "One observation, one vote. Repeated frames never inflate confidence.", size=8.5, color=MUTED)
footer(s, 9, "02 · Crowdsourcing")
notes(s, "Ankit explains duplicate removal and why independent confirmation matters more than a single high score.")

# ------------------------------------------------------------------ slide 10 civic
s = new_slide()
eyebrow(s, "03 · PROTOTYPE EVIDENCE")
heading(s, "The same evidence becomes\na repair programme.", "Municipal teams see a prioritised queue, not a folder of complaints.")
stages = ["Detected", "Reported", "Verified", "Assigned", "Repair in progress", "Repaired", "Independently verified"]
for index, stage in enumerate(stages):
    y = 1.75 + index * 0.6
    active = index in (2, 4, 6)
    fill = GREEN_D if index == 6 else (MINT if active else WHITE)
    card(s, M, y, 4.55, 0.46, fill, RGBColor(0xD8, 0xE6, 0xDA), 0.2)
    dot_color = RGBColor(0x8F, 0xE0, 0xB0) if index == 6 else GREEN
    add_text(s, M + 0.16, y + 0.13, 0.3, 0.2, f"{index + 1}", size=7.5, bold=True, color=WHITE if index == 6 else dot_color, font=MONO)
    add_text(s, M + 0.5, y + 0.12, 3.8, 0.24, stage, size=9.5, bold=True, color=WHITE if index == 6 else (GREEN_D if active else INK2))
    if index < 6:
        add_text(s, M + 0.24, y + 0.44, 0.2, 0.2, "│", size=8, color=RGBColor(0x9A, 0xB8, 0xA5))
# right kpis
kpis = [("30", "hazards in register"), ("24", "verified by consensus"), ("25 hr", "median detection → repair")]
for index, (number, label) in enumerate(kpis):
    x = 5.68 + index * 2.3
    card(s, x, 1.78, 2.15, 1.15, WHITE, LINE)
    add_text(s, x + 0.15, 1.9, 1.85, 0.4, number, size=22, bold=True, color=GREEN_D, font=HEAD)
    add_text(s, x + 0.15, 2.38, 1.85, 0.45, label, size=8, color=MUTED, line_spacing=1.15)
# corridor chart
card(s, 5.68, 3.12, 6.75, 2.55, WHITE, LINE)
add_text(s, 5.86, 3.26, 5.4, 0.2, "HAZARD DENSITY BY CORRIDOR", size=7.5, bold=True, color=GREEN, font=MONO)
corridors = [("Sinhagad Road", 7, 0.93), ("Solapur Road", 5, 0.68), ("Hinjawadi", 5, 0.68), ("Baner–Aundh", 5, 0.68), ("Nagar Road", 4, 0.55)]
for index, (name, count, ratio) in enumerate(corridors):
    y = 3.58 + index * 0.38
    add_text(s, 5.86, y, 1.75, 0.22, name, size=8.3, color=INK2)
    rect(s, 7.55, y + 0.05, 4.1, 0.1, RGBColor(0xED, 0xF0, 0xEA), None, 0.5)
    rect(s, 7.55, y + 0.05, 4.1 * ratio, 0.1, RGBColor(0x4C, 0x86, 0xB8), None, 0.5)
    add_text(s, 11.74, y - 0.01, 0.4, 0.22, str(count), size=8, bold=True, color=GREEN_D, font=MONO, align=PP_ALIGN.RIGHT)
add_text(s, 5.86, 5.35, 6.3, 0.2, "Pilot workspace snapshot · Pune dataset", size=7, color=MUTED, font=MONO)
# bottom outcomes
outcomes = [
    ("Prioritise", "Severity, independent reports and confidence rank the queue."),
    ("Dispatch", "Each case has a zone team, an SLA and an evidence trail."),
    ("Verify", "A passing vehicle closes the case — not a spreadsheet."),
]
for index, (title, body) in enumerate(outcomes):
    x = 5.68 + index * 2.3
    add_text(s, x, 5.92, 2.15, 0.24, title, size=10, bold=True, color=GREEN_D)
    add_text(s, x, 6.2, 2.12, 0.6, body, size=8, color=MUTED, line_spacing=1.2)
footer(s, 10, "03 · Civic intelligence")
notes(s, "Vaishnavi: the civic product is not a map; it is an accountable workflow with SLAs and independent closure.")

# ------------------------------------------------------------------ slide 11 Pune
s = new_slide()
eyebrow(s, "03 · PUNE PILOT")
heading(s, "Start with two corridors.\nProve the loop. Then scale.", "Pune gives us dense, mixed traffic and a municipal repair workflow that needs better data.")
phases = [
    ("PHASE 1 · WEEKS 1–6", "Instrument", ["50 participating vehicles", "Sinhagad Road + Katraj–Kondhwa", "Four-week baseline survey", "Alert precision reviewed weekly"], MINT2),
    ("PHASE 2 · WEEKS 7–16", "Operate", ["500 vehicles across 8 corridors", "Zone-level case queue", "SLA tracking with ward teams", "Independent repair verification"], MINT),
    ("PHASE 3 · MONTHS 5–12", "Scale", ["2,000 vehicles, city-wide", "Road-intelligence API", "Fleet and insurer partnerships", "Marathi + Hindi driver experience"], RGBColor(0xE3, 0xEE, 0xE6)),
]
for index, (phase, title, items, fill) in enumerate(phases):
    x = M + index * 4.03
    card(s, x, 1.88, 3.82, 3.85, fill, RGBColor(0xD8, 0xE6, 0xDA), 0.05)
    add_text(s, x + 0.22, 2.04, 3.3, 0.2, phase, size=7.5, bold=True, color=GREEN, font=MONO)
    add_text(s, x + 0.22, 2.32, 3.3, 0.4, title, size=19, bold=True, color=GREEN_D, font=HEAD)
    line(s, x + 0.22, 2.86, x + 3.55, 2.86, RGBColor(0xC9, 0xDC, 0xCC), 0.7)
    for item_index, item in enumerate(items):
        add_text(s, x + 0.22, 3.02 + item_index * 0.5, 3.4, 0.4, f"·  {item}", size=9, color=INK2, line_spacing=1.15)
design = card(s, M, 5.95, 12.0, 0.78, WHITE, LINE, 0.06)
add_text(s, M + 0.22, 6.08, 2.0, 0.2, "PILOT PRINCIPLES", size=7.5, bold=True, color=GREEN, font=MONO)
for index, text in enumerate(["Privacy-first", "Low-bandwidth", "Human review", "Measure the loop"]):
    pill(s, M + 2.1 + index * 2.35, 6.11, 2.15, 0.38, text, MINT, GREEN, 8.5, RGBColor(0xD8, 0xE6, 0xDA))
add_text(s, M, 6.84, 12.0, 0.2, "All participation and corridor targets are pilot design targets, not existing deployments.", size=7.5, color=MUTED)
footer(s, 11, "03 · Pune pilot")
notes(s, "Vaishnavi: do not claim an existing government partnership. Frame Pune as the proposed pilot with clear phases.")

# ------------------------------------------------------------------ slide 12 evidence
s = new_slide()
eyebrow(s, "03 · PROTOTYPE EVIDENCE")
heading(s, "Inside the working prototype", "Three surfaces, one dataset: the driver, the review desk and the city workspace.")
shots = [
    ("COMMAND CENTRE", "Corridor picture, alerts and priority queue", "app-overview.png"),
    ("VISION LAB", "Synchronized raw and analysed review", "app-vision.png"),
    ("CIVIC INTELLIGENCE", "Verified cases, SLAs and repair evidence", "app-civic.png"),
]
for index, (label, caption, filename) in enumerate(shots):
    x = M + index * 4.02
    add_text(s, x, 1.5, 3.8, 0.2, f"{index + 1:02d}  ·  {label}", size=7.5, bold=True, color=GREEN, font=MONO)
    s.shapes.add_picture(str(ASSETS / filename), Inches(x), Inches(1.78), width=Inches(3.82))
    add_text(s, x, 4.23, 3.82, 0.22, caption, size=8, color=MUTED)
# status matrix
card(s, M, 4.72, 12.0, 1.7, WHITE, LINE, 0.04)
columns = [
    ("WORKING TODAY", GREEN, ["Command centre + live map", "Vision Lab before/after + upload", "Hazard register + report flow", "Civic queue + repair states", "Local workspace persistence"]),
    ("PARTIAL", AMBER, ["FastAPI + PostGIS backend", "Model worker (environment-dependent)", "Crowd verification dataset"]),
    ("NEXT", BLUE, ["Mobile app + on-device inference", "Municipal CMMS integration", "Push alerts + dispatch", "Multilingual driver UI"]),
]
for index, (label, color, items) in enumerate(columns):
    x = M + 0.22 + index * 3.95
    add_text(s, x, 4.84, 3.7, 0.2, label, size=7.5, bold=True, color=color, font=MONO)
    for item_index, item in enumerate(items):
        add_text(s, x, 5.1 + item_index * 0.25, 3.65, 0.24, f"·  {item}", size=7.7, color=INK2)
    if index > 0:
        line(s, x - 0.18, 4.84, x - 0.18, 6.28, LINE, 0.6)
add_text(s, M, 6.58, 12.0, 0.24, "STACK  ·  React 18 · TypeScript · Vite · Leaflet/OSM · FastAPI · PostgreSQL/PostGIS · Supabase · YOLOv8s-road", size=7.2, color=MUTED, font=MONO)
footer(s, 12, "03 · Prototype evidence")
notes(s, "Ankit: the screenshots are the live prototype. Be explicit about what is working, partial and next; do not claim live municipal deployment.")

# ------------------------------------------------------------------ slide 13 business
s = new_slide()
eyebrow(s, "04 · VALIDATION, COMMERCIALISATION & NEXT STEPS")
heading(s, "Three customers, one data network", "Each segment pays for a different slice of the same corridor intelligence.")
segments = [
    ("B2C", "Individual drivers", "Free safety alerts. Premium ₹99/month (proposed) for offline corridors, trip reports and family sharing.", ["Acquire through fleets", "Low-friction onboarding", "Privacy-first defaults"], MINT),
    ("B2B", "Fleets & logistics", "₹150–250 per vehicle per month (proposed) for safety scoring, route intelligence and incident evidence.", ["Cab and delivery fleets", "Driver coaching", "Insurance-ready reports"], RGBColor(0xE9, 0xEF, 0xF5)),
    ("B2G", "Cities & road authorities", "Corridor intelligence subscription for hazard SLAs, repair verification and budget prioritisation.", ["Municipal corporations", "State road authorities", "Zone-level analytics"], RGBColor(0xFA, 0xF0, 0xE2)),
]
for index, (tag, buyer, offer, bullets, fill) in enumerate(segments):
    x = M + index * 4.03
    card(s, x, 1.85, 3.85, 3.6, fill, RGBColor(0xD8, 0xE6, 0xDA), 0.05)
    pill(s, x + 0.2, 2.02, 0.62, 0.28, tag, WHITE, GREEN_D, 8)
    add_text(s, x + 0.2, 2.45, 3.4, 0.26, buyer, size=12.5, bold=True, color=GREEN_D, font=HEAD)
    add_text(s, x + 0.2, 2.82, 3.4, 1.0, offer, size=8.8, color=INK2, line_spacing=1.3)
    for bullet_index, bullet in enumerate(bullets):
        add_text(s, x + 0.2, 4.22 + bullet_index * 0.3, 3.4, 0.24, f"·  {bullet}", size=8, color=MUTED)
model = card(s, M, 5.7, 12.0, 0.88, GREEN_D, None, 0.05)
add_text(s, M + 0.24, 5.84, 11.4, 0.26, "THE COMMERCIAL LOGIC", size=7, bold=True, color=PALE, font=MONO)
add_text(s, M + 0.24, 6.08, 11.4, 0.4, "Fleets create density. Density creates faster verification. Faster verification creates a product cities will pay for.", size=10.5, color=WHITE)
footer(s, 13, "04 · Business model")
notes(s, "Vaishnavi: pricing is a proposal; avoid revenue forecasts and invented market-size numbers.")

# ------------------------------------------------------------------ slide 14 roadmap
s = new_slide()
eyebrow(s, "04 · ROADMAP & SCALABILITY")
heading(s, "From a working prototype to a city-scale network", "One measurable loop at a time.")
# timeline
line(s, M + 0.2, 2.75, W - M - 0.2, 2.75, RGBColor(0xC9, 0xD8, 0xCA), 2)
milestones = [
    ("NOW", "Working prototype", "Vision Lab, hazard register, driver alerts, civic workflow, Pune dataset.", 0.0),
    ("NEXT · 3–6 MONTHS", "Pilot operations", "50 → 500 vehicles, two → eight corridors, ward-team SLAs, live verification.", 0.35),
    ("THEN · 6–12 MONTHS", "City intelligence", "2,000 vehicles, API access, fleet partnerships, repair verification at scale.", 0.7),
]
for index, (tag, title, body, ratio) in enumerate(milestones):
    x = M + ratio * 10.8
    circle = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(2.59), Inches(0.32), Inches(0.32))
    circle.fill.solid(); circle.fill.fore_color.rgb = GREEN if index < 2 else RGBColor(0x8F, 0xB5, 0x9B)
    circle.line.color.rgb = WHITE; circle.line.width = Pt(2); circle.shadow.inherit = False
    add_text(s, x + 0.04, 1.98, 3.0, 0.22, tag, size=7, bold=True, color=GREEN, font=MONO)
    add_text(s, x + 0.04, 2.18, 3.3, 0.26, title, size=11.5, bold=True, color=GREEN_D)
    add_text(s, x + 0.04, 3.08, 3.2, 0.75, body, size=8.5, color=MUTED, line_spacing=1.25)
# success measures
add_text(s, M, 4.22, 6.0, 0.22, "SUCCESS MEASURES FOR THE PILOT", size=7.5, bold=True, color=GREEN, font=MONO)
metrics = [("Alerts delivered", "per active vehicle"), ("Independent confirmations", "per verified hazard"), ("False-alert rate", "reviewed weekly"), ("Repair verification time", "detected → independently verified")]
for index, (title, body) in enumerate(metrics):
    x = M + index * 3.05
    card(s, x, 4.52, 2.85, 0.95, WHITE, LINE, 0.06)
    add_text(s, x + 0.14, 4.64, 2.55, 0.26, title, size=9, bold=True, color=GREEN_D)
    add_text(s, x + 0.14, 4.94, 2.55, 0.4, body, size=7.5, color=MUTED, line_spacing=1.15)
add_text(s, M, 5.72, 12.0, 0.5, "These are targets to validate during the pilot, not results from an existing deployment.", size=8, color=MUTED)
# scale bar
scale = card(s, M, 6.2, 12.0, 0.62, MINT2, RGBColor(0xD8, 0xE6, 0xDA), 0.08)
add_text(s, M + 0.2, 6.34, 3.6, 0.24, "SCALE PRINCIPLE", size=7, bold=True, color=GREEN, font=MONO)
add_text(s, M + 1.65, 6.32, 10.1, 0.3, "Density before geography: deepen one corridor until the data is trusted, then replicate the playbook.", size=9, color=GREEN_D)
footer(s, 14, "04 · Roadmap")
notes(s, "Vaishnavi closes the commercial and scale story with targets, not fabricated traction.")

# ------------------------------------------------------------------ slide 15 closing
s = new_slide(GREEN_D)
s.shapes.add_picture(str(ASSETS / "title-bg.jpg"), 0, 0, width=Inches(W), height=Inches(H))
add_text(s, M, 1.35, 8.0, 0.22, "THE CLOSING VISION", size=8, bold=True, color=PALE, font=MONO)
add_text(s, M, 1.8, 10.8, 1.9, "Every journey contributes\nto safer roads.", size=38, bold=True, color=WHITE, font=HEAD, line_spacing=1.05)
add_text(s, M, 4.0, 10.6, 1.0, "Every vehicle becomes part of India’s\nroad intelligence network.", size=22, color=RGBColor(0xD3, 0xE4, 0xD8), font=HEAD, line_spacing=1.2)
line(s, M, 5.25, 4.5, 5.25, RGBColor(0x6F, 0xAF, 0x8A), 1.2)
add_text(s, M, 5.45, 7.4, 0.4, "EDAS — Making every journey safer and every road smarter.", size=11, bold=True, color=RGBColor(0xF0, 0xD5, 0xA8))
add_text(s, M, 6.28, 8.4, 0.24, "TEAM EDAS  ·  MAHEK SHUKLA  ·  SONAKSHI CHOWGULE  ·  ANKIT RAJ  ·  VAISHNAVI ZAVAR", size=7.5, color=PALE, font=MONO)
add_text(s, W - M - 1.0, 6.28, 1.0, 0.24, "THANK YOU", size=7.5, bold=True, color=WHITE, font=MONO, align=PP_ALIGN.RIGHT)
notes(s, "All four on stage. End on the line, pause, then invite questions.")

# ------------------------------------------------------------------ slide 16 references
s = new_slide()
eyebrow(s, "REFERENCES & EVIDENCE")
heading(s, "References", "Figures used in this deck are sourced; prototype figures are workspace data.")
refs = [
    "Ministry of Road Transport & Highways, Road Accidents in India 2024 — total accidents and fatalities.",
    "Lok Sabha Unstarred Question No. 6401, answered 2 April 2026 — State-wise 2022–2024 accident and fatality data.",
    "Ministry of Road Transport & Highways, Road Accidents in India 2023 — road-feature analysis (curved, potholed and steep-grade roads: 14.47% of accidents).",
    "IEEE Smart City Research & Innovation Ideathon and Workathon 2026 — working prototype presentation template.",
    "Ultralytics, YOLOv8 documentation — model architecture, training and export.",
    "RDD2022 road-damage dataset and the RDD2022 YOLOv8 benchmark checkpoint used as the starting model.",
    "PostGIS documentation — geospatial matching and corridor queries.",
    "Supabase Auth and Storage documentation — authenticated access and private evidence.",
    "OpenStreetMap contributors — base map data and tiles.",
    "Reference before/after survey footage supplied for the EDAS Vision Lab demonstration.",
]
for index, ref in enumerate(refs):
    y = 1.72 + index * 0.42
    add_text(s, M, y, 0.35, 0.22, f"{index + 1:02d}", size=7.5, color=AMBER, font=MONO)
    add_text(s, M + 0.42, y - 0.02, 11.6, 0.38, ref, size=8.5, color=INK2, line_spacing=1.15)
add_text(s, M, 6.28, 12.0, 0.4, "Pilot metrics shown in the workspace are dataset snapshots. No model accuracy, deployment scale or partnership is claimed.", size=7.5, color=MUTED)
footer(s, 16, "References")

# thin IEEE-blue rule across the top of every slide
for slide in prs.slides:
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(W), Inches(0.075))
    bar.fill.solid()
    bar.fill.fore_color.rgb = BLUE
    bar.line.fill.background()
    bar.shadow.inherit = False

prs.save(OUT)
print("saved", OUT, "slides:", len(prs.slides))
