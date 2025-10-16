"""Simple NFC bridge helper for environments without direct hardware access.

This script reads tags via nfcpy on a local machine and forwards the NFC code to
any deployed backend that exposes the `/api/nfc/push` endpoint. Configure the
following environment variables before running the script:

- NFC_BRIDGE_API: Base URL of the backend, e.g. https://your-app.onrailway.app/api
- NFC_BRIDGE_TOKEN: Secret token that must match the server's NFC_BRIDGE_TOKEN
- NFC_BRIDGE_SOURCE: Optional human-readable name (e.g. "kassa-1")

Install dependencies locally:
    pip install nfcpy requests python-dotenv

Then run:
    python nfc_bridge.py
"""

import os
import sys
import time

import requests
from dotenv import load_dotenv

try:
    import nfc
except ImportError as exc:  # pragma: no cover - helper script only
    raise SystemExit("nfcpy is vereist om deze bridge te gebruiken: pip install nfcpy") from exc

load_dotenv()

API_BASE = os.getenv("NFC_BRIDGE_API")
BRIDGE_TOKEN = os.getenv("NFC_BRIDGE_TOKEN")
SOURCE = os.getenv("NFC_BRIDGE_SOURCE", "bridge-client")
POLL_DELAY = float(os.getenv("NFC_BRIDGE_POLL_DELAY", "0.5"))

if not API_BASE or not BRIDGE_TOKEN:
    raise SystemExit("Stel NFC_BRIDGE_API en NFC_BRIDGE_TOKEN in voordat je de bridge start.")

PUSH_URL = API_BASE.rstrip("/") + "/nfc/push"


def push_code(code: str) -> None:
    payload = {"nfc_code": code, "source": SOURCE}
    headers = {"X-NFC-Bridge-Token": BRIDGE_TOKEN}
    response = requests.post(PUSH_URL, json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    data = response.json()
    timestamp = data.get("received_at")
    print(f"[{timestamp}] NFC-code doorgestuurd: {code}")


def main() -> None:
    print(f"Verbinding maken met NFC-lezer (bron='{SOURCE}')...")
    with nfc.ContactlessFrontend("usb") as clf:
        print("Bridge actief. Houd een tag bij de lezer om te scannen (Ctrl+C om te stoppen).")
        try:
            while True:
                tag = clf.connect(rdwr={"on-connect": lambda tag: False})
                code = tag.identifier.hex()
                push_code(code)
                time.sleep(POLL_DELAY)
        except KeyboardInterrupt:
            print("\nBridge gestopt op verzoek van gebruiker.")
        except Exception as exc:
            print(f"Fout bij het lezen van NFC: {exc}", file=sys.stderr)
            raise


if __name__ == "__main__":
    main()
