import csv
from datetime import datetime
from typing import Any, Type

from sqlalchemy.orm import Session

from path_utils import ensure_output_dir

def export_transactions_csv(
    session: Session,
    transaction_model: Type[Any],
    customer_model: Type[Any],
):
    output_dir = ensure_output_dir()
    path = output_dir / f"transacties_{datetime.now().strftime('%Y%m%d%H%M%S')}.csv"
    q = (
        session.query(transaction_model, customer_model)
        .join(customer_model, transaction_model.customer_id == customer_model.id)
        .order_by(transaction_model.created_at.asc())
    )
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["datetime","customer_number","customer_name","product","type","amount"])
        for t,c in q.all():
            w.writerow([t.created_at.strftime("%Y-%m-%d %H:%M"), c.number, c.name, t.product_key, t.tx_type, t.amount])
    return str(path)

def export_inventory_csv(session: Session, inventory_model: Type[Any]):
    output_dir = ensure_output_dir()
    path = output_dir / f"voorraad_{datetime.now().strftime('%Y%m%d%H%M%S')}.csv"
    items = session.query(inventory_model).all()
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["product_key","product_name","units"])
        for i in items:
            w.writerow([i.product_key, i.product_name, i.units])
    return str(path)
