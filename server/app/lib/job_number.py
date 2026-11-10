"""
Job numbers and design file names.

Job numbers as used by pre-press (99% of phase 1 data): 2-digit year, month
(1-9, then O/N/D for October-December), an optional N, a 4-digit serial, and
sometimes a part suffix: 267N2943, 26ON4465, 2670699, 2959977-1.

Bulk upload file names follow JOBNUMBER_DESIGNNAME.ext. Kept in step with
frontend/src/utils/jobNumber.ts.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

JOB_NUMBER_RE = re.compile(r"^\d{2}[1-9OND]N?\d{4}(-\d{1,2})?$")
_LEADING_JOB_NUMBER_RE = re.compile(r"^(\d{2}[1-9OND]N?\d{4})(?![\dA-Z])")


def normalise_job_number(s: str) -> str:
    return s.strip().upper()


def is_usual_job_number(s: str) -> bool:
    return bool(JOB_NUMBER_RE.match(normalise_job_number(s)))


@dataclass
class ParsedDesignName:
    job_number: Optional[str]
    design_name: Optional[str]
    unusual: bool              # needs the uploader to confirm before it is saved
    note: Optional[str] = None  # what was assumed or what looks wrong
    error: Optional[str] = None  # the file name can't be used at all


def parse_design_filename(filename: str) -> ParsedDesignName:
    dot = filename.rfind(".")
    base = (filename[:dot] if dot > 0 else filename).strip()
    sep = base.find("_")
    if sep <= 0:
        return ParsedDesignName(None, None, False,
                                error="File name must follow JOBNUMBER_DESIGNNAME.ext, e.g. 267N2943_GMSAHOTMELTGLU_C[18].jpg")

    first = normalise_job_number(base[:sep])
    rest = base[sep + 1:]
    if JOB_NUMBER_RE.match(first):
        return ParsedDesignName(first, rest or None, False)

    # Another code in front of the job number, e.g. 434814_2690952_Glasses...: use the part that is a job number.
    parts = base.split("_")
    at = next((i for i, p in enumerate(parts) if i > 0 and JOB_NUMBER_RE.match(normalise_job_number(p))), -1)
    if at > 0:
        return ParsedDesignName(
            normalise_job_number(parts[at]),
            "_".join(p for i, p in enumerate(parts) if i != at) or None,
            False,
            note=f'Job number taken from part {at + 1} of the file name; "{parts[0]}" kept in the design name',
        )

    leading = _LEADING_JOB_NUMBER_RE.match(first)
    note = (f'"{first}" has extra text after the job number. Did you mean {leading.group(1)}? '
            f"Rename the file, or confirm to keep it as it is.") if leading \
        else f"\"{first}\" doesn't look like a job number (e.g. 267N2943)."
    return ParsedDesignName(first, rest or None, True, note=note)
