"""Shared helpers for determining writable output directories."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Iterable

OUTPUT_DIR_ENV = "INVOICE_OUTPUT_DIR"


def _candidate_paths() -> Iterable[Path]:
    """Yield potential directories where we can write generated files.

    Preference order:
    1. Explicit environment variable (can point anywhere the admin prefers).
    2. Repository-local "generated" directory (always relative to backend/).
    3. A user-writable temp directory namespaced for this project.
    """

    configured = os.getenv(OUTPUT_DIR_ENV)
    if configured:
        yield Path(configured).expanduser()

    repo_generated = Path(__file__).resolve().parent / "generated"
    yield repo_generated

    yield Path(tempfile.gettempdir()) / "hardcups_output"


def ensure_output_dir() -> Path:
    """Return a directory path that exists and is writable.

    We iterate through the candidate paths and create the first one that can be
    created (or already exists). If creation fails, we continue with the next
    candidate. If none succeed we raise an exception so callers can surface a
    meaningful error instead of a FileNotFoundError when writing files.
    """

    last_error: Exception | None = None
    for candidate in _candidate_paths():
        try:
            candidate.mkdir(parents=True, exist_ok=True)
        except Exception as exc:  # pragma: no cover - defensive
            last_error = exc
            continue
        else:
            return candidate

    if last_error is not None:
        raise RuntimeError(
            "Geen schrijfbare map gevonden voor gegenereerde bestanden."
        ) from last_error

    raise RuntimeError("Geen kandidaatmap beschikbaar voor gegenereerde bestanden.")
