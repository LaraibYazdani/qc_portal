"""
Entry points run inside the engine's worker processes (see app/lib/engine_runner.py).
Each takes and returns plain data only, so it can cross the process boundary.
"""
from __future__ import annotations

import os
from typing import Any

import numpy as np


def _plain(value: Any) -> Any:
    """Make engine output JSON-safe (numpy numbers and arrays, int dict keys)."""
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def prepare_task(design_path: str, out_dir: str, label: str) -> dict:
    """Build a reference from a design file. Returns its meta plus a web-sized preview name."""
    from .imaging import imread, imwrite, resize_long_side
    from .reference import prepare_reference

    meta = prepare_reference(design_path, out_dir, label)
    preview = imread(os.path.join(out_dir, "marks_preview.jpg"))
    if max(preview.shape[:2]) > 1800:
        preview, _ = resize_long_side(preview, 1800)
    imwrite(os.path.join(out_dir, "preview.jpg"), preview, quality=85)
    clean = imread(os.path.join(out_dir, "reference.png"))
    if max(clean.shape[:2]) > 1800:
        clean, _ = resize_long_side(clean, 1800)
    imwrite(os.path.join(out_dir, "clean.jpg"), clean, quality=85)
    return _plain({"meta": meta, "preview": "preview.jpg", "clean": "clean.jpg"})


def check_task(ref_dir: str, photo_path: str, out_dir: str, sensitivity: str) -> dict:
    """Check one photo against one reference."""
    from .check import check_photo

    return _plain(check_photo(ref_dir, photo_path, out_dir, sensitivity))
