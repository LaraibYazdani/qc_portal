"""
Read-only SuccessFactors lookup: which business units, divisions and cost centres
exist inside one legal entity, with their names and head counts. Used to decide the
company_sf_mappings rules for sub-companies.

    python scripts/sf_org_lookup.py                  # company 1200 (BSPL)
    python scripts/sf_org_lookup.py --company 1100

Writes nothing and prints no personal data, only codes, names and counts.
"""
from __future__ import annotations

import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.lib.successfactors import sf_configured, sf_get_all  # noqa: E402


def arg(name: str, default: str) -> str:
    a = sys.argv
    return a[a.index(f"--{name}") + 1] if f"--{name}" in a and a.index(f"--{name}") + 1 < len(a) else default


def name_of(r: dict) -> str:
    for k in ("name", "name_defaultValue", "name_en_US", "description", "description_defaultValue"):
        if r.get(k):
            return str(r[k]).strip()
    return "(no name)"


def names(entities: list[str]) -> dict[str, str]:
    """Code → name for a foundation object: the legacy FO entity, else the MDF one."""
    for entity in entities:
        try:
            return {str(r["externalCode"]): name_of(r) for r in sf_get_all(f"/odata/v2/{entity}?$format=json")}
        except Exception as e:  # noqa: BLE001
            print(f"  ({entity} not available: {str(e).split(' for ')[0]})")
    return {}


def summarise(title: str, values: list[str], labels: dict[str, str]) -> None:
    print(f"\n{title}\n  {'code':<18}{'people':>7}   name")
    for code, n in Counter(values).most_common():
        print(f"  {code:<18}{n:>7}   {labels.get(code, '')}")


def main() -> None:
    company = arg("company", "1200")
    if not sf_configured():
        raise SystemExit("Set the SF_* settings (see .env.example) first.")
    if not re.fullmatch(r"[0-9A-Za-z]{1,10}", company):
        raise SystemExit("--company must be a company code such as 1200")

    print(f"SuccessFactors org structure for company {company}")
    jobs = sf_get_all(f"/odata/v2/EmpJob?$format=json&$filter=company eq '{company}'"
                      "&$select=userId,businessUnit,division,costCenter,location,department")
    if not jobs:
        print("No current EmpJob records for that company code.")
        return
    print(f"{len(jobs)} current job records")

    bu, div, cc = names(["FOBusinessUnit", "BusinessUnit"]), names(["FODivision", "Division"]), names(["FOCostCenter", "CostCenter"])
    val = lambda j, k: "(empty)" if j.get(k) is None else str(j[k])  # noqa: E731
    summarise("Business units (EmpJob.businessUnit)", [val(j, "businessUnit") for j in jobs], bu)
    summarise("Divisions (EmpJob.division)", [val(j, "division") for j in jobs], div)

    prefix_names: dict[str, str] = {}
    for code, name in cc.items():
        prefix_names.setdefault(code[:8], f"e.g. {code} {name}")
    summarise("Cost centre prefixes (first 8 characters)",
              ["(empty)" if j.get("costCenter") is None else str(j["costCenter"])[:8] for j in jobs], prefix_names)

    units = defaultdict(set)
    for j in jobs:
        units[val(j, "division")].add(val(j, "businessUnit"))
    spread = {d: s for d, s in units.items() if len(s) > 1}
    print("\nDivisions spread over more than one business unit: "
          + ("; ".join(f"{d} → {', '.join(sorted(s))}" for d, s in spread.items()) if spread
             else "none (each division sits inside one business unit)"))


if __name__ == "__main__":
    main()
