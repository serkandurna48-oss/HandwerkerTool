from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import date, datetime
from decimal import Decimal
import uuid
from openai import OpenAI
import json
from fastapi.responses import Response
from fastapi.responses import HTMLResponse
from datetime import datetime
from fastapi import HTTPException
import os
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
app = FastAPI(title="Handwerker-Angebots-Tool API", version="0.1.0")

# CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://handwerker-tool-ten.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# In-memory storage for MVP start
# Later replace with PostgreSQL / Supabase
# -------------------------------------------------------------------
customers_db = {}
offers_db = {}


# -------------------------------------------------------------------
# Models
# -------------------------------------------------------------------
class CustomerCreate(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=100)
    street: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    object_address: Optional[str] = None
    notes: Optional[str] = None


class Customer(CustomerCreate):
    id: str
    created_at: datetime


class OfferItem(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    quantity: Decimal = Field(..., gt=0)
    unit: str = Field(..., min_length=1, max_length=20)
    unit_price_net: Decimal = Field(..., ge=0)


class OfferCreate(BaseModel):
    customer_id: str
    title: str = Field(..., min_length=2, max_length=200)
    intro_text: Optional[str] = Field(None, max_length=2000)
    items: List[OfferItem]
    valid_until: Optional[date] = None
    vat_rate: Decimal = Field(default=Decimal("19.00"), ge=0)
    notes: Optional[str] = Field(None, max_length=2000)


class OfferTotals(BaseModel):
    subtotal_net: Decimal
    vat_amount: Decimal
    total_gross: Decimal


class Offer(OfferCreate):
    id: str
    offer_number: str
    created_at: datetime
    totals: OfferTotals


class AIRequest(BaseModel):
    trade: str = Field(..., min_length=2, max_length=100)
    notes: str = Field(..., min_length=5, max_length=4000)


class AIItemSuggestion(BaseModel):
    title: str
    description: str
    quantity: Decimal
    unit: str


class AIResponse(BaseModel):
    title: str
    intro_text: str
    items: List[AIItemSuggestion]


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
def calculate_totals(items: List[OfferItem], vat_rate: Decimal) -> OfferTotals:
    subtotal = sum((item.quantity * item.unit_price_net for item in items), Decimal("0.00"))
    vat_amount = (subtotal * vat_rate) / Decimal("100.00")
    total_gross = subtotal + vat_amount

    return OfferTotals(
        subtotal_net=subtotal.quantize(Decimal("0.01")),
        vat_amount=vat_amount.quantize(Decimal("0.01")),
        total_gross=total_gross.quantize(Decimal("0.01")),
    )


def generate_offer_number() -> str:
    year = datetime.now().year
    return f"ANG-{year}-{str(uuid.uuid4())[:8].upper()}"


# -------------------------------------------------------------------
# Health / Root
# -------------------------------------------------------------------
@app.get("/")
def root():
    return {"message": "Handwerker-Angebots-Tool API läuft."}


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# -------------------------------------------------------------------
# Customers
# -------------------------------------------------------------------
@app.post("/customers", response_model=Customer)
def create_customer(payload: CustomerCreate):
    customer_id = str(uuid.uuid4())
    customer = Customer(
        id=customer_id,
        created_at=datetime.utcnow(),
        **payload.model_dump(),
    )
    customers_db[customer_id] = customer
    return customer


@app.get("/customers", response_model=List[Customer])
def list_customers():
    return list(customers_db.values())


@app.get("/customers/{customer_id}", response_model=Customer)
def get_customer(customer_id: str):
    customer = customers_db.get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    return customer


# -------------------------------------------------------------------
# Offers
# -------------------------------------------------------------------
@app.post("/offers", response_model=Offer)
def create_offer(payload: OfferCreate):
    if payload.customer_id not in customers_db:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")

    offer_id = str(uuid.uuid4())
    totals = calculate_totals(payload.items, payload.vat_rate)

    offer = Offer(
        id=offer_id,
        offer_number=generate_offer_number(),
        created_at=datetime.utcnow(),
        totals=totals,
        **payload.model_dump(),
    )
    offers_db[offer_id] = offer
    return offer


@app.get("/offers", response_model=List[Offer])
def list_offers():
    return list(offers_db.values())


@app.get("/offers/{offer_id}", response_model=Offer)
def get_offer(offer_id: str):
    offer = offers_db.get(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")
    return offer


# -------------------------------------------------------------------
# AI endpoint (mock version)
# Replace later with Claude/OpenAI API call
# -------------------------------------------------------------------
@app.post("/ai/structure-offer")
def structure_offer(payload: AIRequest):
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Du bist ein Experte für deutsche Handwerksangebote. "
                        "Antworte ausschließlich mit gültigem JSON."
                    ),
                },
                {
                    "role": "user",
                    "content": f"""
Branche: {payload.trade}
Notizen: {payload.notes}

Gib ausschließlich JSON zurück im Format:

{{
  "title": "...",
  "intro_text": "...",
  "items": [
    {{
      "title": "...",
      "description": "...",
      "quantity": 1,
      "unit": "Pauschale"
    }}
  ]
}}
""",
                },
            ],
            temperature=0.2,
        )

        content = response.choices[0].message.content or ""
        print("RAW AI RESPONSE:", content)

        start = content.find("{")
        end = content.rfind("}") + 1

        if start == -1 or end == 0:
            raise ValueError("Kein JSON in KI-Antwort gefunden")

        json_str = content[start:end]
        data = json.loads(json_str)

        return data

    except Exception as e:
        print("KI ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=f"KI Verarbeitung fehlgeschlagen: {repr(e)}")

# -------------------------------------------------------------------
# PDF placeholder endpoint
# -------------------------------------------------------------------
@app.get("/offers/{offer_id}/pdf")
def generate_offer_pdf(offer_id: str):
    offer = offers_db.get(offer_id)

    if not offer:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 50
    today = datetime.now().strftime("%d.%m.%Y")

    # Kopf
    p.setFont("Helvetica-Bold", 16)
    p.drawString(50, y, "Angebot")
    y -= 25

    p.setFont("Helvetica", 11)
    p.drawString(50, y, f"Angebotsnummer: {offer.offer_number}")
    p.drawString(350, y, f"Datum: {today}")
    y -= 30

    # Titel
    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, y, offer.title)
    y -= 25

    # Einleitung
    p.setFont("Helvetica", 10)
    intro_lines = (offer.intro_text or "").split("\n")
    for line in intro_lines:
        p.drawString(50, y, line[:100])
        y -= 14

    y -= 10

    # Tabelle Header
    p.setFont("Helvetica-Bold", 10)
    p.drawString(50, y, "Pos.")
    p.drawString(85, y, "Leistung")
    p.drawString(320, y, "Menge")
    p.drawString(380, y, "Einheit")
    p.drawString(450, y, "Preis")
    p.drawString(515, y, "Gesamt")
    y -= 15

    p.line(50, y, 560, y)
    y -= 20

    # Positionen
    p.setFont("Helvetica", 9)
    for i, item in enumerate(offer.items, start=1):
        total = item.quantity * item.unit_price_net

        if y < 120:
            p.showPage()
            y = height - 50
            p.setFont("Helvetica", 9)

        p.drawString(50, y, str(i))
        p.drawString(85, y, item.title[:35])
        p.drawString(320, y, str(item.quantity))
        p.drawString(380, y, item.unit[:10])
        p.drawRightString(500, y, f"{item.unit_price_net:.2f} €")
        p.drawRightString(560, y, f"{total:.2f} €")
        y -= 14

        if item.description:
            p.setFont("Helvetica", 8)
            p.drawString(85, y, item.description[:80])
            y -= 12
            p.setFont("Helvetica", 9)

        y -= 4

    y -= 10
    p.line(350, y, 560, y)
    y -= 18

    # Summen
    p.setFont("Helvetica", 10)
    p.drawString(380, y, "Netto:")
    p.drawRightString(560, y, f"{offer.totals.subtotal_net:.2f} €")
    y -= 16

    p.drawString(380, y, f"MwSt. ({offer.vat_rate:.0f}%):")
    p.drawRightString(560, y, f"{offer.totals.vat_amount:.2f} €")
    y -= 16

    p.setFont("Helvetica-Bold", 11)
    p.drawString(380, y, "Gesamt:")
    p.drawRightString(560, y, f"{offer.totals.total_gross:.2f} €")
    y -= 30

    p.setFont("Helvetica", 10)
    p.drawString(50, y, "Vielen Dank für Ihre Anfrage.")
    y -= 16
    p.drawString(50, y, "Mit freundlichen Grüßen")
    y -= 16
    p.drawString(50, y, "Enis Durna")

    p.showPage()
    p.save()

    pdf_data = buffer.getvalue()
    buffer.close()

    return Response(
        content=pdf_data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{offer.offer_number}.pdf"'
        },
    )

# -------------------------------------------------------------------
# HTML Response placeholder endpoint
# -------------------------------------------------------------------

@app.get("/offers/{offer_id}/html", response_class=HTMLResponse)
def get_offer_html(offer_id: str):
    offer = offers_db.get(offer_id)

    if not offer:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    today = datetime.now().strftime("%d.%m.%Y")

    rows = ""
    for i, item in enumerate(offer.items, start=1):
        total = item.quantity * item.unit_price_net
        rows += f"""
        <tr>
            <td>{i}</td>
            <td>
                <strong>{item.title}</strong><br>
                <span class="desc">{item.description or ""}</span>
            </td>
            <td>{item.quantity}</td>
            <td>{item.unit}</td>
            <td class="right">{item.unit_price_net:.2f} €</td>
            <td class="right">{total:.2f} €</td>
        </tr>
        """

    html = f"""
    <html>
    <head>
        <meta charset="utf-8">
        <title>{offer.title}</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
                color: #111;
                max-width: 900px;
                margin: auto;
                padding: 40px;
                background: #fff;
            }}

            .header {{
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 40px;
            }}

            .company {{
                font-size: 14px;
                line-height: 1.6;
                color: #333;
            }}

            .meta {{
                text-align: right;
                font-size: 14px;
                line-height: 1.6;
                color: #333;
            }}

            h1 {{
                font-size: 28px;
                margin: 0 0 12px 0;
                color: #111;
            }}

            .intro {{
                font-size: 15px;
                line-height: 1.7;
                color: #333;
                margin-bottom: 28px;
            }}

            table {{
                width: 100%;
                border-collapse: collapse;
                margin-top: 18px;
            }}

            th {{
                text-align: left;
                font-size: 13px;
                padding: 12px 8px;
                border-bottom: 2px solid #111;
                color: #111;
            }}

            td {{
                font-size: 13px;
                padding: 12px 8px;
                border-bottom: 1px solid #ddd;
                vertical-align: top;
                color: #222;
            }}

            .desc {{
                display: inline-block;
                margin-top: 4px;
                color: #666;
                font-size: 12px;
                line-height: 1.5;
            }}

            .right {{
                text-align: right;
                white-space: nowrap;
            }}

            .totals {{
                width: 320px;
                margin-left: auto;
                margin-top: 28px;
            }}

            .totals-row {{
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                font-size: 14px;
            }}

            .totals-final {{
                display: flex;
                justify-content: space-between;
                padding-top: 10px;
                margin-top: 10px;
                border-top: 2px solid #111;
                font-size: 16px;
                font-weight: bold;
            }}

            .footer {{
                margin-top: 50px;
                font-size: 14px;
                line-height: 1.7;
                color: #333;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <div class="company">
                <strong>Dein Betrieb</strong><br>
                Musterstraße 1<br>
                12345 Musterstadt
            </div>

            <div class="meta">
                <strong>Angebot</strong><br>
                Nr.: {offer.offer_number}<br>
                Datum: {today}
            </div>
        </div>

        <h1>{offer.title}</h1>
        <div class="intro">{offer.intro_text or ""}</div>

        <table>
            <thead>
                <tr>
                    <th style="width: 48px;">#</th>
                    <th>Leistung</th>
                    <th style="width: 80px;">Menge</th>
                    <th style="width: 90px;">Einheit</th>
                    <th class="right" style="width: 120px;">Preis</th>
                    <th class="right" style="width: 120px;">Gesamt</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>

        <div class="totals">
            <div class="totals-row">
                <span>Netto</span>
                <span>{offer.totals.subtotal_net:.2f} €</span>
            </div>
            <div class="totals-row">
                <span>MwSt. ({offer.vat_rate:.0f}%)</span>
                <span>{offer.totals.vat_amount:.2f} €</span>
            </div>
            <div class="totals-final">
                <span>Gesamt</span>
                <span>{offer.totals.total_gross:.2f} €</span>
            </div>
        </div>

        <div class="footer">
            Vielen Dank für Ihre Anfrage.<br><br>
            Mit freundlichen Grüßen<br>
            Dein Betrieb
        </div>
    </body>
    </html>
    """

    return html
# -------------------------------------------------------------------
# Run locally:
# uvicorn main:app --reload
# -------------------------------------------------------------------