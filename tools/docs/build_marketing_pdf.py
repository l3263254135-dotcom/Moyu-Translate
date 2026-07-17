#!/usr/bin/env python3
from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output/pdf/Moyu-Translate-Marketing-Guide-zh-CN.pdf"
ICON = ROOT / "Assets/IconSource.png"
FONT_REGULAR = Path("/System/Library/Fonts/STHeiti Light.ttc")
FONT_BOLD = Path("/System/Library/Fonts/STHeiti Medium.ttc")
CHAPTERS = [
    ROOT / "docs/marketing/README.md",
    ROOT / "docs/marketing/01-website-operations.md",
    ROOT / "docs/marketing/02-wechat.md",
    ROOT / "docs/marketing/03-xiaohongshu.md",
    ROOT / "docs/marketing/04-bilibili.md",
    ROOT / "docs/marketing/05-30-day-launch-plan.md",
    ROOT / "docs/marketing/templates.md",
]

ORANGE = colors.HexColor("#DC7623")
INK = colors.HexColor("#24221E")
MUTED = colors.HexColor("#686A66")
LINE = colors.HexColor("#E5E6E1")
PAPER = colors.HexColor("#F8F8F5")


def register_fonts() -> None:
    if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
        raise FileNotFoundError("Required macOS Chinese fonts were not found")
    pdfmetrics.registerFont(TTFont("MoyuSans", str(FONT_REGULAR), subfontIndex=0))
    pdfmetrics.registerFont(TTFont("MoyuSansBold", str(FONT_BOLD), subfontIndex=0))


def inline_markup(text: str) -> str:
    escaped = html.escape(text.strip())
    escaped = re.sub(r"`([^`]+)`", r'<font name="MoyuSans" color="#A95318">\1</font>', escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r'<font name="MoyuSansBold">\1</font>', escaped)

    def link(match: re.Match[str]) -> str:
        label, target = match.group(1), match.group(2)
        if target.startswith(("https://", "http://")):
            return f'<link href="{target}" color="#A95318">{label}</link>'
        return label

    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, escaped)


def build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "CoverTitle", parent=base["Title"], fontName="MoyuSansBold", fontSize=31,
            leading=40, textColor=INK, alignment=TA_LEFT, spaceAfter=7 * mm,
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle", parent=base["BodyText"], fontName="MoyuSans", fontSize=13,
            leading=22, textColor=MUTED, alignment=TA_LEFT,
        ),
        "h1": ParagraphStyle(
            "Heading1", parent=base["Heading1"], fontName="MoyuSansBold", fontSize=24,
            leading=32, textColor=INK, spaceAfter=8 * mm, keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "Heading2", parent=base["Heading2"], fontName="MoyuSansBold", fontSize=15,
            leading=22, textColor=INK, spaceBefore=7 * mm, spaceAfter=3 * mm, keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "Heading3", parent=base["Heading3"], fontName="MoyuSansBold", fontSize=11,
            leading=17, textColor=ORANGE, spaceBefore=5 * mm, spaceAfter=2 * mm, keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["BodyText"], fontName="MoyuSans", fontSize=9.4,
            leading=16.5, textColor=INK, spaceAfter=2.5 * mm, wordWrap="CJK",
        ),
        "bullet": ParagraphStyle(
            "Bullet", parent=base["BodyText"], fontName="MoyuSans", fontSize=9.2,
            leading=16, leftIndent=6 * mm, firstLineIndent=-4 * mm, textColor=INK,
            spaceAfter=1.4 * mm, bulletIndent=1 * mm, wordWrap="CJK",
        ),
        "number": ParagraphStyle(
            "Number", parent=base["BodyText"], fontName="MoyuSans", fontSize=9.2,
            leading=16, leftIndent=8 * mm, firstLineIndent=-6 * mm, textColor=INK,
            spaceAfter=1.4 * mm, wordWrap="CJK",
        ),
        "code": ParagraphStyle(
            "Code", parent=base["Code"], fontName="MoyuSans", fontSize=8.4,
            leading=14, leftIndent=5 * mm, rightIndent=5 * mm, borderColor=LINE,
            borderWidth=0.5, borderPadding=4 * mm, backColor=PAPER, textColor=INK,
            spaceBefore=2 * mm, spaceAfter=3 * mm, wordWrap="CJK",
        ),
    }


def chapter_story(path: Path, styles: dict[str, ParagraphStyle]) -> list:
    lines = path.read_text(encoding="utf-8").splitlines()
    story: list = []
    paragraph: list[str] = []
    in_code = False
    code_lines: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            story.append(Paragraph(inline_markup(" ".join(paragraph)), styles["body"]))
            paragraph.clear()

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            flush_paragraph()
            if in_code:
                story.append(Paragraph("<br/>".join(html.escape(item) for item in code_lines), styles["code"]))
                code_lines.clear()
            in_code = not in_code
            continue
        if in_code:
            code_lines.append(line)
            continue
        if not stripped:
            flush_paragraph()
            continue
        heading = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            story.append(Paragraph(inline_markup(heading.group(2)), styles[f"h{level}"]))
            continue
        bullet = re.match(r"^-\s+(?:\[([ xX])\]\s+)?(.+)$", stripped)
        if bullet:
            flush_paragraph()
            mark = "[x]" if bullet.group(1) and bullet.group(1).lower() == "x" else "-"
            story.append(Paragraph(inline_markup(bullet.group(2)), styles["bullet"], bulletText=mark))
            continue
        numbered = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if numbered:
            flush_paragraph()
            story.append(Paragraph(inline_markup(numbered.group(2)), styles["number"], bulletText=numbered.group(1) + "."))
            continue
        paragraph.append(stripped.rstrip("  "))
    flush_paragraph()
    if code_lines:
        story.append(Paragraph("<br/>".join(html.escape(item) for item in code_lines), styles["code"]))
    return story


def decorate_page(canvas, doc) -> None:
    canvas.saveState()
    page_width, page_height = A4
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, page_height - 15 * mm, page_width - doc.rightMargin, page_height - 15 * mm)
    canvas.setFont("MoyuSansBold", 7.5)
    canvas.setFillColor(ORANGE)
    canvas.drawString(doc.leftMargin, page_height - 11.5 * mm, "Moyu Translate")
    canvas.setFont("MoyuSans", 7)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(page_width - doc.rightMargin, 10 * mm, f"{doc.page}")
    canvas.restoreState()


def build_pdf() -> Path:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()
    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=22 * mm, bottomMargin=18 * mm, title="Moyu Translate 宣传运营手册",
        author="Moyu Translate",
    )
    story: list = [Spacer(1, 28 * mm)]
    if ICON.exists():
        story.extend([Image(str(ICON), width=31 * mm, height=31 * mm), Spacer(1, 12 * mm)])
    story.extend([
        Paragraph("Moyu Translate<br/><font color=\"#DC7623\">宣传运营手册</font>", styles["cover_title"]),
        Paragraph("官网、微信公众号、小红书、B 站与 30 天启动计划<br/>零基础执行版", styles["cover_subtitle"]),
        Spacer(1, 16 * mm),
        Paragraph("适用版本：v0.2.0-beta 及后续版本", styles["body"]),
        Paragraph("流程核对日期：2026 年 7 月（建议每季度复核）", styles["body"]),
        Paragraph("项目地址：https://github.com/l3263254135-dotcom/Moyu-Translate", styles["body"]),
        PageBreak(),
    ])
    for index, chapter in enumerate(CHAPTERS):
        if index > 0:
            story.append(PageBreak())
        story.extend(chapter_story(chapter, styles))
    doc.build(story, onFirstPage=decorate_page, onLaterPages=decorate_page)
    return OUTPUT


if __name__ == "__main__":
    print(build_pdf())
