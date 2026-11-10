"""
Small image helpers shared by every step.
"""

import os
import cv2
import numpy as np


def imread(path: str, flags: int = cv2.IMREAD_COLOR) -> np.ndarray:
    """cv2.imread that also works with non-ASCII Windows paths."""
    data = np.fromfile(path, dtype=np.uint8)
    img = cv2.imdecode(data, flags)
    if img is None:
        raise FileNotFoundError(f"Cannot load image: {path}")
    return img


def imwrite(path: str, img: np.ndarray, quality: int = 90) -> None:
    """cv2.imwrite that also works with non-ASCII Windows paths."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    ext = os.path.splitext(path)[1].lower()
    params = [cv2.IMWRITE_JPEG_QUALITY, quality] if ext in (".jpg", ".jpeg") else []
    ok, buf = cv2.imencode(ext, img, params)
    if not ok:
        raise IOError(f"Cannot encode image: {path}")
    buf.tofile(path)


def resize_long_side(img: np.ndarray, long_side: int, interp=cv2.INTER_AREA) -> tuple[np.ndarray, float]:
    """Resize so the longer side equals long_side. Returns (image, scale)."""
    h, w = img.shape[:2]
    scale = long_side / max(h, w)
    if abs(scale - 1.0) < 1e-6:
        return img.copy(), 1.0
    if scale > 1.0:
        interp = cv2.INTER_CUBIC
    out = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=interp)
    return out, scale


def to_lab(bgr: np.ndarray) -> np.ndarray:
    """BGR uint8 -> float32 CIELAB (L 0-100, a/b roughly -128..127)."""
    return cv2.cvtColor(bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)
