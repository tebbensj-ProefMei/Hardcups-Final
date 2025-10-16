# Business Pro Forma PDF (with watermark)
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from datetime import datetime
import random, os
from pathlib import Path
import tempfile

OUTPUT_DIR_ENV = "INVOICE_OUTPUT_DIR"

from path_utils import ensure_output_dir

from path_utils import ensure_output_dir

PRIMARY = colors.HexColor("#002b5b")
LIGHT_BG = colors.HexColor("#f7f9fc")
TEXT = colors.black

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "frontend", "logo.jpeg")

def _company_info_paragraph(styles):
    return Paragraph("""<b>ProefMei B.V.</b><br/>
Lombardenstraat 19<br/>
4611 PJ Bergen op Zoom<br/>
KVK: 12345678<br/>
BTW: NL001234567B01<br/>
IBAN: NL00BANK0123456789""", styles["Normal"])

def _header(story, title_text, print_date, styles):
    if os.path.exists(LOGO_PATH):
        logo_flow = Image(LOGO_PATH)
        logo_flow._restrictSize(60 * mm, 25 * mm)
    else:
        logo_flow = Paragraph("", styles["Normal"])
    head_table = Table([[logo_flow, _company_info_paragraph(styles)]], colWidths=[60*mm, 110*mm])
    head_table.setStyle(TableStyle([("ALIGN", (1,0), (1,0), "RIGHT"), ("VALIGN", (0,0), (-1,-1), "MIDDLE")]))
    story.append(head_table)
    story.append(Spacer(1, 10))

    title_style = ParagraphStyle("title", parent=styles["Heading1"], textColor=PRIMARY)
    story.append(Paragraph(title_text, title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"Datum afdrukken: {print_date}", styles["Normal"]))
    story.append(Spacer(1, 10))

def _two_col_details(story, customer, invoice_no, print_date, invoice_type, styles):
    left = [
        ["<b>Klantgegevens</b>", ""],
        ["Naam:", customer.name or "-"],
        ["Adres:", customer.address or "-"],
        ["E-mail:", customer.email or "-"],
        ["Klantnummer:", customer.number or "-"],
    ]
    right = [
        ["<b>Factuurgegevens</b>", ""],
        ["Type:", invoice_type],
        ["Factuurnummer:", invoice_no],
        ["Afdrukdatum:", print_date],
        ["Status:", "Pro forma"],
    ]
    lt = Table(left, colWidths=[30*mm, 60*mm])
    rt = Table(right, colWidths=[30*mm, 60*mm])
    for t in (lt, rt):
        t.setStyle(TableStyle([
            ("BOX", (0,0), (-1,-1), 0.25, colors.HexColor("#dde6ef")),
            ("BACKGROUND", (0,0), (-1,0), LIGHT_BG),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("INNERGRID", (0,0), (-1,-1), 0.25, colors.HexColor("#e5edf6")),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ]))
    container = Table([[lt, rt]], colWidths=[95*mm, 95*mm])
    story.append(container)
    story.append(Spacer(1, 10))

def _transactions_table(transactions):
    data = [["Datum/Tijd","Product","Type","Aantal"]]
    key_to_name = {"hardcups":"Hardcups","champagne":"Champagne Hardcups","cocktail":"Cocktail Hardcups"}
    total_issue={"hardcups":0,"champagne":0,"cocktail":0}
    total_return={"hardcups":0,"champagne":0,"cocktail":0}
    for t in transactions:
        data.append([
            t.created_at.strftime("%d-%m-%Y %H:%M"),
            key_to_name.get(t.product_key, t.product_key),
            "Uitgifte" if t.tx_type=="issue" else "Inname",
            t.amount
        ])
        if t.tx_type=="issue": total_issue[t.product_key]+=t.amount
        else: total_return[t.product_key]+=t.amount
    table = Table(data, colWidths=[55*mm, 60*mm, 30*mm, 20*mm])
    style=[
        ("BACKGROUND",(0,0),(-1,0),PRIMARY),
        ("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
        ("ALIGN",(-1,1),(-1,-1),"RIGHT"),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("INNERGRID",(0,0),(-1,-1),0.25,colors.HexColor("#e0e6ee")),
        ("BOX",(0,0),(-1,-1),0.5,colors.HexColor("#c9d2de")),
    ]
    for row in range(1,len(data)):
        if row%2==0: style.append(("BACKGROUND",(0,row),(-1,row),colors.whitesmoke))
    table.setStyle(TableStyle(style))
    return table, total_issue, total_return

def _totals_block(total_issue,total_return, styles):
    small_bold_blue = ParagraphStyle("sbb", parent=styles["BodyText"], fontSize=10, textColor=PRIMARY)
    def line(label,d):
        return Paragraph(f"<b>{label}</b>: Hardcups {d['hardcups']} • Champagne {d['champagne']} • Cocktail {d['cocktail']}", small_bold_blue)
    net={k:total_issue[k]-total_return[k] for k in total_issue.keys()}
    rows=[[line("Totaal Uitgifte", total_issue)],[line("Totaal Inname", total_return)],[line("Netto (Uitgifte - Inname)", net)]]
    t=Table(rows,colWidths=[190*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),LIGHT_BG),
        ("BOX",(0,0),(-1,-1),0.25,colors.HexColor("#dde6ef")),
        ("LEFTPADDING",(0,0),(-1,-1),6),
        ("RIGHTPADDING",(0,0),(-1,-1),6),
        ("TOPPADDING",(0,0),(-1,-1),6),
        ("BOTTOMPADDING",(0,0),(-1,-1),6),
    ]))
    return t

def _footer(canvas, doc):
    page_num=canvas.getPageNumber()
    canvas.setFont("Helvetica",9)
    canvas.drawRightString(200*mm, 10*mm, f"Pagina {page_num}")
    canvas.setFont("Helvetica-Oblique",8)
    canvas.setFillColor(colors.HexColor("#555555"))
    canvas.drawString(18*mm,10*mm,"Dit is een pro forma factuur, niet geldig voor fiscale doeleinden.  •  Support: tebbensj@icloud.com")

def _watermark(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 60)
    canvas.setFillColorRGB(0.9,0.9,0.9)
    canvas.translate(300, 400)
    canvas.rotate(45)
    canvas.drawCentredString(0, 0, "PRO FORMA")
    canvas.restoreState()
    _footer(canvas, doc)

def _resolve_output_dir():
    configured = os.getenv(OUTPUT_DIR_ENV)
    if configured:
        base = Path(configured)
    else:
        base = Path(tempfile.gettempdir()) / "hardcups_invoices"
    base.mkdir(parents=True, exist_ok=True)
    return base


def build_invoice_pdf(customer, transactions, invoice_type="Afrekening", target_date=None):
    styles = getSampleStyleSheet()
    inv_no=f"{datetime.now().strftime('%Y%m')}-{customer.number}-{random.randint(1000,9999)}"
    title=f"ProefMei — Pro Forma Factuur ({invoice_type})"
    print_date=(target_date.strftime('%d-%m-%Y') if target_date else datetime.now().strftime('%d-%m-%Y'))
    output_dir = ensure_output_dir()
    filename = output_dir / f"ProForma_{customer.number}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    doc=SimpleDocTemplate(str(filename),pagesize=A4,leftMargin=18*mm,rightMargin=18*mm,topMargin=16*mm,bottomMargin=16*mm)

    story=[]
    logo_note = "Zorg dat frontend/logo.jpeg bestaat voor een logo bovenaan."
    _header(story, title, print_date, styles)
    _two_col_details(story, customer, inv_no, print_date, invoice_type, styles)

    tx_table,total_issue,total_return=_transactions_table(transactions)
    story.append(tx_table); story.append(Spacer(1,8))
    story.append(_totals_block(total_issue,total_return, styles))
    story.append(Spacer(1,14))

    small=ParagraphStyle("small", parent=styles["BodyText"], fontSize=10)
    story.append(Paragraph("<b>Handtekening klant:</b> ________________________________", small))
    story.append(Spacer(1,8))
    story.append(Paragraph("<b>Handtekening medewerker:</b> _________________________", small))

    doc.build(story, onFirstPage=_watermark, onLaterPages=_watermark)
    return filename
