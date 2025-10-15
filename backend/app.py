import os
import random
from datetime import datetime, date, timedelta, timezone
from functools import wraps
from flask import Flask, jsonify, request, send_file, after_this_request
from flask_cors import CORS
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    Enum,
    ForeignKey,
    func,
    text,
    inspect,
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy.exc import IntegrityError
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
import jwt

from pdf_utils import build_invoice_pdf
from export_utils import export_transactions_csv, export_inventory_csv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "choose_a_long_random_secret")

DATABASE_URI = os.getenv("DATABASE_URL")
if not DATABASE_URI:
    db_backend = os.getenv("DB_BACKEND", "sqlite").lower()
    if db_backend == "mysql":
        db_user = os.getenv("DB_USER", "root")
        db_pass = os.getenv("DB_PASS", "root")
        db_host = os.getenv("DB_HOST", "127.0.0.1")
        db_port = os.getenv("DB_PORT", "3306")
        db_name = os.getenv("DB_NAME", "proefmei")
        DATABASE_URI = (
            f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}?charset=utf8mb4"
        )
    else:
        sqlite_path = os.getenv(
            "SQLITE_DB_PATH",
            os.path.join(os.path.dirname(__file__), "proefmei.db"),
        )
        DATABASE_URI = f"sqlite:///{sqlite_path}"

if DATABASE_URI.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URI, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(DATABASE_URI, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

app = Flask(__name__)
CORS(app)

# ---------- MODELS ----------
AVAILABLE_DASHBOARDS = [
    "dashboard",
    "klanten",
    "voorraad",
    "transacties",
    "facturen",
    "munten",
    "overzicht",
    "accounts",
    "instellingen",
]


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        Enum("admin", "medewerker", "klant", name="user_roles"),
        nullable=False,
        default="medewerker",
    )
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    allowed_dashboards = Column(String(255), nullable=False, default="dashboard")

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True)
    number = Column(String(8), unique=True, nullable=False)  # e.g., "02"
    name = Column(String(200), nullable=False)
    email = Column(String(200))
    address = Column(String(300))
    nfc_code = Column(String(64), unique=True, nullable=True)
    transactions = relationship("Transaction", back_populates="customer")

class Inventory(Base):
    __tablename__ = "inventory"
    id = Column(Integer, primary_key=True)
    product_key = Column(String(32), unique=True, nullable=False)  # 'hardcups'|'champagne'|'cocktail'
    product_name = Column(String(200), nullable=False)
    units = Column(Integer, default=0)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    product_key = Column(String(32), nullable=False)
    amount = Column(Integer, nullable=False)  # positive numbers
    tx_type = Column(Enum("issue", "return", name="tx_type"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    customer = relationship("Customer", back_populates="transactions")


class CoinTransaction(Base):
    __tablename__ = "coin_transactions"
    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    amount = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    recorded_by = Column(String(64), nullable=True)
    customer = relationship("Customer")

Base.metadata.create_all(bind=engine)

# Seed data
def seed_initial():
    s = SessionLocal()
    try:
        if s.query(Inventory).count() == 0:
            s.add_all([
                Inventory(product_key="hardcups", product_name="Hardcups", units=500),
                Inventory(product_key="champagne", product_name="Champagne Hardcups", units=300),
                Inventory(product_key="cocktail", product_name="Cocktail Hardcups", units=450),
            ])
        if s.query(Customer).count() == 0:
            c = Customer(number="02", name="The Foodystore", email="info@foodystore.nl", address="Markt 12, Bergen op Zoom", nfc_code="NFC123456")
            s.add(c)
        if s.query(User).count() == 0:
            s.add(
                User(
                    username="Tebbensj",
                    password_hash=generate_password_hash("Proefmei2026!"),
                    role="admin",
                    allowed_dashboards="*",
                )
            )
        s.commit()
    finally:
        s.close()
seed_initial()


def ensure_schema():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("users")}
    with engine.begin() as conn:
        if "allowed_dashboards" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN allowed_dashboards VARCHAR(255) DEFAULT 'dashboard'"))
        conn.execute(
            text(
                "UPDATE users SET allowed_dashboards='*' WHERE role='admin' AND (allowed_dashboards IS NULL OR allowed_dashboards='dashboard')"
            )
        )


ensure_schema()

# ---------- AUTH HELPERS ----------
def resolve_dashboards(value):
    if not value:
        return [AVAILABLE_DASHBOARDS[0]]
    if value == "*":
        return AVAILABLE_DASHBOARDS[:]
    if isinstance(value, list):
        return [d for d in value if d in AVAILABLE_DASHBOARDS]
    return [d for d in value.split(",") if d in AVAILABLE_DASHBOARDS]


def dashboards_to_store(dashboards):
    if not dashboards:
        return "dashboard"
    unique = []
    for d in dashboards:
        if d == "*":
            return "*"
        if d in AVAILABLE_DASHBOARDS and d not in unique:
            unique.append(d)
    if len(unique) == len(AVAILABLE_DASHBOARDS):
        return "*"
    return ",".join(unique) if unique else "dashboard"


def has_dashboard_access(claims, dashboards_required):
    if not dashboards_required:
        return True
    allowed = claims.get("dashboards")
    if not allowed:
        return False
    if isinstance(allowed, list):
        allowed_set = set(allowed)
    elif allowed == "*":
        return True
    else:
        allowed_set = set(resolve_dashboards(allowed))
    if "*" in allowed_set:
        return True
    if isinstance(dashboards_required, (list, tuple, set)):
        return bool(set(dashboards_required) & allowed_set)
    return dashboards_required in allowed_set


def auth_required(roles=None, dashboards=None):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = None
            if "Authorization" in request.headers:
                parts = request.headers["Authorization"].split()
                if len(parts) == 2 and parts[0].lower() == "bearer":
                    token = parts[1]
            if not token:
                return jsonify({"error": "Unauthorized"}), 401
            try:
                data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                request.user = data  # {'sub': username, 'role': 'admin', 'dashboards': [...]}
                if roles and data.get("role") not in roles:
                    return jsonify({"error": "Forbidden"}), 403
                if dashboards and not has_dashboard_access(data, dashboards):
                    return jsonify({"error": "Forbidden"}), 403
            except Exception:
                return jsonify({"error": "Invalid token"}), 401
            return fn(*args, **kwargs)
        return wrapper
    return decorator

# ---------- ROUTES ----------
@app.post("/api/auth/login")
def login():
    s = SessionLocal()
    try:
        payload = request.json or {}
        u = s.query(User).filter(User.username == payload.get("username")).first()
        if not u or not check_password_hash(u.password_hash, payload.get("password","")):
            return jsonify({"error": "Invalid credentials"}), 401
        exp = datetime.now(tz=timezone.utc) + timedelta(hours=8)
        dashboards = resolve_dashboards(u.allowed_dashboards)
        token = jwt.encode({"sub": u.username, "role": u.role, "dashboards": dashboards, "exp": exp}, JWT_SECRET, algorithm="HS256")
        return jsonify({"token": token, "role": u.role, "dashboards": dashboards})
    finally:
        s.close()


def get_user_by_username(s, username):
    return s.query(User).filter(User.username == username).first()


@app.get("/api/users")
@auth_required(roles=["admin"], dashboards=["accounts"])
def list_users():
    s = SessionLocal()
    try:
        users = s.query(User).order_by(User.username.asc()).all()
        items = []
        for u in users:
            items.append(
                {
                    "id": u.id,
                    "username": u.username,
                    "role": u.role,
                    "dashboards": resolve_dashboards(u.allowed_dashboards),
                }
            )
        return jsonify(items)
    finally:
        s.close()


@app.post("/api/users")
@auth_required(roles=["admin"], dashboards=["accounts"])
def create_user():
    data = request.json or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = data.get("role") or "medewerker"
    dashboards = resolve_dashboards(data.get("dashboards") or [])
    if not username or not password:
        return jsonify({"error": "Gebruikersnaam en wachtwoord verplicht"}), 400
    if len(password) < 6:
        return jsonify({"error": "Wachtwoord minimaal 6 tekens"}), 400
    if role not in {"admin", "medewerker", "klant"}:
        return jsonify({"error": "Ongeldige rol"}), 400

    s = SessionLocal()
    try:
        if get_user_by_username(s, username):
            return jsonify({"error": "Gebruikersnaam bestaat al"}), 400
        stored_dashboards = dashboards_to_store(dashboards)
        user = User(
            username=username,
            password_hash=generate_password_hash(password),
            role=role,
            allowed_dashboards=stored_dashboards,
        )
        s.add(user)
        s.commit()
        return jsonify({"id": user.id}), 201
    finally:
        s.close()


@app.put("/api/users/<int:user_id>")
@auth_required(roles=["admin"], dashboards=["accounts"])
def update_user(user_id):
    data = request.json or {}
    s = SessionLocal()
    try:
        user = s.query(User).get(user_id)
        if not user:
            return jsonify({"error": "Gebruiker niet gevonden"}), 404
        role = data.get("role")
        if role:
            if role not in {"admin", "medewerker", "klant"}:
                return jsonify({"error": "Ongeldige rol"}), 400
            user.role = role
        dashboards = data.get("dashboards")
        if dashboards is not None:
            user.allowed_dashboards = dashboards_to_store(resolve_dashboards(dashboards))
        new_password = data.get("password")
        if new_password:
            if len(new_password) < 6:
                return jsonify({"error": "Wachtwoord minimaal 6 tekens"}), 400
            user.password_hash = generate_password_hash(new_password)
        s.commit()
        return jsonify({"ok": True})
    finally:
        s.close()

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat()})

# Customers
@app.get("/api/customers")
@auth_required(roles=["admin","medewerker"], dashboards=["klanten", "facturen", "overzicht", "transacties", "munten"])
def list_customers():
    s = SessionLocal()
    try:
        customers = s.query(Customer).order_by(Customer.number).all()
        return jsonify([{
            "id": c.id, "number": c.number, "name": c.name, "email": c.email,
            "address": c.address, "nfc_code": c.nfc_code
        } for c in customers])
    finally:
        s.close()

@app.get("/api/customers/<int:cust_id>")
@auth_required(roles=["admin","medewerker"], dashboards=["klanten", "facturen", "overzicht", "transacties", "munten"])
def get_customer(cust_id):
    s = SessionLocal()
    try:
        c = s.query(Customer).get(cust_id)
        if not c:
            return jsonify({"error": "Customer not found"}), 404
        return jsonify({"id": c.id, "number": c.number, "name": c.name, "email": c.email,
                        "address": c.address, "nfc_code": c.nfc_code})
    finally:
        s.close()

@app.post("/api/customers")
@auth_required(roles=["admin"], dashboards=["klanten"])
def create_customer():
    data = request.json or {}
    s = SessionLocal()
    try:
        c = Customer(
            number=str(data.get("number", "00")).zfill(2),
            name=data.get("name", ""),
            email=data.get("email"),
            address=data.get("address"),
            nfc_code=data.get("nfc_code")
        )
        s.add(c)
        s.commit()
        return jsonify({"id": c.id}), 201
    except IntegrityError:
        s.rollback()
        return jsonify({"error": "Klantnummer of NFC bestaat al"}), 400
    finally:
        s.close()

@app.put("/api/customers/<int:cust_id>")
@auth_required(roles=["admin"], dashboards=["klanten"])
def update_customer(cust_id):
    data = request.json or {}
    s = SessionLocal()
    try:
        c = s.query(Customer).get(cust_id)
        if not c:
            return jsonify({"error": "Customer not found"}), 404
        if "number" in data:
            c.number = str(data["number"]).zfill(2)
        c.name = data.get("name", c.name)
        c.email = data.get("email", c.email)
        c.address = data.get("address", c.address)
        c.nfc_code = data.get("nfc_code", c.nfc_code)
        try:
            s.commit()
        except IntegrityError:
            s.rollback()
            return jsonify({"error": "Klantnummer of NFC bestaat al"}), 400
        return jsonify({"ok": True})
    finally:
        s.close()

# Inventory
@app.get("/api/inventory")
@auth_required(roles=["admin","medewerker"], dashboards=["voorraad"])
def get_inventory():
    s = SessionLocal()
    try:
        inv = s.query(Inventory).all()
        by_key = {i.product_key: {"product_name": i.product_name, "units": i.units} for i in inv}
        return jsonify(by_key)
    finally:
        s.close()

@app.post("/api/inventory/add_bulk")
@auth_required(roles=["admin"], dashboards=["voorraad"])
def add_bulk_inventory():
    data = request.json or {}
    product = data.get("product")
    amount = int(data.get("amount", 0))
    if product not in ("hardcups", "champagne", "cocktail") or amount <= 0:
        return jsonify({"error": "Invalid product or amount"}), 400
    s = SessionLocal()
    try:
        inv = s.query(Inventory).filter(Inventory.product_key == product).first()
        if not inv:
            return jsonify({"error": "Product not found"}), 404
        inv.units += amount
        s.commit()
        return jsonify({"ok": True, "units": inv.units})
    finally:
        s.close()

@app.put("/api/inventory/<string:product>")
@auth_required(roles=["admin"], dashboards=["voorraad"])
def set_inventory_units(product):
    data = request.json or {}
    try:
        units = int(data.get("units"))
    except Exception:
        return jsonify({"error": "Ongeldig aantal"}), 400
    if units < 0:
        return jsonify({"error": "Aantal kan niet negatief"}), 400
    if product not in ("hardcups", "champagne", "cocktail"):
        return jsonify({"error": "Onbekend product"}), 400
    s = SessionLocal()
    try:
        inv = s.query(Inventory).filter(Inventory.product_key == product).first()
        if not inv:
            return jsonify({"error": "Product niet gevonden"}), 404
        inv.units = units
        s.commit()
        return jsonify({"ok": True, "units": inv.units})
    finally:
        s.close()

# Transactions
def get_customer_by_identifier(s, identifier):
    if identifier is None:
        return None
    cust = s.query(Customer).filter(Customer.number == str(identifier).zfill(2)).first()
    if cust: return cust
    return s.query(Customer).filter(Customer.nfc_code == identifier).first()


@app.post("/api/transaction")
@auth_required(roles=["admin","medewerker"], dashboards=["transacties"])
def create_transaction():
    data = request.json or {}
    identifier = data.get("identifier")  # number or NFC
    product = data.get("product")
    amount = int(data.get("amount", 0))
    tx_type = data.get("type")  # 'issue' or 'return'
    if tx_type not in ("issue", "return"):
        return jsonify({"error": "Invalid type"}), 400
    if product not in ("hardcups", "champagne", "cocktail") or amount <= 0:
        return jsonify({"error": "Invalid product or amount"}), 400

    s = SessionLocal()
    try:
        cust = get_customer_by_identifier(s, identifier)
        if not cust:
            return jsonify({"error": "Customer not found"}), 404
        inv = s.query(Inventory).filter(Inventory.product_key == product).first()
        if not inv:
            return jsonify({"error": "Product not found"}), 404
        if tx_type == "issue":
            if inv.units < amount:
                return jsonify({"error": "Not enough inventory"}), 400
            inv.units -= amount
        else:
            inv.units += amount
        t = Transaction(customer_id=cust.id, product_key=product, amount=amount, tx_type=tx_type)
        s.add(t)
        s.commit()
        return jsonify({"ok": True, "new_units": inv.units, "transaction_id": t.id})
    finally:
        s.close()

# Coins
@app.post("/api/coins/intake")
@auth_required(roles=["admin", "medewerker"], dashboards=["munten"])
def coins_intake():
    data = request.json or {}
    identifier = data.get("identifier")
    try:
        amount = int(data.get("amount", 0))
    except Exception:
        return jsonify({"error": "Ongeldig aantal"}), 400
    if amount <= 0:
        return jsonify({"error": "Aantal moet positief zijn"}), 400

    s = SessionLocal()
    try:
        cust = get_customer_by_identifier(s, identifier)
        if not cust:
            return jsonify({"error": "Klant niet gevonden"}), 404
        tx = CoinTransaction(customer_id=cust.id, amount=amount, recorded_by=request.user.get("sub"))
        s.add(tx)
        s.commit()
        return jsonify({"ok": True, "coin_id": tx.id})
    finally:
        s.close()


@app.get("/api/coins/daily")
@auth_required(roles=["admin", "medewerker"], dashboards=["munten"])
def coins_daily():
    start = request.args.get("start")
    end = request.args.get("end")
    try:
        start_date = date.fromisoformat(start) if start else date.today() - timedelta(days=6)
    except Exception:
        return jsonify({"error": "Ongeldige startdatum"}), 400
    try:
        end_date = date.fromisoformat(end) if end else date.today()
    except Exception:
        return jsonify({"error": "Ongeldige einddatum"}), 400
    if end_date < start_date:
        return jsonify({"error": "Einddatum voor startdatum"}), 400

    s = SessionLocal()
    try:
        rows = (
            s.query(func.date(CoinTransaction.created_at).label("day"), func.coalesce(func.sum(CoinTransaction.amount), 0))
            .filter(CoinTransaction.created_at >= datetime.combine(start_date, datetime.min.time()))
            .filter(CoinTransaction.created_at <= datetime.combine(end_date, datetime.max.time()))
            .group_by("day")
            .order_by("day")
            .all()
        )
        return jsonify([
            {"date": r[0].isoformat() if hasattr(r[0], "isoformat") else str(r[0]), "amount": int(r[1])}
            for r in rows
        ])
    finally:
        s.close()


@app.get("/api/coins/customers")
@auth_required(roles=["admin", "medewerker"], dashboards=["munten"])
def coins_by_customer():
    s = SessionLocal()
    try:
        rows = (
            s.query(
                Customer.id,
                Customer.name,
                Customer.number,
                func.coalesce(func.sum(CoinTransaction.amount), 0).label("total"),
            )
            .join(CoinTransaction, CoinTransaction.customer_id == Customer.id, isouter=True)
            .group_by(Customer.id)
            .order_by(Customer.number.asc())
            .all()
        )
        return jsonify(
            [
                {
                    "customer_id": r.id,
                    "name": r.name,
                    "number": r.number,
                    "total": int(r.total),
                }
                for r in rows
            ]
        )
    finally:
        s.close()


@app.get("/api/customers/summary")
@auth_required(roles=["admin", "medewerker"], dashboards=["overzicht"])
def customers_summary():
    s = SessionLocal()
    try:
        customers = s.query(Customer).order_by(Customer.number.asc()).all()
        tx_rows = (
            s.query(
                Transaction.customer_id,
                Transaction.product_key,
                Transaction.tx_type,
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            )
            .group_by(Transaction.customer_id, Transaction.product_key, Transaction.tx_type)
            .all()
        )
        totals = {}
        for customer_id, product_key, tx_type, total in tx_rows:
            key = totals.setdefault(customer_id, {"issue": {}, "return": {}})
            key[tx_type][product_key] = int(total)
        coin_rows = (
            s.query(CoinTransaction.customer_id, func.coalesce(func.sum(CoinTransaction.amount), 0))
            .group_by(CoinTransaction.customer_id)
            .all()
        )
        coin_totals = {cid: int(total) for cid, total in coin_rows}
        results = []
        for c in customers:
            data = totals.get(c.id, {"issue": {}, "return": {}})
            issue = data.get("issue", {})
            ret = data.get("return", {})
            results.append(
                {
                    "id": c.id,
                    "name": c.name,
                    "number": c.number,
                    "issued": {
                        "hardcups": issue.get("hardcups", 0),
                        "champagne": issue.get("champagne", 0),
                        "cocktail": issue.get("cocktail", 0),
                    },
                    "returned": {
                        "hardcups": ret.get("hardcups", 0),
                        "champagne": ret.get("champagne", 0),
                        "cocktail": ret.get("cocktail", 0),
                    },
                    "coins": coin_totals.get(c.id, 0),
                }
            )
        return jsonify(results)
    finally:
        s.close()
# Dashboard
@app.get("/api/dashboard")
@auth_required(roles=["admin","medewerker"], dashboards=["dashboard"])
def dashboard():
    s = SessionLocal()
    try:
        inv = s.query(Inventory).all()
        inventory = {i.product_key: i.units for i in inv}
        issued = dict(
            s.query(Transaction.product_key, func.coalesce(func.sum(Transaction.amount), 0))
            .filter(Transaction.tx_type == "issue")
            .group_by(Transaction.product_key)
            .all()
        )
        returned = dict(
            s.query(Transaction.product_key, func.coalesce(func.sum(Transaction.amount), 0))
            .filter(Transaction.tx_type == "return")
            .group_by(Transaction.product_key)
            .all()
        )
        ratios = {}
        net = {}
        for key in ("hardcups", "champagne", "cocktail"):
            issue_val = int(issued.get(key, 0))
            return_val = int(returned.get(key, 0))
            net[key] = issue_val - return_val
            ratios[key] = round((return_val / issue_val) * 100, 2) if issue_val else 0.0
        return jsonify({
            "inventory": inventory,
            "issued": {
                "hardcups": int(issued.get("hardcups", 0)),
                "champagne": int(issued.get("champagne", 0)),
                "cocktail": int(issued.get("cocktail", 0)),
            },
            "returns": {
                "hardcups": int(returned.get("hardcups", 0)),
                "champagne": int(returned.get("champagne", 0)),
                "cocktail": int(returned.get("cocktail", 0)),
            },
            "net": net,
            "ratios": ratios,
        })
    finally:
        s.close()

# CSV exports
@app.get("/api/export/transactions.csv")
@auth_required(roles=["admin","medewerker"], dashboards=["facturen"])
def export_txs_csv():
    s = SessionLocal()
    try:
        path = export_transactions_csv(s, Transaction, Customer)
        return send_file(path, mimetype="text/csv", as_attachment=True, download_name="transacties.csv")
    finally:
        s.close()

@app.get("/api/export/inventory.csv")
@auth_required(roles=["admin","medewerker"], dashboards=["facturen"])
def export_inv_csv():
    s = SessionLocal()
    try:
        path = export_inventory_csv(s, Inventory)
        return send_file(path, mimetype="text/csv", as_attachment=True, download_name="voorraad.csv")
    finally:
        s.close()

# NFC read (hardware + simulation fallback)
@app.get("/api/nfc/read")
@auth_required(roles=["admin","medewerker"], dashboards=["klanten","transacties","munten"])
def nfc_read():
    try:
        import nfc  # requires nfcpy
        clf = nfc.ContactlessFrontend('usb')
        tag = clf.connect(rdwr={'on-connect': lambda tag: False})
        code = str(tag.identifier.hex())
        clf.close()
        return jsonify({"nfc_code": code, "mode": "hardware"})
    except Exception as e:
        sim_code = f"NFC{random.randint(10000,99999)}"
        return jsonify({"nfc_code": sim_code, "mode": "simulation", "note": str(e)})

# Invoices PDF
@app.post("/api/invoices/daily")
@auth_required(roles=["admin","medewerker"], dashboards=["facturen"])
def invoice_daily():
    s = SessionLocal()
    try:
        payload = request.get_json(silent=True) or {}
        customer_identifier = request.args.get("customer") or payload.get("customer")
        target_date_str = request.args.get("date") or payload.get("date")
        cust = get_customer_by_identifier(s, customer_identifier)
        if not cust:
            return jsonify({"error": "Customer not found"}), 404
        target_date = date.fromisoformat(target_date_str) if target_date_str else date.today()
        start_dt = datetime.combine(target_date, datetime.min.time())
        end_dt = datetime.combine(target_date, datetime.max.time())
        txs = (s.query(Transaction)
               .filter(Transaction.customer_id == cust.id,
                       Transaction.created_at >= start_dt,
                       Transaction.created_at <= end_dt)
               .order_by(Transaction.created_at.asc()).all())
        pdf_path = build_invoice_pdf(cust, txs, invoice_type="Dagafrekening", target_date=target_date)

        @after_this_request
        def cleanup(response):
            try:
                os.remove(pdf_path)
            except OSError:
                pass
            return response

        return send_file(str(pdf_path), mimetype="application/pdf", as_attachment=True,
                         download_name=f"Dagafrekening_{cust.number}_{target_date}.pdf")
    finally:
        s.close()

@app.post("/api/invoices/final")
@auth_required(roles=["admin","medewerker"], dashboards=["facturen"])
def invoice_final():
    s = SessionLocal()
    try:
        payload = request.get_json(silent=True) or {}
        customer_identifier = request.args.get("customer") or payload.get("customer")
        cust = get_customer_by_identifier(s, customer_identifier)
        if not cust:
            return jsonify({"error": "Customer not found"}), 404
        txs = (s.query(Transaction)
               .filter(Transaction.customer_id == cust.id)
               .order_by(Transaction.created_at.asc()).all())
        pdf_path = build_invoice_pdf(cust, txs, invoice_type="Eindafrekening", target_date=date.today())

        @after_this_request
        def cleanup(response):
            try:
                os.remove(pdf_path)
            except OSError:
                pass
            return response

        return send_file(str(pdf_path), mimetype="application/pdf", as_attachment=True,
                         download_name=f"Eindafrekening_{cust.number}.pdf")
    finally:
        s.close()

if __name__ == "__main__":
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", "5000"))
    debug_env = os.getenv("FLASK_DEBUG", "1").lower()
    debug = debug_env not in {"0", "false", "no"}
    app.run(host=host, port=port, debug=debug)
