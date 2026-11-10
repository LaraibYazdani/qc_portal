import pytest

from app.lib.job_number import is_usual_job_number, parse_design_filename


@pytest.mark.parametrize("s", ["267N2943", "26ON4465", "23DN2312", "20NN2354", "2670699", "16D0443", "14O0324", "2959977-1", " 23dn2332 "])
def test_accepts_pre_press_job_numbers(s):
    assert is_usual_job_number(s)


@pytest.mark.parametrize("s", ["NIKE", "12345", "TESTBULK001", "241N195", "252N02541", "243N0615 -40177461MO", "266N2440_", "436202"])
def test_flags_unusual_job_numbers(s):
    assert not is_usual_job_number(s)


def test_splits_at_first_underscore():
    p = parse_design_filename("267N2943_GMSAHOTMELTGLU_C[18].jpg")
    assert (p.job_number, p.design_name, p.unusual, p.note) == ("267N2943", "GMSAHOTMELTGLU_C[18]", False, None)


def test_upper_cases_and_trims():
    assert parse_design_filename("23dn2332 _MaxFresh125g_C.jpg").job_number == "23DN2332"


def test_keeps_part_suffix():
    assert parse_design_filename("2959977-1_LALindustries977-1_C.jpg").job_number == "2959977-1"


def test_finds_job_number_behind_another_code():
    p = parse_design_filename("434814_2690952_Glasses&PhoneCase_C3_002.jpg")
    assert (p.job_number, p.design_name, p.unusual) == ("2690952", "434814_Glasses&PhoneCase_C3_002", False)
    assert "part 2" in p.note


def test_flags_extra_text_and_suggests_fix():
    p = parse_design_filename("243N0615 -40177461MO_Shipping Case Watermelon Mint LEPP_PAK_C.jpg")
    assert p.unusual and "Did you mean 243N0615" in p.note


def test_flags_names_that_are_not_job_numbers():
    assert parse_design_filename("NIKE_Carton box_BSP.jpg").job_number == "NIKE"
    assert parse_design_filename("PAYPER_CWC.jpg").unusual


def test_refuses_names_without_underscore():
    assert parse_design_filename("267N2943.jpg").error
    assert parse_design_filename("_ShipperType59_CWC[3].jpg").error
