from lateron.domain import PlanStatus, calculate_emi, derive_risk_status, determine_tier


def test_determine_tier_trusted():
    assert determine_tier(completed_plans=5, defaults=0, late_payments=1) == "TRUSTED"


def test_emi_positive():
    emi = calculate_emi(principal=1000, monthly_rate=0.01, months=6)
    assert emi > 150


def test_risk_status_defaulted_after_15_days():
    due = 1_700_000_000
    now = due + (16 * 24 * 60 * 60)
    status = derive_risk_status(current_status=PlanStatus.ACTIVE, next_due_unix=due, now_unix=now)
    assert status == PlanStatus.DEFAULTED
