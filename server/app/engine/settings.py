"""
Engine tuning values, unchanged from the print-qc-vision proof of concept.
File locations are not set here: the portal tells the engine where each design,
reference and photo lives (see app/lib/engine_runner.py).
"""

# PDF designs are rendered (first page) at this resolution.
PDF_DPI = 150

# Photos larger than this (long side, px) are scaled down before checking.
PHOTO_MAX_LONG_SIDE = 4000

# ─── REFERENCE PREPARATION (step 1) ───────────────────────────────────────────
# All comparison happens at this resolution (long side of the cropped sheet,
# in pixels). 3000 px over a ~1.5 m wide sheet is ~2 px per mm.
WORK_LONG_SIDE = 3000

# Non-printing marks (dielines, panel outlines, dimension labels, handle-hole
# circles, spec text) are drawn in MAGENTA on these designs. OpenCV hue runs
# 0-179: magenta measured at ~158, artwork red at ~179/0, artwork blue ~112-120.
# If a future design uses a different dieline colour, change this range.
MARK_HUE_RANGE = (145, 166)
MARK_MIN_SAT   = 30
MARK_MIN_VAL   = 70

# Panel outlines can be very faint hairlines (job001's are ~15% saturated), so
# the long-line search uses a looser saturation floor. Only long straight runs
# survive the line filter, so this does not pick up random noise.
LINE_MIN_SAT   = 10

# Extra pixels (at work resolution) ignored around every detected mark, so
# faint anti-aliased edges of the lines never get compared.
MARK_DILATE_PX = 3

# A magenta line counts as a panel outline if it is at least this fraction of
# the sheet's width (horizontal) or height (vertical).
PANEL_LINE_MIN_FRACTION = 0.06

# Pixels shaved off the inside of every panel before comparing — the die-cut
# and crease edges of the real board are never pixel-perfect.
PANEL_INSET_PX = 8

# Number of colour clusters used to find the main inks of a design.
INK_CLUSTERS = 8
# An ink needs at least this many flat pixels (work resolution) to be checked.
INK_MIN_PIXELS = 3000

# ─── ALIGNMENT (step 2) ───────────────────────────────────────────────────────
# Images are downscaled to these sizes for feature matching only.
ALIGN_REF_LONG_SIDE   = 2400
ALIGN_PHOTO_LONG_SIDE = 2000
SIFT_MAX_FEATURES     = 8000

# Lowe ratio test. Designs repeat panels (panel 1 = panel 3), so a match whose
# runner-up is a near-identical twin is kept as an extra candidate and RANSAC
# decides which twin is geometrically consistent.
RATIO_TEST       = 0.80
TWIN_DISTANCE    = 1.12   # candidates within 12% of the best distance are twins

# Fewer inliers than this = the photo does not show this artwork.
MIN_INLIERS = 40

# Fine sub-pixel refinement after the feature-based alignment.
ECC_REFINE = True

# ─── COMPARISON (step 3) ──────────────────────────────────────────────────────
# Every photo pixel is compared to the best-matching reference pixel within
# this radius, so 1-3 px alignment / lens error is not reported as a defect.
SHIFT_TOLERANCE_PX = 3

# Local colour difference (lightness weighted at half, see step3) above which a
# pixel is suspicious.
DEFECT_DELTA_E = 18.0

# Defects smaller than this (pixels at work resolution, ~2 px/mm) are ignored.
# 160 px is roughly a 6 x 6 mm blob.
DEFECT_MIN_AREA_PX = 160
DEFECT_OPEN_KERNEL = 5

# Average colour of each ink (CIEDE2000, after white balancing on the
# unprinted board). Above this the ink is reported as off-colour.
# Against the DESIGN FILE the limit is loose: a screen design can never be
# matched exactly by flexo ink on board seen through a phone camera.
INK_DELTA_E_FAIL = 15.0
# Against an approved MASTER SAMPLE (a photo of a known-good print saved for
# the job — same board, same camera) the limit can be tight.
INK_DELTA_E_FAIL_MASTER = 7.0

# Sensitivity presets selectable in the web UI / CLI: multipliers for
# (DEFECT_DELTA_E, DEFECT_MIN_AREA_PX). "low" = fewer false alarms (glare,
# rough board), "high" = catches smaller / fainter defects.
SENSITIVITY = {
    "low":    (1.35, 2.0),
    "normal": (1.0, 1.0),
    "high":   (0.8, 0.6),
}

# Fraction of the design that must be visible in the photo to give a verdict.
MIN_COVERAGE = 0.05

# If more than this fraction of the compared area differs, the photo is
# reported as the wrong artwork rather than a list of individual defects.
MISMATCH_AREA_FRACTION = 0.20

# NOTE ON CALIBRATION: the values above were tuned on simulated phone photos
# generated from job001-003 (see simulate.py / evaluate.py). Re-run
# evaluate.py and adjust after collecting real production-line photos.
