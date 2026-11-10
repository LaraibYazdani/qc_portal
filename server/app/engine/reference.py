"""
STEP 1: Turn an approved design file into a clean reference for comparison.

Input:  a design file — JPG / PNG, or PDF (first page)
Output: a reference folder chosen by the caller, holding:
          reference.png      the artwork with every non-printing mark removed,
                             cropped to the flat sheet, at WORK_LONG_SIDE px
          compare_mask.png   white = compare here; black = ignore (marks,
                             gutters between panels, die-cut holes, edges)
          ink_labels.png     which main ink each flat-colour pixel belongs to
          marks_preview.jpg  visual check of what was removed / ignored
          meta.json          job info + the list of inks found

Why this is needed:
  The design file is a technical drawing: it has the panel outlines (dieline),
  dimension labels ("330mm"), 30mm arrows, dashed handle-hole circles, crop
  ticks and spec text. NONE of that is printed on the real board, so a photo
  of a perfect box would "differ" from the raw design everywhere there is a
  mark. On these designs every mark is drawn in magenta, a colour the artwork
  itself never uses, so the marks can be detected by colour (see config.py).
"""

import json
import os

import cv2
import numpy as np

from . import settings as config
from .imaging import imread, imwrite, resize_long_side, to_lab


# ─── Loading ──────────────────────────────────────────────────────────────────

def load_design(path: str) -> np.ndarray:
    """Load a design as a BGR image. PDFs are rendered (first page only) with PyMuPDF."""
    if path.lower().endswith(".pdf"):
        import fitz  # PyMuPDF: no external Poppler install needed on the server
        with fitz.open(path) as doc:
            if doc.page_count == 0:
                raise ValueError(f"PDF has no pages: {path}")
            pix = doc[0].get_pixmap(dpi=config.PDF_DPI, alpha=False)
            rgb = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)
        return cv2.cvtColor(np.ascontiguousarray(rgb[..., :3]), cv2.COLOR_RGB2BGR)
    return imread(path)


# ─── Mark detection ───────────────────────────────────────────────────────────

def detect_mark_colour(img: np.ndarray, min_sat: int | None = None) -> np.ndarray:
    """Mask (uint8 0/255) of every pixel drawn in the dieline/mark colour."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lo, hi = config.MARK_HUE_RANGE
    sat = config.MARK_MIN_SAT if min_sat is None else min_sat
    return cv2.inRange(hsv, (lo, sat, config.MARK_MIN_VAL), (hi, 255, 255))


def detect_long_lines(mark_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Long straight mark lines (the panel outlines), as (horizontal, vertical) masks."""
    h, w = mark_mask.shape
    # Join anti-aliased / JPEG-broken line pixels before testing for length
    joined = cv2.dilate(mark_mask, np.ones((3, 3), np.uint8))
    kh = max(15, int(w * config.PANEL_LINE_MIN_FRACTION))
    kv = max(15, int(h * config.PANEL_LINE_MIN_FRACTION))
    horiz = cv2.morphologyEx(joined, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (kh, 1)))
    vert  = cv2.morphologyEx(joined, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, kv)))
    return horiz, vert


def detect_dark_ticks(img: np.ndarray, lines: np.ndarray) -> np.ndarray:
    """Crop / crease ticks: thin dark grey marks sitting right on the panel outlines."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    dark_grey = cv2.inRange(hsv, (0, 0, 0), (179, 70, 150))
    reach = max(9, int(min(img.shape[:2]) * 0.015)) | 1
    near_lines = cv2.dilate(lines, np.ones((reach, reach), np.uint8))
    return cv2.bitwise_and(dark_grey, near_lines)


def fill_closed_marks(small_marks: np.ndarray) -> np.ndarray:
    """
    Dashed circles/ovals mark die-cut handle and vent holes — on the real board
    those are HOLES, so the whole inside has to be ignored, not just the outline.
    Close the dashes into a ring, then fill every closed shape.
    """
    closed = cv2.morphologyEx(small_marks, cv2.MORPH_CLOSE,
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(small_marks)
    cv2.drawContours(filled, contours, -1, 255, thickness=cv2.FILLED)
    return filled


def line_positions(line_mask: np.ndarray, axis: int, min_fraction: float) -> list[int]:
    """
    Positions of outline lines along one axis. axis=0 -> x of vertical lines,
    axis=1 -> y of horizontal lines. A position counts if line pixels cover at
    least min_fraction of the sheet along it (outlines are often hidden under
    the artwork for part of their length, so they need not be complete).
    """
    profile = (line_mask > 0).sum(axis=axis)
    length = line_mask.shape[axis]
    hits = np.nonzero(profile >= min_fraction * length)[0]
    groups, start = [], None
    for i, p in enumerate(hits):
        if start is None:
            start = p
        if i == len(hits) - 1 or hits[i + 1] > p + 2:
            groups.append(int((start + p) // 2))
            start = None
    return groups


def find_panels(horiz: np.ndarray, vert: np.ndarray) -> list[tuple[int, int, int, int]]:
    """
    Panel rectangles (x, y, w, h). A flat carton layout is a grid: rows of
    flaps/panels separated by horizontal outlines, columns separated by
    vertical ones. Two outlines very close together are the gutter between
    neighbouring panels, not a panel.
    """
    h, w = horiz.shape
    xs = line_positions(vert, axis=0, min_fraction=0.10)
    ys = line_positions(horiz, axis=1, min_fraction=0.15)

    def cells(pos, size):
        return [(a, b) for a, b in zip(pos, pos[1:]) if b - a > 0.03 * size]

    return [(x0, y0, x1 - x0, y1 - y0) for (y0, y1) in cells(ys, h) for (x0, x1) in cells(xs, w)]


# ─── Ink analysis ─────────────────────────────────────────────────────────────

def colour_name(L: float, a: float, b: float) -> str:
    chroma = float(np.hypot(a, b))
    if chroma < 12:
        if L > 85:
            return "White board"
        return "Black" if L < 30 else "Grey"
    hue = float(np.degrees(np.arctan2(b, a))) % 360
    for limit, name in ((20, "Pink"), (50, "Red"), (75, "Orange"), (105, "Yellow"),
                        (170, "Green"), (230, "Cyan"), (300, "Blue"), (340, "Purple"), (360, "Pink")):
        if hue < limit:
            return name
    return "Colour"


def find_inks(clean: np.ndarray, compare_mask: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    """
    Group the flat (solid-colour) areas of the artwork into its main inks.
    Returns (label image: 0 = not an ink pixel, k = ink k), list of ink info).
    """
    lab = to_lab(clean)

    # Flat = low local variation in every LAB channel
    k = (7, 7)
    var = np.zeros(lab.shape[:2], np.float32)
    for c in range(3):
        mean = cv2.blur(lab[..., c], k)
        var += cv2.blur(lab[..., c] ** 2, k) - mean ** 2
    flat = (var < 12.0).astype(np.uint8) * 255
    candidates = cv2.erode(cv2.bitwise_and(flat, compare_mask), np.ones((5, 5), np.uint8)) > 0

    pixels = lab[candidates]
    if len(pixels) < config.INK_MIN_PIXELS:
        return np.zeros(clean.shape[:2], np.uint8), []

    rng = np.random.default_rng(0)
    sample = pixels[rng.choice(len(pixels), size=min(40000, len(pixels)), replace=False)]
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.2)
    _, _, centres = cv2.kmeans(sample.astype(np.float32), config.INK_CLUSTERS, None,
                               criteria, 4, cv2.KMEANS_PP_CENTERS)

    # Merge clusters that are really the same ink
    merged: list[np.ndarray] = []
    for c in centres:
        if all(np.linalg.norm(c - m) > 10 for m in merged):
            merged.append(c)
    centres = np.array(merged, np.float32)

    # Assign every candidate pixel to its nearest ink, if it is close enough
    dist = np.linalg.norm(pixels[:, None, :] - centres[None, :, :], axis=2)
    nearest = dist.argmin(axis=1)
    close = dist[np.arange(len(pixels)), nearest] < 12

    labels = np.zeros(clean.shape[:2], np.uint8)
    flat_labels = np.zeros(len(pixels), np.uint8)
    flat_labels[close] = nearest[close] + 1
    labels[candidates] = flat_labels

    inks, used_names = [], {}
    new_labels = np.zeros_like(labels)
    for i in range(len(centres)):
        sel = labels == i + 1
        count = int(sel.sum())
        if count < config.INK_MIN_PIXELS:
            continue
        L, a, b = np.median(lab[sel], axis=0)
        name = colour_name(L, a, b)
        used_names[name] = used_names.get(name, 0) + 1
        if used_names[name] > 1:
            name = f"{name} {used_names[name]}"
        ink_id = len(inks) + 1
        new_labels[sel] = ink_id
        bgr = np.median(clean[sel], axis=0)
        inks.append({
            "id": ink_id,
            "name": name,
            "is_board": name.startswith("White board"),
            "lab": [round(float(L), 2), round(float(a), 2), round(float(b), 2)],
            "hex": "#%02x%02x%02x" % (int(bgr[2]), int(bgr[1]), int(bgr[0])),
            "pixels": count,
        })
    inks.sort(key=lambda x: -x["pixels"])
    return new_labels, inks


# ─── Main ─────────────────────────────────────────────────────────────────────

def prepare_reference(design_path: str, out_dir: str, job_id: str) -> dict:
    """
    Build the reference folder `out_dir` from a design file (always rebuilt).
    `job_id` is a label for messages and meta.json. Returns the meta.
    """
    print(f"[Step 1] Preparing reference '{job_id}' from {design_path}")
    full = load_design(design_path)
    if max(full.shape[:2]) > 8000:   # keep memory sane on very large exports
        full, _ = resize_long_side(full, 8000)

    # 1. Find marks and the panel outline lines at full resolution (thin lines
    #    would fade out if we downscaled first)
    marks_full = detect_mark_colour(full)
    horiz_full, vert_full = detect_long_lines(detect_mark_colour(full, config.LINE_MIN_SAT))
    lines_full = cv2.bitwise_or(horiz_full, vert_full)
    marks_full = cv2.bitwise_or(marks_full, lines_full)

    ys, xs = np.nonzero(lines_full)
    if len(xs) == 0:
        print("[Step 1] WARNING: no dieline found — using the whole image as the sheet")
        x0, y0, x1, y1 = 0, 0, full.shape[1], full.shape[0]
    else:
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

    ticks_full = detect_dark_ticks(full, lines_full)
    marks_full = cv2.bitwise_or(marks_full, ticks_full)

    # 2. Crop to the sheet and drop to the working resolution
    crop = full[y0:y1, x0:x1]
    clean, scale = resize_long_side(crop, config.WORK_LONG_SIDE)
    size = (clean.shape[1], clean.shape[0])

    def shrink(mask):
        small = cv2.resize(mask[y0:y1, x0:x1].astype(np.float32), size, interpolation=cv2.INTER_AREA)
        return (small > 8).astype(np.uint8) * 255

    marks = shrink(marks_full)
    lines = shrink(lines_full)
    horiz = shrink(horiz_full)
    vert  = shrink(vert_full)

    # 3. Paint the marks out of the artwork (fills in from the surrounding colour)
    inpaint_mask = cv2.dilate(marks, np.ones((3, 3), np.uint8))
    clean = cv2.inpaint(clean, inpaint_mask, 3, cv2.INPAINT_TELEA)

    # 4. What to compare: inside the panels, away from marks and die-cut holes
    panels = find_panels(horiz, vert)
    panel_mask = np.zeros(clean.shape[:2], np.uint8)
    for (x, y, w, h) in panels:
        panel_mask[y:y + h, x:x + w] = 255
    if panel_mask.sum() < 0.4 * 255 * panel_mask.size:
        print(f"[Step 1] WARNING: panel detection found only {len(panels)} panel(s) — comparing the whole sheet")
        panel_mask[:] = 255
    inset = config.PANEL_INSET_PX
    panel_mask = cv2.erode(panel_mask, np.ones((2 * inset + 1, 2 * inset + 1), np.uint8))

    small_marks = cv2.bitwise_and(marks, cv2.bitwise_not(cv2.dilate(lines, np.ones((5, 5), np.uint8))))
    ignore = cv2.bitwise_or(marks, fill_closed_marks(small_marks))
    d = config.MARK_DILATE_PX
    ignore = cv2.dilate(ignore, np.ones((2 * d + 1, 2 * d + 1), np.uint8))
    compare_mask = cv2.bitwise_and(panel_mask, cv2.bitwise_not(ignore))

    # 5. Main inks
    ink_labels, inks = find_inks(clean, compare_mask)

    # 6. Save
    os.makedirs(out_dir, exist_ok=True)
    imwrite(os.path.join(out_dir, "reference.png"), clean)
    imwrite(os.path.join(out_dir, "compare_mask.png"), compare_mask)
    imwrite(os.path.join(out_dir, "ink_labels.png"), ink_labels)
    imwrite(os.path.join(out_dir, "marks_preview.jpg"),
            build_preview(crop, size, marks, compare_mask, panels), quality=88)
    stale = os.path.join(out_dir, "features.npz")
    if os.path.exists(stale):
        os.remove(stale)

    meta = {
        "job_id": job_id,
        "source": os.path.basename(design_path),
        "work_size": list(size),
        "crop_box": [int(x0), int(y0), int(x1), int(y1)],
        "panels": len(panels),
        "compare_fraction": round(float((compare_mask > 0).mean()), 3),
        "inks": inks,
    }
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"[Step 1] {len(panels)} panels, {meta['compare_fraction']:.0%} of sheet compared, "
          f"inks: {', '.join(i['name'] for i in inks)}")
    return meta


def build_preview(crop: np.ndarray, size, marks, compare_mask, panels) -> np.ndarray:
    """Original design with removed marks in red and ignored areas greyed out."""
    base = cv2.resize(crop, size, interpolation=cv2.INTER_AREA)
    grey = cv2.cvtColor(cv2.cvtColor(base, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    out = np.where(compare_mask[..., None] > 0, base, (grey * 0.45 + 140).astype(np.uint8))
    out[marks > 0] = (0, 0, 255)
    for (x, y, w, h) in panels:
        cv2.rectangle(out, (x, y), (x + w, y + h), (0, 170, 0), 2)
    return out


def load_reference(d: str) -> dict:
    """Load everything step 1 produced in reference folder `d`."""
    with open(os.path.join(d, "meta.json"), encoding="utf-8") as f:
        meta = json.load(f)
    return {
        "job_id": meta["job_id"],
        "dir": d,
        "meta": meta,
        "image": imread(os.path.join(d, "reference.png")),
        "compare_mask": imread(os.path.join(d, "compare_mask.png"), cv2.IMREAD_GRAYSCALE),
        "ink_labels": imread(os.path.join(d, "ink_labels.png"), cv2.IMREAD_GRAYSCALE),
    }
