"""
All file access goes through here, so moving to another storage backend later
means changing only this module.

Layout for new uploads (phase 1 files stay at uploads/<JOB>.<ext>):
  uploads/<COMPANY>/<JOB>/v<N>/original.<ext>   untouched upload (what the QC engine reads)
  uploads/<COMPANY>/<JOB>/v<N>/design.<ext>     compressed copy shown in the portal
"""
from __future__ import annotations

import hashlib
import io
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageCms

from ..config import UPLOAD_ROOT

Image.MAX_IMAGE_PIXELS = None  # print designs are large; uploads are limited to 20 MB anyway
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)


@dataclass
class StoredDesign:
    file_path: str      # public URL of the display copy, e.g. /uploads/BSPL-CORR/264N1054/v2/design.jpg
    original_path: str  # public URL of the untouched upload
    sha256: str
    size: int


def safe_segment(value: str) -> str:
    """Folder-safe version of a job number or company code."""
    return re.sub(r"^_+|_+$", "", re.sub(r"[^A-Za-z0-9_-]+", "_", value.strip())) or "unnamed"


def _extension(mime: str, original_name: str) -> str:
    return {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}.get(mime) \
        or (Path(original_name).suffix.lower() or ".bin")


def _to_srgb(im: Image.Image) -> Image.Image:
    """CMYK artwork (common from pre-press) → sRGB for the screen, using its embedded profile when there is one."""
    if im.mode == "CMYK":
        icc = im.info.get("icc_profile")
        if icc:
            try:
                src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
                return ImageCms.profileToProfile(im, src, ImageCms.createProfile("sRGB"), outputMode="RGB")
            except Exception:  # noqa: BLE001
                pass
        return im.convert("RGB")
    if im.mode not in ("RGB", "L"):
        return im.convert("RGB")
    return im


def store_design_version(buffer: bytes, mime: str, original_name: str, company_code: str,
                         job_number: str, version_no: int) -> StoredDesign:
    rel_dir = f"{safe_segment(company_code)}/{safe_segment(job_number)}/v{version_no}"
    abs_dir = UPLOAD_ROOT / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    original = f"original{_extension(mime, original_name)}"
    (abs_dir / original).write_bytes(buffer)

    # Display copy: same compression phase 1 used, so pages stay as fast as before
    display = original
    if mime == "image/jpeg":
        display = "design.jpg"
        with Image.open(io.BytesIO(buffer)) as im:
            _to_srgb(im).save(abs_dir / display, "JPEG", quality=88)
    elif mime == "image/png":
        display = "design.png"
        with Image.open(io.BytesIO(buffer)) as im:
            im.save(abs_dir / display, "PNG", optimize=True, compress_level=9)

    return StoredDesign(
        file_path=f"/uploads/{rel_dir}/{display}",
        original_path=f"/uploads/{rel_dir}/{original}",
        sha256=hashlib.sha256(buffer).hexdigest(),
        size=len(buffer),
    )


def discard_stored_design(stored: StoredDesign) -> None:
    """Remove a version folder written moments ago, when the database insert then failed."""
    try:
        rel = stored.original_path.removeprefix("/uploads/")
        shutil.rmtree((UPLOAD_ROOT / rel).parent, ignore_errors=True)
    except Exception:  # noqa: BLE001  best effort: an orphaned folder is harmless
        pass
