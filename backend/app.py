import os
import random
from datetime import datetime, date, timedelta, timezone
from functools import wraps
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
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
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum("admin", "medewerker", "klant", name="user_roles"), nullable=False, default="medewerker")
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)

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
                )
            )
        s.commit()
    finally:
        s.close()
seed_initial()

# ---------- AUTH HELPERS ----------
def auth_required(roles=None):
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
                request.user = data  # {'sub': username, 'role': 'admin'}
                if roles and data.get("role") not in roles:
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
        token = jwt.encode({"sub": u.username, "role": u.role, "exp": exp}, JWT_SECRET, algorithm="HS256")
        return jsonify({"token": token, "role": u.role})
    finally:
        s.close()

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat()})

# Customers
@app.get("/api/customers")
@auth_required(roles=["admin","medewerker"])
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
@auth_required(roles=["admin","medewerker"])
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
@auth_required(roles=["admin"])
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
    finally:
        s.close()

@app.put("/api/customers/<int:cust_id>")
@auth_required(roles=["admin"])
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
        s.commit()
        return jsonify({"ok": True})
    finally:
        s.close()

# Inventory
@app.get("/api/inventory")
@auth_required(roles=["admin","medewerker"])
def get_inventory():
    s = SessionLocal()
    try:
        inv = s.query(Inventory).all()
        by_key = {i.product_key: {"product_name": i.product_name, "units": i.units} for i in inv}
        return jsonify(by_key)
    finally:
        s.close()

@app.post("/api/inventory/add_bulk")
@auth_required(roles=["admin"])
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

# Transactions
def get_customer_by_identifier(s, identifier):
    if identifier is None:
        return None
    cust = s.query(Customer).filter(Customer.number == str(identifier).zfill(2)).first()
    if cust: return cust
    return s.query(Customer).filter(Customer.nfc_code == identifier).first()

@app.post("/api/transaction")
@auth_required(roles=["admin","medewerker"])
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

# Dashboard
@app.get("/api/dashboard")
@auth_required(roles=["admin","medewerker"])
def dashboard():
    s = SessionLocal()
    try:
        inv = s.query(Inventory).all()
        inventory = {i.product_key: i.units for i in inv}
        issued = dict(s.query(Transaction.product_key, func.coalesce(func.sum(Transaction.amount), 0))
                      .filter(Transaction.tx_type == "issue")
                      .group_by(Transaction.product_key).all())
        return jsonify({
            "inventory": inventory,
            "issued": {
                "hardcups": int(issued.get("hardcups", 0)),
                "champagne": int(issued.get("champagne", 0)),
                "cocktail": int(issued.get("cocktail", 0)),
            }
        })
    finally:
        s.close()

# CSV exports
@app.get("/api/export/transactions.csv")
@auth_required(roles=["admin","medewerker"])
def export_txs_csv():
    s = SessionLocal()
    try:
        path = export_transactions_csv(s, Transaction, Customer)
        return send_file(path, mimetype="text/csv", as_attachment=True, download_name="transacties.csv")
    finally:
        s.close()

@app.get("/api/export/inventory.csv")
@auth_required(roles=["admin","medewerker"])
def export_inv_csv():
    s = SessionLocal()
    try:
        path = export_inventory_csv(s, Inventory)
        return send_file(path, mimetype="text/csv", as_attachment=True, download_name="voorraad.csv")
    finally:
        s.close()

# NFC read (hardware + simulation fallback)
@app.get("/api/nfc/read")
@auth_required(roles=["admin","medewerker"])
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
@auth_required(roles=["admin","medewerker"])
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
        return send_file(pdf_path, mimetype="application/pdf", as_attachment=True,
                         download_name=f"Dagafrekening_{cust.number}_{target_date}.pdf")
    finally:
        s.close()

@app.post("/api/invoices/final")
@auth_required(roles=["admin","medewerker"])
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
        return send_file(pdf_path, mimetype="application/pdf", as_attachment=True,
                         download_name=f"Eindafrekening_{cust.number}.pdf")
    finally:
        s.close()

if __name__ == "__main__":
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", "5000"))
    debug_env = os.getenv("FLASK_DEBUG", "1").lower()
    debug = debug_env not in {"0", "false", "no"}
    app.run(host=host, port=port, debug=debug)
