"""
Check one photo against one prepared reference: align (step 2) → compare (step 3).
Ported from the proof of concept's qc_pipeline.check_photo, with files written to
a folder the caller chooses instead of the PoC's outputs/ folders.
"""
from __future__ import annotations

import os
import time

import cv2
import numpy as np

from . import settings as config
from .align import AlignmentError, align, photo_features
from .compare import compare
from .imaging import imread, imwrite, resize_long_side
from .reference import load_reference

# A photo with at least this many SIFT points is sharp and detailed enough that,
# if it still matches nothing, the print itself is the problem (wrong artwork).
# Below it, the photo is too blurry / dark / far away to judge. Provisional:
# to be set from real photos during calibration.
SHARP_PHOTO_FEATURES = 800


def _save_preview(path: str, img: np.ndarray, long_side: int = 2400) -> str:
    small, _ = resize_long_side(img, long_side) if max(img.shape[:2]) > long_side else (img, 1.0)
    imwrite(path, small, quality=85)
    return os.path.basename(path)


def defect_closeup(ref_img: np.ndarray, aligned: np.ndarray, bbox, height: int = 220) -> np.ndarray:
    """Design | printed side by side around one defect."""
    x, y, w, h = bbox
    pad = max(40, int(0.6 * max(w, h)))
    H, W = ref_img.shape[:2]
    x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
    a, b = ref_img[y0:y1, x0:x1], aligned[y0:y1, x0:x1].copy()
    cv2.rectangle(b, (x - x0 - 4, y - y0 - 4), (x - x0 + w + 4, y - y0 + h + 4), (0, 0, 255), 2)
    scale = height / a.shape[0]
    size = (max(1, round(a.shape[1] * scale)), height)
    gap = np.full((height, 8, 3), 255, np.uint8)
    return np.hstack([cv2.resize(a, size, interpolation=cv2.INTER_CUBIC), gap,
                      cv2.resize(b, size, interpolation=cv2.INTER_CUBIC)])


def check_photo(ref_dir: str, photo_path: str, out_dir: str, sensitivity: str = "normal") -> dict:
    """
    Check one photo. Never raises for a bad photo: problems come back as verdict
    FAIL / RETAKE with reasons. Images are written to `out_dir`; the result names
    them relative to it (result["images"], defect["closeup"]).
    """
    t0 = time.time()
    ref = load_reference(ref_dir)
    os.makedirs(out_dir, exist_ok=True)

    photo = imread(photo_path)
    if max(photo.shape[:2]) > config.PHOTO_MAX_LONG_SIDE:
        photo, _ = resize_long_side(photo, config.PHOTO_MAX_LONG_SIDE)
    feats = photo_features(photo)

    result: dict = {"sensitivity": sensitivity, "photo_features": int(len(feats[0]))}
    try:
        al = align(ref, photo, feats)
        result["inliers"] = al["inliers"]
        result["refined"] = al["refined"]
        result.update(compare(ref, al["aligned"], al["valid"], sensitivity))
        aligned = al["aligned"]
    except AlignmentError:
        aligned = None
        result.update(inliers=0, defects=[], inks=[], coverage=0.0, ssim=None, match_failed=True)
        if len(feats[0]) >= SHARP_PHOTO_FEATURES:
            result.update(verdict="FAIL", reasons=[
                "This print does not match the approved design for this job. "
                "It may be the wrong artwork, or the wrong job number was chosen."])
        else:
            result.update(verdict="RETAKE", reasons=[
                "The photo is too blurry, dark or far away to compare. Take it again with the whole "
                "printed side in frame, in focus and evenly lit."])

    images: dict = {}
    if aligned is not None:
        images["aligned"] = _save_preview(os.path.join(out_dir, "aligned.jpg"), aligned)
        images["overlay"] = _save_preview(os.path.join(out_dir, "overlay.jpg"), result["overlay"])
        images["heatmap"] = _save_preview(os.path.join(out_dir, "heatmap.jpg"), result["heatmap"])
        for d in result["defects"][:12]:
            name = f"defect_{d['id']}.jpg"
            imwrite(os.path.join(out_dir, name), defect_closeup(ref["image"], aligned, d["bbox"]), quality=90)
            d["closeup"] = name
        h, w = aligned.shape[:2]
        result["reference_size"] = [int(w), int(h)]
    result["images"] = images
    result.pop("overlay", None)
    result.pop("heatmap", None)
    result["seconds"] = round(time.time() - t0, 1)
    print(f"==> {os.path.basename(photo_path)}: {result['verdict']} ({result['seconds']} s) " + " | ".join(result["reasons"]))
    return result
