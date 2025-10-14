#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

VENV_DIR="${VENV_DIR:-$PROJECT_ROOT/.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/backend/.env}"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-5000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-8001}"

mkdir -p "$VENV_DIR"
if [ ! -f "$VENV_DIR/bin/activate" ]; then
    echo "[setup] Creating Python virtual environment in $VENV_DIR"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

if [ "${SKIP_PIP_INSTALL:-0}" != "1" ]; then
    echo "[setup] Installing/updating Python dependencies"
    pip install --upgrade pip >/dev/null
    pip install -r "$PROJECT_ROOT/backend/requirements.txt"
else
    echo "[setup] Skipping pip install because SKIP_PIP_INSTALL=$SKIP_PIP_INSTALL"
fi

if [ -f "$ENV_FILE" ]; then
    echo "[setup] Loading environment variables from $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
else
    echo "[warn] No env file found at $ENV_FILE (continuing with current environment)"
fi

export BACKEND_HOST BACKEND_PORT

cleanup() {
    echo
    echo "[shutdown] Stopping services"
    if [ -n "${FRONT_PID:-}" ] && kill -0 "$FRONT_PID" 2>/dev/null; then
        kill "$FRONT_PID"
        wait "$FRONT_PID" 2>/dev/null || true
    fi
    if [ -n "${BACK_PID:-}" ] && kill -0 "$BACK_PID" 2>/dev/null; then
        kill "$BACK_PID"
        wait "$BACK_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT

cd "$PROJECT_ROOT/backend"
python app.py &
BACK_PID=$!
echo "[backend] Flask API gestart op http://$BACKEND_HOST:$BACKEND_PORT (PID $BACK_PID)"

cd "$PROJECT_ROOT/frontend"
python -m http.server "$FRONTEND_PORT" --bind "$FRONTEND_HOST" &
FRONT_PID=$!
echo "[frontend] Static server opgestart op http://$FRONTEND_HOST:$FRONTEND_PORT (PID $FRONT_PID)"

echo
if [ -t 0 ]; then
    echo "[info] Services draaien. Druk op Enter om te stoppen..."
    (
        if ! wait -n "$BACK_PID" "$FRONT_PID"; then
            echo "[warn] Een van de processen is onverwacht gestopt."
        fi
    ) &
    WAITER_PID=$!
    read -r _ || true
    kill "$WAITER_PID" 2>/dev/null || true
else
    echo "[info] Geen interactieve terminal gedetecteerd; wacht tot een proces stopt."
    wait -n "$BACK_PID" "$FRONT_PID"
fi
