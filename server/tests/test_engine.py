"""
Engine end to end on a synthetic carton (no customer artwork in the repository):
prepare a reference, then check a clean print, a smudged print and a different design.
Skipped when the engine's image libraries are not installed.
"""
import os

import pytest

cv2 = pytest.importorskip("cv2")
np = pytest.importorskip("numpy")
pytest.importorskip("skimage")

from app.engine.worker import check_task, prepare_task  # noqa: E402

MAGENTA = (200, 40, 200)  # BGR, hue ≈ 150 like the dielines on real designs
W, H = 2400, 1200
XS, YS = [100, 650, 1200, 1750, 2300], [100, 400, 1100]


def artwork(seed: int) -> np.ndarray:
    """A flat carton layout: white board, coloured shapes and text in a grid of panels."""
    rng = np.random.default_rng(seed)
    img = np.full((H, W, 3), 255, np.uint8)
    colours = [(30, 30, 200), (40, 160, 40), (200, 90, 30), (20, 180, 230), (40, 40, 40)]
    for (x0, x1) in zip(XS, XS[1:]):
        for (y0, y1) in zip(YS, YS[1:]):
            cv2.rectangle(img, (x0 + 20, y0 + 20), (x1 - 20, y0 + 70), colours[int(rng.integers(5))], -1)
            for _ in range(10):
                c = colours[int(rng.integers(5))]
                cx, cy = int(rng.integers(x0 + 60, x1 - 60)), int(rng.integers(y0 + 100, y1 - 50))
                if rng.random() < 0.5:
                    cv2.circle(img, (cx, cy), int(rng.integers(15, 45)), c, -1)
                else:
                    cv2.rectangle(img, (cx - 30, cy - 18), (cx + int(rng.integers(20, 60)), cy + 18), c, -1)
            cv2.putText(img, f"PV{int(rng.integers(100, 999))}", (x0 + 60, y1 - 60), cv2.FONT_HERSHEY_DUPLEX, 1.6,
                        colours[int(rng.integers(5))], 3, cv2.LINE_AA)
    return img


def with_dielines(img: np.ndarray) -> np.ndarray:
    out = img.copy()
    for x in XS:
        cv2.line(out, (x, YS[0]), (x, YS[-1]), MAGENTA, 3)
    for y in YS:
        cv2.line(out, (XS[0], y), (XS[-1], y), MAGENTA, 3)
    return out


def photographed(img: np.ndarray) -> np.ndarray:
    """The printed sheet as a phone sees it: perspective, uneven light, slight blur, noise."""
    src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    dst = np.float32([[90, 70], [W - 40, 120], [W - 110, H + 40], [60, H - 10]])
    photo = cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (W + 100, H + 150), borderValue=(90, 90, 90))
    light = np.linspace(0.88, 1.0, photo.shape[1], dtype=np.float32)[None, :, None]
    photo = np.clip(photo.astype(np.float32) * light, 0, 255).astype(np.uint8)
    photo = cv2.GaussianBlur(photo, (3, 3), 0)
    noise = np.random.default_rng(9).normal(0, 3, photo.shape).astype(np.float32)
    return np.clip(photo.astype(np.float32) + noise, 0, 255).astype(np.uint8)


@pytest.fixture(scope="module")
def reference(tmp_path_factory):
    d = tmp_path_factory.mktemp("engine")
    design = d / "design.png"
    cv2.imwrite(str(design), with_dielines(artwork(1)))
    out = prepare_task(str(design), str(d / "ref"), "TEST v1")
    return d, out


def check(d, img, name):
    path = d / f"{name}.jpg"
    cv2.imwrite(str(path), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return check_task(str(d / "ref"), str(path), str(d / f"out_{name}"), "normal")


def test_reference_finds_panels_and_removes_dielines(reference):
    d, out = reference
    meta = out["meta"]
    assert meta["panels"] >= 6
    assert 0.4 < meta["compare_fraction"] < 1
    assert os.path.exists(d / "ref" / "preview.jpg") and os.path.exists(d / "ref" / "clean.jpg")


def test_clean_print_passes(reference):
    d, _ = reference
    r = check(d, photographed(artwork(1)), "clean")
    assert r["verdict"] == "PASS", r["reasons"]
    assert r["coverage"] > 0.9
    assert set(r["images"]) == {"aligned", "overlay", "heatmap"}


def test_smudged_print_fails_with_a_defect(reference):
    d, _ = reference
    print_ = artwork(1)
    cv2.circle(print_, (900, 760), 45, (60, 60, 60), -1)   # dark smudge on a white area of a panel
    r = check(d, photographed(print_), "smudge")
    assert r["verdict"] == "FAIL"
    assert len(r["defects"]) >= 1
    assert r["defects"][0]["closeup"] == "defect_1.jpg"


def test_different_design_does_not_pass(reference):
    d, _ = reference
    r = check(d, photographed(artwork(2)), "other")
    assert r["verdict"] in ("FAIL", "RETAKE")
