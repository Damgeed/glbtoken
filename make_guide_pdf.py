#!/usr/bin/env python3
"""Generate client-facing PDF: OpenRouter & GlbTOKEN simple guide."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, HRFlowable)

NAVY   = HexColor("#0A0B14")
GOLD   = HexColor("#F4B400")
TEAL   = HexColor("#00D68F")
DARK   = HexColor("#141624")
BORDER = HexColor("#2A2D42")
MUTED  = HexColor("#8A8FA3")
LIGHT  = HexColor("#F5F6FA")

OUT = "/Users/openclaw_007/projects/glbtoken/glbtoken-openrouter-guide.pdf"

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm,
                        topMargin=16*mm, bottomMargin=16*mm,
                        title="AI for Your Business — OpenRouter & GlbTOKEN",
                        author="GlbTOKEN")

def st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10, leading=14, textColor=DARK)
    base.update(kw)
    return ParagraphStyle(name, **base)

H1  = st("H1", fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=NAVY)
H2  = st("H2", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=NAVY, spaceBefore=6, spaceAfter=4)
H3  = st("H3", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=NAVY)
BODY= st("BODY", fontSize=10, leading=15)
BUL = st("BUL", fontSize=10, leading=15, leftIndent=12, bulletIndent=2)
SMALL = st("SMALL", fontSize=8.5, leading=12, textColor=MUTED)
GOLD_T = st("GOLD_T", fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=GOLD)

def card(title, body, accent=GOLD, width=None):
    t = Table([[Paragraph(f"<font color='white'><b>{title}</b></font>", st("ct", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=white)),
                Paragraph(body, st("cb", fontSize=9.5, leading=13.5, textColor=HexColor("#C9CDDB"))) ]],
              colWidths=[42*mm, 108*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("BACKGROUND", (0,0), (0,-1), HexColor("#1B1E31")),
        ("BOX", (0,0), (-1,-1), 0.8, accent),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ("TOPPADDING", (0,0), (-1,-1), 9),
        ("BOTTOMPADDING", (0,0), (-1,-1), 9),
    ]))
    return t

story = []

# ── COVER ──
story.append(Spacer(1, 10*mm))
story.append(Paragraph("AI for Your Business", H1))
story.append(Paragraph("A simple guide to <b>OpenRouter</b> and <b>GlbTOKEN</b>", st("sub", fontSize=13, leading=18, textColor=MUTED)))
story.append(Spacer(1, 4*mm))
story.append(HRFlowable(width="100%", thickness=2, color=GOLD))
story.append(Spacer(1, 8*mm))
story.append(card("🚀 OpenRouter", "The model <b>supermarket</b> — one key to access 400+ AI models from OpenAI, Anthropic, Google, Meta and more.", GOLD))
story.append(Spacer(1, 5*mm))
story.append(card("🏪 GlbTOKEN", "Your <b>local AI shop</b> — buy tokens the easy way, pay with local money or crypto, and use any AI model with one simple API.", TEAL))
story.append(Spacer(1, 8*mm))
story.append(Paragraph("Think of it like this:", H3))
story.append(Paragraph("OpenRouter is the <b>wholesale supplier</b>. GlbTOKEN is the <b>convenience store</b> that brings it to you — in your currency, with your payment methods.", BODY))
story.append(Spacer(1, 6*mm))
story.append(Paragraph("Prepared for our partners & clients — July 2026", SMALL))
story.append(PageBreak())

# ── WHO USES OPENROUTER ──
story.append(Paragraph("Who uses OpenRouter — and why", H2))
story.append(Paragraph("OpenRouter is one of the most popular AI gateways in the world. These are real, verifiable examples:", BODY))
story.append(Spacer(1, 4*mm))
story.append(card("💻 1. Popular open-source apps", "Apps like <b>LibreChat</b> (41,000+ GitHub stars), <b>Cline</b>, <b>Continue</b> and <b>Open WebUI</b> build OpenRouter in as a one-click option. Millions of developers use these tools every day — many of their AI calls travel through OpenRouter.", GOLD))
story.append(Spacer(1, 4*mm))
story.append(card("🧑‍💻 2. Independent developers & startups", "Instead of opening accounts at 10 different AI companies, they get <b>one API key</b> that works with 400+ models. One bill, one login, instant access to the latest models.", GOLD))
story.append(Spacer(1, 4*mm))
story.append(card("🔬 3. Researchers & model shoppers", "They compare models side-by-side — quality, speed, price — using the <b>same code</b>, then switch models with a one-line change.", GOLD))
story.append(Spacer(1, 4*mm))
story.append(card("💳 4. Pay-as-you-go users", "No monthly subscription. Load credit, use it, top up when needed. Perfect for projects with unpredictable usage.", GOLD))
story.append(Spacer(1, 4*mm))
story.append(card("🧠 5. Fans of open-source models", "Models like DeepSeek, Llama and Mistral are available instantly — no need to rent your own servers.", GOLD))
story.append(Spacer(1, 5*mm))
story.append(Paragraph("Why they choose it: <b>one key for every model</b> · pay only for what you use · no subscription · works with any OpenAI-compatible code.", BODY))
story.append(PageBreak())

# ── WHO GLBTOKEN IS BUILT FOR ──
story.append(Paragraph("Who GlbTOKEN is built for", H2))
story.append(Paragraph("GlbTOKEN brings the same power closer to you — with payments that actually work in your market.", BODY))
story.append(Spacer(1, 4*mm))
story.append(card("🌍 1. Developers in emerging markets", "No international credit card? No problem. Pay with <b>local currency, mobile money, Paystack or crypto</b> — and start building with AI in minutes.", TEAL))
story.append(Spacer(1, 4*mm))
story.append(card("👥 2. Small AI teams & startups", "One dashboard to manage <b>everyone's usage, budget and API keys</b>. See who spends what, set limits, stay in control.", TEAL))
story.append(Spacer(1, 4*mm))
story.append(card("✍️ 3. Creators, students & power users", "Writers, coders and learners who use AI daily want a <b>simple top-up</b> — not a foreign card requirement.", TEAL))
story.append(Spacer(1, 4*mm))
story.append(card("🏷️ 4. Resellers & entrepreneurs", "Buy tokens wholesale, <b>set your own prices</b>, and sell AI access to your own customers under your own brand.", TEAL))
story.append(Spacer(1, 4*mm))
story.append(card("🔌 5. Anyone with existing AI code", "GlbTOKEN is <b>100% OpenAI-compatible</b>. If your app already talks to OpenAI, it works with GlbTOKEN by changing one URL.", TEAL))
story.append(PageBreak())

# ── WHY GLBTOKEN ──
story.append(Paragraph("Why choose GlbTOKEN", H2))
rows = [
    ["What matters to you", "OpenRouter", "GlbTOKEN"],
    ["International card needed", "Yes", "No — local money, mobile money, crypto"],
    ["One key, many models", "Yes", "Yes"],
    ["OpenAI-compatible", "Yes", "Yes"],
    ["Team budget control", "Limited", "Built-in dashboard"],
    ["Pay in your currency", "No", "Yes"],
    ["Resell & set your own price", "No", "Yes"],
    ["Local support", "No", "Yes"],
]
tbl = Table(rows, colWidths=[62*mm, 42*mm, 46*mm])
tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), NAVY),
    ("TEXTCOLOR", (0,0), (-1,0), white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("FONTNAME", (0,1), (0,-1), "Helvetica-Bold"),
    ("TEXTCOLOR", (0,1), (0,-1), NAVY),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [white, LIGHT]),
    ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ("BACKGROUND", (1,1), (1,-1), HexColor("#FBF3DC")),
    ("BACKGROUND", (2,1), (2,-1), HexColor("#DDF5EC")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("TOPPADDING", (0,0), (-1,-1), 7),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
]))
story.append(tbl)
story.append(Spacer(1, 6*mm))
story.append(Paragraph("How it comes together", H2))
story.append(Paragraph("<b>GlbTOKEN is your front door.</b> Behind it, we connect to the best model suppliers — including OpenRouter — so you always get great models, great prices, and a payment method that works for you.", BODY))
story.append(Spacer(1, 3*mm))
story.append(Paragraph("1️⃣ Sign up at GlbTOKEN → 2️⃣ Top up with your preferred payment → 3️⃣ Use any AI model through one simple, OpenAI-compatible API.", BODY))
story.append(Spacer(1, 8*mm))
story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
story.append(Spacer(1, 3*mm))
story.append(Paragraph("GlbTOKEN — AI access, made local.  ·  Questions? Our team is one message away.", SMALL))

doc.build(story)
print("PDF written:", OUT)
