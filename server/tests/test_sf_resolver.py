from app.lib.sf_resolver import resolve_company_id

BSPL, BSPL_CORR, BSPL_OTHER, PL = 3, 12, 13, 1


def rule(id, company, code, field=None, value=None, match="equals", priority=0):
    return {"id": id, "company_id": company, "sf_company_code": code, "sf_field": field,
            "match_type": match, "sf_value": value, "priority": priority}


ENTITY = [rule(1, PL, "1000"), rule(3, BSPL, "1200")]
# Confirmed in SuccessFactors: 10000020 = "Business Unit Corrugated Boxes", 10000022 = "Energy & Productivity"
BY_UNIT = ENTITY + [rule(20, BSPL_CORR, "1200", "businessUnit", "10000020"),
                    rule(21, BSPL_OTHER, "1200", "businessUnit", "10000022")]

PRE_PRESS = {"userId": "30000180", "company": "1200", "division": "20000056", "businessUnit": "10000020",
             "costCenter": "PKGS1211100000", "location": "1900-6012"}
KEY_ACCOUNTS = {"userId": "30001961", "company": "1200", "division": "20000058", "businessUnit": "10000020",
                "costCenter": "PKGS1211500000", "location": "1900-6001"}
WCM = {"userId": "30001991", "company": "1200", "division": "20000070", "businessUnit": "10000022",
       "costCenter": "PKGS1220152003", "location": "1900-6012"}
PL_EMPLOYEE = {"userId": "10009563", "company": "1000", "division": "20000016", "businessUnit": "10000002"}


def test_corrugated_employees_land_in_corrugated_whatever_their_division():
    assert resolve_company_id(PRE_PRESS, BY_UNIT) == BSPL_CORR
    assert resolve_company_id(KEY_ACCOUNTS, BY_UNIT) == BSPL_CORR


def test_energy_and_productivity_is_not_corrugated():
    assert resolve_company_id(WCM, BY_UNIT) == BSPL_OTHER
    assert resolve_company_id(WCM, [r for r in BY_UNIT if r["id"] != 21]) == BSPL


def test_a_division_rule_is_too_narrow():
    by_division = ENTITY + [rule(40, BSPL_CORR, "1200", "division", "20000056")]
    assert resolve_company_id(PRE_PRESS, by_division) == BSPL_CORR
    assert resolve_company_id(KEY_ACCOUNTS, by_division) == BSPL


def test_falls_back_to_the_legal_entity():
    assert resolve_company_id({**PRE_PRESS, "businessUnit": "99999999"}, BY_UNIT) == BSPL


def test_maps_other_legal_entities_by_company_code():
    assert resolve_company_id(PL_EMPLOYEE, BY_UNIT) == PL


def test_prefix_rules_and_priority():
    rules = BY_UNIT + [rule(50, 99, "1200", "location", "1900-6001", priority=5),
                       rule(51, 98, "1200", "costCenter", "PKGS12115", match="prefix", priority=1)]
    assert resolve_company_id(KEY_ACCOUNTS, rules) == 99
    assert resolve_company_id(PRE_PRESS, rules) == BSPL_CORR


def test_unknown_company_code():
    assert resolve_company_id({"company": "3000"}, BY_UNIT) is None
