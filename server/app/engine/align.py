"""
STEP 2: Line the phone photo up with the reference artwork.

Input:  a prepared reference (step 1) + a phone photo of the flat printed sheet
Output: the photo warped onto the reference's pixel grid, plus a mask of which
        reference pixels the photo actually covers.

How:
  1. SIFT finds distinctive points in both images and describes each one.
  2. Points are matched between the photo and the reference. Carton layouts
     repeat panels (panel 1 = panel 3), so a photo point often has TWO equally
     good partners in the reference. Instead of throwing those away (the usual
     ratio test would), both partners are kept as candidates.
  3. MAGSAC (a robust RANSAC) finds the single perspective transform that the
     largest set of matches agrees with â€” that picks the right twin and drops
     wrong matches.
  4. ECC refinement nudges the result to sub-pixel accuracy.

If too few matches agree, the photo does not show this artwork (or is too
blurry / dark to use) â€” reported as "no match", which is also how a box
printed with the WRONG artwork gets caught.
"""

import os

import cv2
import numpy as np

from . import settings as config
from .imaging import imread, imwrite, resize_long_side


class AlignmentError(Exception):
    pass


_sift = None
_feature_cache: dict[str, tuple] = {}


def sift():
    global _sift
    if _sift is None:
        _sift = cv2.SIFT_create(nfeatures=config.SIFT_MAX_FEATURES)
    return _sift


def _detect(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    # CLAHE evens out contrast so dim or glary photos still give keypoints
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    kps, des = sift().detectAndCompute(gray, None)
    if des is None or len(kps) < 10:
        return np.zeros((0, 2), np.float32), np.zeros((0, 128), np.float32)
    return np.float32([k.pt for k in kps]), des


def reference_features(ref: dict) -> tuple[np.ndarray, np.ndarray, float]:
    """SIFT points of a reference (cached in memory and in <reference folder>/features.npz).
    Points are returned in WORK-resolution reference coordinates."""
    key = os.path.abspath(ref["dir"])
    if key in _feature_cache:
        return _feature_cache[key]
    path = os.path.join(ref["dir"], "features.npz")
    if os.path.exists(path):
        data = np.load(path)
        result = (data["pts"], data["des"], float(data["scale"]))
    else:
        small, scale = resize_long_side(ref["image"], config.ALIGN_REF_LONG_SIDE)
        pts, des = _detect(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
        pts = pts / scale
        np.savez_compressed(path, pts=pts, des=des, scale=scale)
        result = (pts, des, scale)
    if len(_feature_cache) > 64:          # a worker may see many references over time
        _feature_cache.clear()
    _feature_cache[key] = result
    return result


def photo_features(photo: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """SIFT points of a photo, in FULL photo coordinates."""
    small, scale = resize_long_side(photo, config.ALIGN_PHOTO_LONG_SIDE)
    pts, des = _detect(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
    return pts / scale, des


def _candidate_pairs(des_q: np.ndarray, des_t: np.ndarray) -> list[tuple[int, int]]:
    """
    Ratio test that tolerates repeated panels: the best match plus any 'twins'
    (nearly as good) are kept, as long as the first non-twin is clearly worse.
    """
    if len(des_q) < 2 or len(des_t) < 4:
        return []
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    pairs = []
    for ms in matcher.knnMatch(des_q, des_t, k=4):
        if len(ms) < 2:
            continue
        best = ms[0].distance
        twins = [m for m in ms if m.distance <= best * config.TWIN_DISTANCE]
        others = [m for m in ms if m.distance > best * config.TWIN_DISTANCE]
        if len(twins) > 3 or (others and best >= config.RATIO_TEST * others[0].distance):
            continue
        pairs += [(m.queryIdx, m.trainIdx) for m in twins]
    return pairs


def estimate_hypotheses(photo_pts, photo_des, ref_pts, ref_des,
                        max_hypotheses: int = 4) -> tuple[list[tuple[np.ndarray, int]], int]:
    """
    Candidate photo -> reference(work) homographies, best supported first.

    With repeated panels a photo of panels 3-4 is equally consistent with
    panels 1-2: both placements get their own group of matches. After the
    best placement is found its matches are removed and the search repeats,
    so every plausible placement is returned for pixel-level verification.
    Returns ([(H, inliers), ...], candidate_matches).
    """
    if len(photo_des) < 10 or len(ref_des) < 10:
        return [], 0
    pairs = set(_candidate_pairs(photo_des, ref_des))
    pairs |= {(p, r) for (r, p) in _candidate_pairs(ref_des, photo_des)}
    if len(pairs) < config.MIN_INLIERS:
        return [], len(pairs)
    pairs = list(pairs)
    src = np.float32([photo_pts[p] for p, _ in pairs]).reshape(-1, 1, 2)
    dst = np.float32([ref_pts[r] for _, r in pairs]).reshape(-1, 1, 2)

    remaining = np.ones(len(pairs), bool)
    hypotheses = []
    for _ in range(max_hypotheses):
        idx = np.nonzero(remaining)[0]
        if len(idx) < config.MIN_INLIERS:
            break
        H, mask = cv2.findHomography(src[idx], dst[idx], cv2.USAC_MAGSAC, ransacReprojThreshold=6.0,
                                     maxIters=20000, confidence=0.999)
        if H is None:
            break
        inliers = int(mask.sum())
        if inliers < config.MIN_INLIERS or (hypotheses and inliers < 0.25 * hypotheses[0][1]):
            break
        hypotheses.append((H, inliers))
        remaining[idx[mask.ravel() > 0]] = False
    return hypotheses, len(pairs)


def estimate_homography(photo_pts, photo_des, ref_pts, ref_des) -> tuple[np.ndarray | None, int, int]:
    """Best-supported photo -> reference homography. Returns (H, inliers, candidate_matches)."""
    hypotheses, n_pairs = estimate_hypotheses(photo_pts, photo_des, ref_pts, ref_des, max_hypotheses=1)
    if not hypotheses:
        return None, 0, n_pairs
    return hypotheses[0][0], hypotheses[0][1], n_pairs


def _pixel_agreement(ref: dict, photo_gray: np.ndarray, H: np.ndarray, scale: float = 0.25) -> float:
    """
    How well the photo, warped by H, matches the design pixel-wise (normalised
    cross-correlation of edge strength, so lighting and ink dullness do not
    matter). Used to choose between twin placements.
    """
    S = np.diag([scale, scale, 1.0])
    ref_small = cv2.resize(cv2.cvtColor(ref["image"], cv2.COLOR_BGR2GRAY), None, fx=scale, fy=scale,
                           interpolation=cv2.INTER_AREA)
    h, w = ref_small.shape
    warped = cv2.warpPerspective(cv2.GaussianBlur(photo_gray, (0, 0), 1.0 / scale / 2), S @ H, (w, h))
    covered = cv2.warpPerspective(np.full(photo_gray.shape, 255, np.uint8), S @ H, (w, h),
                                  flags=cv2.INTER_NEAREST)
    mask = cv2.resize(ref["compare_mask"], (w, h), interpolation=cv2.INTER_NEAREST)
    sel = (cv2.erode(covered, np.ones((5, 5), np.uint8)) > 0) & (mask > 0)
    if sel.sum() < 500:
        return -1.0

    def edges(img):
        img = img.astype(np.float32)
        return cv2.magnitude(cv2.Sobel(img, cv2.CV_32F, 1, 0), cv2.Sobel(img, cv2.CV_32F, 0, 1))

    a, b = edges(ref_small)[sel], edges(warped)[sel]
    a, b = a - a.mean(), b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-6))


def _homography_is_sane(H: np.ndarray, photo_shape, ref_shape) -> bool:
    """Reject twisted / degenerate warps (they happen when matches are junk)."""
    h, w = photo_shape[:2]
    corners = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2)
    quad = cv2.perspectiveTransform(corners, H).reshape(-1, 2)
    if not cv2.isContourConvex(quad.astype(np.float32)):
        return False
    area = cv2.contourArea(quad)
    ref_area = ref_shape[0] * ref_shape[1]
    return 0.005 * ref_area < area < 50 * ref_area


def _refine_ecc(ref_gray: np.ndarray, aligned_gray: np.ndarray, mask: np.ndarray) -> np.ndarray | None:
    """Small homography W so that aligned(W x) ~ ref(x). Runs at half resolution."""
    s = 0.5
    r = cv2.resize(ref_gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    a = cv2.resize(aligned_gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    m = cv2.resize(mask, None, fx=s, fy=s, interpolation=cv2.INTER_NEAREST)
    W = np.eye(3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5)
    try:
        _, W = cv2.findTransformECC(r, a, W, cv2.MOTION_HOMOGRAPHY, criteria, m, 5)
    except cv2.error:
        return None
    S = np.diag([1 / s, 1 / s, 1]).astype(np.float64)
    W = S @ W.astype(np.float64) @ np.linalg.inv(S)
    # Refinement should only ever be a small correction
    if np.abs(W[:2, 2]).max() > 25 or np.abs(W[:2, :2] - np.eye(2)).max() > 0.03:
        return None
    return W


def align(ref: dict, photo: np.ndarray, photo_feats=None) -> dict:
    """
    Align a photo (BGR, full resolution) to a prepared reference.

    Returns dict with:
      aligned   photo warped onto the reference grid (BGR, reference size)
      valid     uint8 mask, 255 where the photo covers the reference
      inliers   number of matches agreeing with the transform
      matches   number of candidate matches
      refined   whether ECC refinement was applied
      H         3x3 photo -> reference homography
    Raises AlignmentError if the photo does not match this artwork.
    """
    ref_img = ref["image"]
    ref_pts, ref_des, _ = reference_features(ref)
    p_pts, p_des = photo_feats if photo_feats is not None else photo_features(photo)

    hypotheses, n_matches = estimate_hypotheses(p_pts, p_des, ref_pts, ref_des)
    hypotheses = [(H, n) for H, n in hypotheses if _homography_is_sane(H, photo.shape, ref_img.shape)]
    inliers = hypotheses[0][1] if hypotheses else 0
    print(f"[Step 2] {ref['job_id']}: {n_matches} candidate matches, {inliers} inliers, "
          f"{len(hypotheses)} placement(s)")
    if not hypotheses:
        raise AlignmentError(
            f"Photo does not match artwork '{ref['job_id']}' "
            f"({inliers} matching features, need {config.MIN_INLIERS})."
        )

    H = hypotheses[0][0]
    if len(hypotheses) > 1:   # repeated panels: let the pixels decide which placement is right
        photo_gray = cv2.cvtColor(photo, cv2.COLOR_BGR2GRAY)
        scores = [_pixel_agreement(ref, photo_gray, Hc) for Hc, _ in hypotheses]
        best = int(np.argmax(scores))
        print(f"[Step 2] Placement scores: {', '.join(f'{s:.3f}' for s in scores)} -> #{best + 1}")
        H, inliers = hypotheses[best]

    h, w = ref_img.shape[:2]
    aligned = cv2.warpPerspective(photo, H, (w, h), flags=cv2.INTER_LINEAR)
    valid = cv2.warpPerspective(np.full(photo.shape[:2], 255, np.uint8), H, (w, h), flags=cv2.INTER_NEAREST)

    refined = False
    if config.ECC_REFINE:
        ref_gray = cv2.cvtColor(ref_img, cv2.COLOR_BGR2GRAY)
        al_gray = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
        ecc_mask = cv2.erode(cv2.bitwise_and(valid, ref["compare_mask"]), np.ones((15, 15), np.uint8))
        W = _refine_ecc(ref_gray, al_gray, ecc_mask)
        if W is not None:
            H = np.linalg.inv(W) @ H
            aligned = cv2.warpPerspective(photo, H, (w, h), flags=cv2.INTER_LINEAR)
            valid = cv2.warpPerspective(np.full(photo.shape[:2], 255, np.uint8), H, (w, h),
                                        flags=cv2.INTER_NEAREST)
            refined = True

    valid = cv2.erode(valid, np.ones((11, 11), np.uint8))
    return {"aligned": aligned, "valid": valid, "inliers": inliers, "matches": n_matches,
            "refined": refined, "H": H}


def identify(library: dict[str, dict], photo: np.ndarray, photo_feats=None) -> list[tuple[str, int]]:
    """
    Which artwork in the library is this photo of? Returns [(job_id, inliers)]
    sorted best first. Used to say "this is actually job002" on a mismatch.
    """
    p_pts, p_des = photo_feats if photo_feats is not None else photo_features(photo)
    scores = []
    for job_id, ref in library.items():
        ref_pts, ref_des, _ = reference_features(ref)
        H, inliers, _ = estimate_homography(p_pts, p_des, ref_pts, ref_des)
        if H is None or not _homography_is_sane(H, photo.shape, ref["image"].shape):
            inliers = 0
        scores.append((job_id, inliers))
    return sorted(scores, key=lambda s: -s[1])
