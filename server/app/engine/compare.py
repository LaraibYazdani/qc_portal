"""
STEP 3: Compare the aligned photo with the reference and decide PASS / FAIL.

Three checks, each with its own result:

  A) DEFECTS — local print faults: smudges, ink voids, missing text/logo,
     wrong or resized elements, scratches. How:
       1. White-balance the photo on the unprinted board, with a smooth
          correction field so uneven lighting across the sheet is removed.
       2. Learn the overall "design colour -> photo colour" mapping from the
          whole sheet (printed board is always duller than the screen design,
          and phones add their own processing). This mapping is the same
          everywhere, so it does not hide local faults.
       3. Compare every photo pixel with the best-matching mapped design
          pixel within a few pixels (absorbs small alignment / lens error).
       4. Keep only solid blobs above a minimum size -> numbered defects.

  B) INK COLOUR — the average colour of each main ink (found in step 1),
     after white-balancing, as a CIEDE2000 difference. Compared against the
     approved master sample if one has been saved for the job, otherwise
     against the design file itself.

  C) COVERAGE — how much of the design the photo shows (info only, unless it
     is too little to judge).
"""

import json
import os

import cv2
import numpy as np
from skimage.color import deltaE_ciede2000
from skimage.metrics import structural_similarity

from . import settings as config
from .imaging import to_lab


# ─── Lighting ─────────────────────────────────────────────────────────────────

def _poly_terms(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], axis=1)


def white_balance(ref: np.ndarray, photo: np.ndarray, region: np.ndarray) -> tuple[np.ndarray, str]:
    """
    Make the unprinted board in the photo as white as it is in the design.
    Uses a smooth per-channel gain field (2nd-order polynomial over the sheet)
    fitted on board pixels, so a lighting gradient across a 1.5 m sheet is
    corrected too. Ink colour errors are NOT corrected away, because only
    the board is used to fit.
    """
    h, w = ref.shape[:2]
    rmin, rmax = ref.min(axis=2), ref.max(axis=2)
    board = (region > 0) & (rmin >= 232) & (rmax.astype(np.int16) - rmin <= 14)
    board = cv2.erode(board.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    ys, xs = np.nonzero(board)

    photo_f = photo.astype(np.float32)
    if len(ys) >= 4000:
        rng = np.random.default_rng(1)
        pick = rng.choice(len(ys), size=min(40000, len(ys)), replace=False)
        ys, xs = ys[pick], xs[pick]
        A = _poly_terms(xs / w, ys / h)
        gx, gy = np.meshgrid(np.linspace(0, 1, w // 8), np.linspace(0, 1, h // 8))
        grid = _poly_terms(gx.ravel(), gy.ravel())
        gain = np.empty((h, w, 3), np.float32)
        for c in range(3):
            target = ref[ys, xs, c].astype(np.float32)
            observed = np.maximum(photo_f[ys, xs, c], 1.0)
            g = target / observed
            keep = np.ones(len(g), bool)
            for _ in range(2):                       # robust: drop smudged/odd board pixels
                coef, *_ = np.linalg.lstsq(A[keep], g[keep], rcond=None)
                resid = g - A @ coef
                mad = np.median(np.abs(resid[keep])) + 1e-6
                keep = np.abs(resid) < 3.0 * 1.4826 * mad
            field = (grid @ coef).reshape(gy.shape).astype(np.float32)
            gain[..., c] = cv2.resize(field, (w, h), interpolation=cv2.INTER_LINEAR)
        gain = np.clip(gain, 0.3, 4.0)
        method = f"board white-balance ({len(ys)} px)"
    else:
        # Too little bare board visible: fall back to one gain per channel
        sel = region > 0
        gain = np.ones(3, np.float32)
        for c in range(3):
            p = np.percentile(photo_f[..., c][sel], 98)
            r = np.percentile(ref[..., c][sel].astype(np.float32), 98)
            gain[c] = np.clip(r / max(p, 1.0), 0.3, 4.0)
        method = "global white-balance (little bare board visible)"

    return np.clip(photo_f * gain, 0, 255).astype(np.uint8), method


# ─── Colour mapping ───────────────────────────────────────────────────────────

def _colour_terms(lab: np.ndarray) -> np.ndarray:
    L, a, b = lab[:, 0] / 100.0, lab[:, 1] / 100.0, lab[:, 2] / 100.0
    return np.stack([np.ones_like(L), L, a, b, L * L, a * a, b * b, L * a, L * b, a * b], axis=1)


def fit_colour_mapping(ref_lab: np.ndarray, photo_lab: np.ndarray, sample_mask: np.ndarray) -> np.ndarray:
    """Least-squares (robust) quadratic map: design LAB -> photo LAB. Returns 10x3 coefficients."""
    ys, xs = np.nonzero(sample_mask)
    rng = np.random.default_rng(2)
    pick = rng.choice(len(ys), size=min(60000, len(ys)), replace=False)
    src, dst = ref_lab[ys[pick], xs[pick]], photo_lab[ys[pick], xs[pick]]
    A = _colour_terms(src)
    keep = np.ones(len(src), bool)
    for _ in range(3):
        coef, *_ = np.linalg.lstsq(A[keep], dst[keep], rcond=None)
        err = np.linalg.norm(dst - A @ coef, axis=1)
        keep = err < max(3.0 * np.median(err[keep]), 4.0)
    return coef.astype(np.float32)


def apply_colour_mapping(ref_lab: np.ndarray, coef: np.ndarray) -> np.ndarray:
    h, w = ref_lab.shape[:2]
    flat = ref_lab.reshape(-1, 3)
    out = np.empty_like(flat)
    step = 500_000
    for i in range(0, len(flat), step):
        out[i:i + step] = _colour_terms(flat[i:i + step]) @ coef
    out[:, 0] = np.clip(out[:, 0], 0, 100)
    return out.reshape(h, w, 3)


# ─── Defects ──────────────────────────────────────────────────────────────────

def tolerant_difference(ref_lab: np.ndarray, photo_lab: np.ndarray, radius: int) -> np.ndarray:
    """
    Per-pixel colour difference to the closest-matching reference pixel within
    `radius` px. Lightness counts half (paper texture, flutes and glare mostly
    change lightness, real defects change colour as well).
    """
    weights = np.float32([0.5, 1.0, 1.0])
    ref_w = np.ascontiguousarray(ref_lab * weights)
    ph_w = np.ascontiguousarray(photo_lab * weights)
    pad = cv2.copyMakeBorder(ref_w, radius, radius, radius, radius, cv2.BORDER_REPLICATE)
    h, w = ref_lab.shape[:2]
    best = np.full((h, w), np.inf, np.float32)
    channel_sum = np.ones((1, 3), np.float32)
    # OpenCV ops (multi-threaded) and squared distances; one sqrt at the end
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius + 1:
                continue
            shifted = pad[radius + dy: radius + dy + h, radius + dx: radius + dx + w]
            diff = cv2.subtract(ph_w, shifted)
            sq = cv2.transform(cv2.multiply(diff, diff), channel_sum)
            best = cv2.min(best, sq)
    return cv2.sqrt(best)


def symmetric_difference(ref_lab: np.ndarray, photo_lab: np.ndarray, radius: int) -> np.ndarray:
    """
    Worst of both directions:
      photo -> design  catches things printed that should not be there
                       (smudges, extra ink, wrong colour)
      design -> photo  catches things in the design missing from the print —
                       especially thin text and lines, which the first
                       direction alone lets through (a red pixel where white
                       text should be still finds red design pixels nearby)
    """
    # Both directions look at the same pixel pairs (photo x vs design x+d), so
    # each squared distance is computed once and used twice:
    #   photo->design: best for photo pixel x      over all shifts d
    #   design->photo: best for design pixel x+d   over all shifts d
    weights = np.float32([0.5, 1.0, 1.0])
    ref_w = np.ascontiguousarray(ref_lab * weights)
    ph_w = np.ascontiguousarray(photo_lab * weights)
    r = radius
    pad = cv2.copyMakeBorder(ref_w, r, r, r, r, cv2.BORDER_REPLICATE)
    h, w = ref_lab.shape[:2]
    fwd = np.full((h, w), np.inf, np.float32)
    rev = np.full((h + 2 * r, w + 2 * r), np.inf, np.float32)
    channel_sum = np.ones((1, 3), np.float32)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r + 1:
                continue
            shifted = pad[r + dy: r + dy + h, r + dx: r + dx + w]
            diff = cv2.subtract(ph_w, shifted)
            sq = cv2.transform(cv2.multiply(diff, diff), channel_sum)
            fwd = cv2.min(fwd, sq)
            target = rev[r + dy: r + dy + h, r + dx: r + dx + w]
            np.minimum(target, sq, out=target)
    return cv2.sqrt(np.maximum(fwd, rev[r:r + h, r:r + w]))


def find_defects(diff: np.ndarray, region: np.ndarray, ref_lab_mapped: np.ndarray,
                 photo_lab: np.ndarray, sensitivity: str = "normal") -> tuple[list[dict], np.ndarray]:
    de_mult, area_mult = config.SENSITIVITY.get(sensitivity, (1.0, 1.0))
    min_area = config.DEFECT_MIN_AREA_PX * area_mult
    bad = ((diff > config.DEFECT_DELTA_E * de_mult) & (region > 0)).astype(np.uint8) * 255
    k = config.DEFECT_OPEN_KERNEL
    bad = cv2.morphologyEx(bad, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    bad = cv2.morphologyEx(bad, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))

    n, labels, stats, _ = cv2.connectedComponentsWithStats(bad, connectivity=8)
    defects = []
    keep = np.zeros_like(bad)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_area:
            continue
        sel = labels == i
        keep[sel] = 255
        dL = float(np.mean(photo_lab[..., 0][sel] - ref_lab_mapped[..., 0][sel]))
        if dL > 12:
            kind = "Missing / faded print"
        elif dL < -12:
            kind = "Smudge / extra ink"
        else:
            kind = "Wrong colour / element"
        defects.append({
            "bbox": [int(x), int(y), int(w), int(h)],
            "area_px": int(area),
            "severity": round(float(diff[sel].mean()), 1),
            "type": kind,
        })
    defects.sort(key=lambda d: -d["area_px"])
    for i, d in enumerate(defects, 1):
        d["id"] = i
    return defects, keep


# ─── Inks ─────────────────────────────────────────────────────────────────────

def master_path(ref: dict) -> str:
    return os.path.join(ref["dir"], "master_inks.json")


def load_master(ref: dict) -> dict | None:
    path = master_path(ref)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def measure_inks(ref: dict, photo_lab: np.ndarray, region: np.ndarray) -> dict[int, dict]:
    """Median photo colour of every ink visible in the photo, keyed by ink id."""
    out = {}
    labels = ref["ink_labels"]
    for ink in ref["meta"]["inks"]:
        sel = (labels == ink["id"]) & (region > 0)
        n = int(sel.sum())
        if n < config.INK_MIN_PIXELS // 4:
            continue
        out[ink["id"]] = {"lab": np.median(photo_lab[sel], axis=0).tolist(), "pixels": n}
    return out


def check_inks(ref: dict, measured: dict[int, dict], master: dict | None) -> list[dict]:
    results = []
    for ink in ref["meta"]["inks"]:
        if ink["is_board"]:
            continue
        m = measured.get(ink["id"])
        target_lab = ink["lab"]
        source = "design"
        if master and str(ink["id"]) in master["inks"]:
            target_lab = master["inks"][str(ink["id"])]["lab"]
            source = "master"
        entry = {"name": ink["name"], "hex": ink["hex"], "target": source}
        if m is None:
            entry.update(status="NOT VISIBLE", delta_e=None, photo_hex=None, note="not in photo")
            results.append(entry)
            continue
        t = np.float32(target_lab).reshape(1, 1, 3)
        p = np.float32(m["lab"]).reshape(1, 1, 3)
        de = float(deltaE_ciede2000(t, p)[0, 0])
        limit = config.INK_DELTA_E_FAIL_MASTER if source == "master" else config.INK_DELTA_E_FAIL
        dL = m["lab"][0] - target_lab[0]
        note = "lighter" if dL > 4 else "darker" if dL < -4 else "hue / strength shift"
        lab_px = np.float32(m["lab"]).reshape(1, 1, 3)
        bgr = cv2.cvtColor(lab_px, cv2.COLOR_LAB2BGR)[0, 0]
        bgr = np.clip(bgr * 255, 0, 255).astype(int)
        entry.update(
            status="PASS" if de <= limit else "FAIL",
            delta_e=round(de, 1),
            limit=limit,
            photo_hex="#%02x%02x%02x" % (bgr[2], bgr[1], bgr[0]),
            note="" if de <= limit else note,
        )
        results.append(entry)
    return results


# ─── Visuals ──────────────────────────────────────────────────────────────────

def build_overlay(aligned: np.ndarray, valid: np.ndarray, defects: list[dict]) -> np.ndarray:
    out = aligned.copy()
    out[valid == 0] = (out[valid == 0] * 0.25).astype(np.uint8)
    thick = max(3, aligned.shape[1] // 600)
    for d in defects:
        x, y, w, h = d["bbox"]
        pad = 10
        cv2.rectangle(out, (x - pad, y - pad), (x + w + pad, y + h + pad), (0, 0, 255), thick)
        label = str(d["id"])
        scale = max(0.9, aligned.shape[1] / 2500)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, 2)
        ty = max(y - pad - 6, th + 4)
        cv2.rectangle(out, (x - pad, ty - th - 6), (x - pad + tw + 10, ty + 4), (0, 0, 255), -1)
        cv2.putText(out, label, (x - pad + 5, ty), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), 2,
                    cv2.LINE_AA)
    return out


def build_heatmap(aligned: np.ndarray, diff: np.ndarray, region: np.ndarray) -> np.ndarray:
    norm = np.clip(diff / (config.DEFECT_DELTA_E * 1.5) * 255, 0, 255).astype(np.uint8)
    colour = cv2.applyColorMap(norm, cv2.COLORMAP_INFERNO)
    grey = cv2.cvtColor(cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    out = cv2.addWeighted(grey, 0.35, colour, 0.65, 0)
    out[region == 0] = (grey[region == 0] * 0.3).astype(np.uint8)
    return out


# ─── Main ─────────────────────────────────────────────────────────────────────

def compare(ref: dict, aligned: np.ndarray, valid: np.ndarray, sensitivity: str = "normal") -> dict:
    """
    Run all checks. `ref` comes from step1.load_reference(), `aligned` and
    `valid` from step2.align(). `sensitivity` is a key of config.SENSITIVITY.
    Returns a results dict (scores, verdict, defect list, ink table, and the
    overlay/heatmap images).
    """
    ref_img = ref["image"]
    compare_mask = ref["compare_mask"]
    region = cv2.bitwise_and(compare_mask, valid)
    coverage = float((region > 0).sum()) / max(1, int((compare_mask > 0).sum()))

    result = {"coverage": round(coverage, 3), "defects": [], "inks": [], "ssim": None}
    if coverage < config.MIN_COVERAGE:
        result.update(verdict="RETAKE", reasons=[f"Photo shows only {coverage:.0%} of the design."],
                      overlay=build_overlay(aligned, valid, []), heatmap=aligned.copy())
        return result

    # Work only inside the bounding box of the visible region (faster)
    ys, xs = np.nonzero(region)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    box = (slice(y0, y1), slice(x0, x1))

    balanced, wb_method = white_balance(ref_img[box], aligned[box], region[box])
    print(f"[Step 3] Lighting: {wb_method}")

    blur = lambda im: cv2.GaussianBlur(im, (0, 0), 1.2)
    ref_lab = to_lab(blur(ref_img[box]))
    ph_lab = to_lab(blur(balanced))
    reg = region[box]

    # A) Defects
    flat_sample = (reg > 0) & (cv2.erode(compare_mask[box], np.ones((7, 7), np.uint8)) > 0)
    coef = fit_colour_mapping(ref_lab, ph_lab, flat_sample)
    mapped = apply_colour_mapping(ref_lab, coef)
    diff_box = symmetric_difference(mapped, ph_lab, config.SHIFT_TOLERANCE_PX)
    diff_box[reg == 0] = 0
    defects, defect_mask_box = find_defects(diff_box, reg, mapped, ph_lab, sensitivity)
    for d in defects:
        d["bbox"][0] += int(x0)
        d["bbox"][1] += int(y0)
    defect_fraction = float((defect_mask_box > 0).sum()) / max(1, int((reg > 0).sum()))

    # Similarity score (info only) — SSIM of the colour-mapped design vs photo
    g_ref = cv2.cvtColor(cv2.cvtColor(mapped, cv2.COLOR_LAB2BGR), cv2.COLOR_BGR2GRAY)
    g_ph = cv2.cvtColor(cv2.cvtColor(ph_lab, cv2.COLOR_LAB2BGR), cv2.COLOR_BGR2GRAY)
    small = lambda im: cv2.resize(im, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    _, ssim_map = structural_similarity(small(g_ref), small(g_ph), data_range=1.0, full=True)
    ssim_score = float(ssim_map[small(reg.astype(np.float32)) > 0.5].mean())

    # B) Inks
    region_full_lab = np.zeros(ref_img.shape[:2] + (3,), np.float32)
    region_full_lab[box] = ph_lab
    measured = measure_inks(ref, region_full_lab, region)
    inks = check_inks(ref, measured, load_master(ref))

    # Verdict
    reasons = []
    if defect_fraction > config.MISMATCH_AREA_FRACTION:
        reasons.append(f"Artwork mismatch: {defect_fraction:.0%} of the visible print differs from the design.")
    elif defects:
        reasons.append(f"{len(defects)} print defect(s) found.")
    bad_inks = [i for i in inks if i["status"] == "FAIL"]
    if bad_inks:
        reasons.append("Ink colour off: " + ", ".join(f"{i['name']} (ΔE {i['delta_e']})" for i in bad_inks))
    verdict = "FAIL" if reasons else "PASS"

    diff_full = np.zeros(ref_img.shape[:2], np.float32)
    diff_full[box] = diff_box
    result.update(
        verdict=verdict,
        reasons=reasons or ["No defects found and all inks within tolerance."],
        defects=defects,
        defect_fraction=round(defect_fraction, 4),
        inks=inks,
        ink_measurements=measured,
        ssim=round(ssim_score, 4),
        lighting=wb_method,
        overlay=build_overlay(aligned, valid, defects),
        heatmap=build_heatmap(aligned, diff_full, region),
    )
    print(f"[Step 3] Verdict {verdict}: {len(defects)} defects, "
          f"{len(bad_inks)} inks off, coverage {coverage:.0%}, similarity {ssim_score:.3f}")
    return result
