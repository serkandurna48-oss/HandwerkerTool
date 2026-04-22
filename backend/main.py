from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from typing import List, Literal, Optional
from datetime import date, datetime
from decimal import Decimal
import uuid
from openai import OpenAI
import json
import csv
import html as html_module
from fastapi.responses import Response
from fastapi.responses import HTMLResponse
from datetime import datetime
from fastapi import HTTPException
import os
from dotenv import load_dotenv
from io import BytesIO, StringIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import psycopg2
from psycopg2.pool import SimpleConnectionPool
from psycopg2.extras import RealDictCursor, Json
from contextlib import contextmanager

load_dotenv(override=True)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
app = FastAPI(title="Handwerker-Angebots-Tool API", version="0.1.0")

# -------------------------------------------------------------------
# Betriebsdaten – aus .env, mit Fallback-Defaults
# -------------------------------------------------------------------
COMPANY_NAME     = os.getenv("COMPANY_NAME",     "Ihr Betrieb")
COMPANY_STREET   = os.getenv("COMPANY_STREET",   "Musterstraße 1")
COMPANY_ZIP_CITY = os.getenv("COMPANY_ZIP_CITY", "12345 Musterstadt")
COMPANY_PHONE    = os.getenv("COMPANY_PHONE",    "")
COMPANY_EMAIL    = os.getenv("COMPANY_EMAIL",    "")
DEFAULT_VAT_RATE = Decimal("19.00")

# CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# Database – PostgreSQL via Supabase
# -------------------------------------------------------------------
_pool: SimpleConnectionPool = None


def get_pool() -> SimpleConnectionPool:
    global _pool
    if _pool is None:
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            raise RuntimeError("DATABASE_URL nicht in .env gesetzt")
        _pool = SimpleConnectionPool(1, 10, dsn=db_url)
    return _pool


@contextmanager
def get_conn():
    pool = get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


@app.on_event("startup")
def create_tables():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS customers (
                    id          TEXT PRIMARY KEY,
                    company_name TEXT NOT NULL,
                    contact_person TEXT,
                    street      TEXT,
                    zip_code    TEXT,
                    city        TEXT,
                    email       TEXT,
                    phone       TEXT,
                    object_address TEXT,
                    notes       TEXT,
                    created_at  TIMESTAMP NOT NULL
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS offers (
                    id           TEXT PRIMARY KEY,
                    customer_id  TEXT NOT NULL REFERENCES customers(id),
                    offer_number TEXT NOT NULL,
                    title        TEXT NOT NULL,
                    intro_text   TEXT,
                    items_json   JSONB NOT NULL,
                    valid_until  DATE,
                    vat_rate     NUMERIC(5,2) NOT NULL,
                    notes        TEXT,
                    subtotal_net  NUMERIC(12,2) NOT NULL,
                    vat_amount    NUMERIC(12,2) NOT NULL,
                    total_gross   NUMERIC(12,2) NOT NULL,
                    status       TEXT NOT NULL DEFAULT 'draft',
                    created_at   TIMESTAMP NOT NULL
                );
            """)


# -------------------------------------------------------------------
# DB row → Pydantic helpers
# -------------------------------------------------------------------
def row_to_customer(row) -> "Customer":
    return Customer(
        id=row["id"],
        company_name=row["company_name"],
        contact_person=row["contact_person"],
        street=row["street"],
        zip_code=row["zip_code"],
        city=row["city"],
        email=row["email"],
        phone=row["phone"],
        object_address=row["object_address"],
        notes=row["notes"],
        created_at=row["created_at"],
    )


def row_to_offer(row) -> "Offer":
    items_data = row["items_json"]
    if isinstance(items_data, str):
        items_data = json.loads(items_data)
    items = [OfferItem(**item) for item in items_data]
    totals = OfferTotals(
        subtotal_net=Decimal(str(row["subtotal_net"])),
        vat_amount=Decimal(str(row["vat_amount"])),
        total_gross=Decimal(str(row["total_gross"])),
    )
    return Offer(
        id=row["id"],
        customer_id=row["customer_id"],
        offer_number=row["offer_number"],
        title=row["title"],
        intro_text=row["intro_text"],
        items=items,
        valid_until=row["valid_until"],
        vat_rate=Decimal(str(row["vat_rate"])),
        notes=row["notes"],
        created_at=row["created_at"],
        status=row["status"],
        totals=totals,
    )


# -------------------------------------------------------------------
# Models
# -------------------------------------------------------------------
class CustomerCreate(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=200, description="Firmenname oder Privatname")
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
    vat_rate: Decimal = Field(default=DEFAULT_VAT_RATE, ge=0)
    notes: Optional[str] = Field(None, max_length=2000)


class OfferTotals(BaseModel):
    subtotal_net: Decimal
    vat_amount: Decimal
    total_gross: Decimal


class Offer(OfferCreate):
    id: str
    offer_number: str
    created_at: datetime
    status: Literal["draft", "approved"] = "draft"
    totals: OfferTotals
    customer_name: Optional[str] = None


class OfferUpdate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    intro_text: Optional[str] = Field(None, max_length=2000)
    items: List[OfferItem]
    valid_until: Optional[date] = None
    vat_rate: Decimal = Field(default=DEFAULT_VAT_RATE, ge=0)
    notes: Optional[str] = Field(None, max_length=2000)


class AIRequest(BaseModel):
    trade: str = Field(..., min_length=2, max_length=100)
    # Hinweis: notes soll nur Leistungsbeschreibungen enthalten,
    # keine Kundennamen, Adressen oder sonstigen personenbezogenen Daten.
    # Diese Daten werden an die OpenAI API übermittelt.
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
    created_at = datetime.utcnow()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO customers
                    (id, company_name, contact_person, street, zip_code, city,
                     email, phone, object_address, notes, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    customer_id, payload.company_name, payload.contact_person,
                    payload.street, payload.zip_code, payload.city,
                    payload.email, payload.phone, payload.object_address,
                    payload.notes, created_at,
                ),
            )
    return Customer(id=customer_id, created_at=created_at, **payload.model_dump())


@app.get("/customers", response_model=List[Customer])
def list_customers():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM customers ORDER BY created_at DESC")
            rows = cur.fetchall()
    return [row_to_customer(r) for r in rows]


@app.post("/customers/import")
async def import_customers(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")   # utf-8-sig entfernt Excel-BOM automatisch
    except UnicodeDecodeError:
        text = raw.decode("latin-1")     # Fallback für ältere Windows-Exporte

    reader = csv.DictReader(StringIO(text))
    created_at = datetime.utcnow()
    skipped = 0
    rows_to_insert: list = []

    for row in reader:
        company_name = (row.get("company_name") or "").strip()
        if len(company_name) < 2:
            skipped += 1
            continue

        phone = (row.get("phone") or "").strip() or None
        email = (row.get("email") or "").strip() or None
        if email and "@" not in email:
            email = None   # malformierte E-Mail stillschweigend ignorieren

        rows_to_insert.append((
            str(uuid.uuid4()), company_name,
            None, None, None, None,   # contact_person, street, zip_code, city
            email, phone,
            None, None,               # object_address, notes
            created_at,
        ))

    if rows_to_insert:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO customers
                        (id, company_name, contact_person, street, zip_code, city,
                         email, phone, object_address, notes, created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    rows_to_insert,
                )

    return {"imported": len(rows_to_insert), "skipped": skipped}


@app.get("/customers/{customer_id}", response_model=Customer)
def get_customer(customer_id: str):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM customers WHERE id = %s", (customer_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    return row_to_customer(row)


# -------------------------------------------------------------------
# Offers
# -------------------------------------------------------------------
def _get_offer_from_db(offer_id: str) -> "Offer":
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM offers WHERE id = %s", (offer_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")
    return row_to_offer(row)


@app.post("/offers", response_model=Offer)
def create_offer(payload: OfferCreate):
    # Prüfe ob Kunde existiert
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM customers WHERE id = %s", (payload.customer_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Kunde nicht gefunden")

    offer_id = str(uuid.uuid4())
    offer_number = generate_offer_number()
    created_at = datetime.utcnow()
    totals = calculate_totals(payload.items, payload.vat_rate)
    items_serializable = json.loads(payload.model_dump_json())["items"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO offers
                    (id, customer_id, offer_number, title, intro_text, items_json,
                     valid_until, vat_rate, notes, subtotal_net, vat_amount,
                     total_gross, status, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    offer_id, payload.customer_id, offer_number, payload.title,
                    payload.intro_text, Json(items_serializable),
                    payload.valid_until, payload.vat_rate, payload.notes,
                    totals.subtotal_net, totals.vat_amount, totals.total_gross,
                    "draft", created_at,
                ),
            )

    return Offer(
        id=offer_id,
        offer_number=offer_number,
        created_at=created_at,
        status="draft",
        totals=totals,
        **payload.model_dump(),
    )


@app.get("/offers", response_model=List[Offer])
def list_offers():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT o.*, c.company_name AS customer_name
                FROM offers o
                LEFT JOIN customers c ON c.id = o.customer_id
                ORDER BY o.created_at DESC
            """)
            rows = cur.fetchall()
    result = []
    for r in rows:
        offer = row_to_offer(r)
        offer.customer_name = r.get("customer_name")
        result.append(offer)
    return result


@app.get("/offers/{offer_id}", response_model=Offer)
def get_offer(offer_id: str):
    return _get_offer_from_db(offer_id)


@app.patch("/offers/{offer_id}/approve", response_model=Offer)
def approve_offer(offer_id: str):
    _get_offer_from_db(offer_id)  # 404 wenn nicht vorhanden
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE offers SET status = 'approved' WHERE id = %s", (offer_id,)
            )
    return _get_offer_from_db(offer_id)


@app.put("/offers/{offer_id}", response_model=Offer)
def update_offer(offer_id: str, payload: OfferUpdate):
    existing = _get_offer_from_db(offer_id)  # 404 wenn nicht vorhanden
    if existing.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Freigegebene Angebote können nicht mehr bearbeitet werden.",
        )
    totals = calculate_totals(payload.items, payload.vat_rate)
    items_serializable = json.loads(payload.model_dump_json())["items"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE offers SET
                    title        = %s,
                    intro_text   = %s,
                    items_json   = %s,
                    valid_until  = %s,
                    vat_rate     = %s,
                    notes        = %s,
                    subtotal_net = %s,
                    vat_amount   = %s,
                    total_gross  = %s
                WHERE id = %s
                """,
                (
                    payload.title, payload.intro_text, Json(items_serializable),
                    payload.valid_until, payload.vat_rate, payload.notes,
                    totals.subtotal_net, totals.vat_amount, totals.total_gross,
                    offer_id,
                ),
            )
    return _get_offer_from_db(offer_id)


@app.delete("/offers/{offer_id}", status_code=204)
def delete_offer(offer_id: str):
    _get_offer_from_db(offer_id)  # 404 wenn nicht vorhanden
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM offers WHERE id = %s", (offer_id,))


@app.delete("/customers/{customer_id}", status_code=204)
def delete_customer(customer_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM customers WHERE id = %s", (customer_id,)
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
            # Erst prüfen, ob noch Angebote für diesen Kunden existieren
            cur.execute(
                "SELECT COUNT(*) FROM offers WHERE customer_id = %s", (customer_id,)
            )
            count = cur.fetchone()[0]
            if count > 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"Kunde hat noch {count} Angebot(e). Bitte zuerst die Angebote löschen.",
                )
            cur.execute("DELETE FROM customers WHERE id = %s", (customer_id,))


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
                        "Antworte ausschließlich mit gültigem JSON. "
                        "Erzeuge nur konkrete Leistungspositionen, keine allgemeinen Sammelpositionen. "
                        "Wenn der Kunde mehrere verschiedene Leistungen nennt, muss jede Hauptleistung "
                        "eine eigene Position bekommen. "
                        "Beispiel: 'Hecke schneiden und Rasen mähen' muss mindestens zwei getrennte Positionen ergeben: "
                        "'Heckenschnitt' und 'Rasen mähen'. "
                        "Fasse unterschiedliche Arbeiten niemals in einer Position zusammen. "
                        "Erfinde keine zusätzlichen Positionen wie 'Allgemeine Gartenarbeiten', "
                        "'Vorbereitung', 'Nachbereitung' oder 'Anfahrt', außer sie wurden ausdrücklich genannt. "
                        "Jede Position soll genau eine klar verständliche Leistung beschreiben. "
                        "Nutze quantity möglichst als 1 und unit meist als 'Pauschale', wenn keine genauere Menge genannt ist."
                    ),
                },
                {
                    "role": "user",
                    "content": f"""
                Branche: {payload.trade}
                Notizen: {payload.notes}

                Aufgabe:
                1. Lies die Kundenanfrage genau.
                2. Trenne unterschiedliche Leistungen sauber voneinander.
                3. Erzeuge pro Hauptleistung genau eine eigene Position.
                4. Erzeuge keine unnötigen Zusatzpositionen.
                5. Gib ausschließlich JSON zurück.

                Beispiel:
                Wenn in den Notizen steht:
                "Hecke schneiden und Rasen mähen"

                Dann soll items ungefähr so aussehen:
                [
                {{
                    "title": "Heckenschnitt",
                    "description": "Rückschnitt der Hecke gemäß Kundenanfrage.",
                    "quantity": 1,
                    "unit": "Pauschale"
                }},
                {{
                    "title": "Rasen mähen",
                    "description": "Mähen und Pflege des Rasens gemäß Kundenanfrage.",
                    "quantity": 1,
                    "unit": "Pauschale"
                }}
                ]

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

        start = content.find("{")
        end = content.rfind("}") + 1

        if start == -1 or end == 0:
            raise ValueError("Kein JSON in KI-Antwort gefunden")

        json_str = content[start:end]
        data = json.loads(json_str)

        return data

    except Exception as e:
        # Nur Fehlertyp loggen, keine Nutzerdaten oder API-Details
        print(f"KI ERROR: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="KI-Verarbeitung fehlgeschlagen.")

# -------------------------------------------------------------------
# PDF placeholder endpoint
# -------------------------------------------------------------------
@app.get("/offers/{offer_id}/pdf")
def generate_offer_pdf(offer_id: str):
    offer = _get_offer_from_db(offer_id)

    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 50
    today = datetime.now().strftime("%d.%m.%Y")

    # Kopf – Firma oben rechts, Angebotsdaten links
    p.setFont("Helvetica-Bold", 11)
    p.drawRightString(560, y, COMPANY_NAME)
    y -= 14
    p.setFont("Helvetica", 9)
    p.drawRightString(560, y, COMPANY_STREET)
    y -= 12
    p.drawRightString(560, y, COMPANY_ZIP_CITY)
    y -= 12
    if COMPANY_PHONE:
        p.drawRightString(560, y, f"Tel.: {COMPANY_PHONE}")
        y -= 12
    if COMPANY_EMAIL:
        p.drawRightString(560, y, COMPANY_EMAIL)
        y -= 12

    y -= 10
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
    p.drawString(50, y, COMPANY_NAME)

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
    offer = _get_offer_from_db(offer_id)

    today = datetime.now().strftime("%d.%m.%Y")

    # ── escape alle nutzer- und KI-generierten Felder ──────────────────────────
    e = html_module.escape
    safe_title      = e(offer.title)
    safe_intro      = e(offer.intro_text or "").replace("\n", "<br>")
    safe_number     = e(offer.offer_number)
    safe_company    = e(COMPANY_NAME)
    safe_street     = e(COMPANY_STREET)
    safe_zip_city   = e(COMPANY_ZIP_CITY)
    safe_phone      = e(COMPANY_PHONE)
    safe_email      = e(COMPANY_EMAIL)

    rows = ""
    for i, item in enumerate(offer.items, start=1):
        total = item.quantity * item.unit_price_net
        rows += f"""
        <tr>
            <td>{i}</td>
            <td>
                <strong>{e(item.title)}</strong><br>
                <span class="desc">{e(item.description or "")}</span>
            </td>
            <td>{e(str(item.quantity))}</td>
            <td>{e(item.unit)}</td>
            <td class="right">{item.unit_price_net:.2f} €</td>
            <td class="right">{total:.2f} €</td>
        </tr>
        """

    html = f"""
    <html>
    <head>
        <meta charset="utf-8">
        <title>{safe_title}</title>
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
                <strong>{safe_company}</strong><br>
                {safe_street}<br>
                {safe_zip_city}
                {'<br>' + safe_phone if safe_phone else ''}
                {'<br>' + safe_email if safe_email else ''}
            </div>

            <div class="meta">
                <strong>Angebot</strong><br>
                Nr.: {safe_number}<br>
                Datum: {today}
            </div>
        </div>

        <h1>{safe_title}</h1>
        <div class="intro">{safe_intro}</div>

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
            {COMPANY_NAME}
        </div>
    </body>
    </html>
    """

    return html
# -------------------------------------------------------------------
# Run locally:
# uvicorn main:app --reload
# -------------------------------------------------------------------