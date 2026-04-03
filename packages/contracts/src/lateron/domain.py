from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from math import pow


class Tier(StrEnum):
    NEW = "NEW"
    EMERGING = "EMERGING"
    TRUSTED = "TRUSTED"


class PlanStatus(StrEnum):
    ACTIVE = "ACTIVE"
    LATE = "LATE"
    DEFAULTED = "DEFAULTED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


@dataclass(frozen=True)
class TierCap:
    max_outstanding_inr: int
    max_order_inr: int
    down_payment_ratio: float


@dataclass(frozen=True)
class RiskPolicy:
    late_after_days: int = 7
    default_after_days: int = 15


TIER_CAPS: dict[Tier, TierCap] = {
    Tier.NEW: TierCap(max_outstanding_inr=5000, max_order_inr=2000, down_payment_ratio=0.5),
    Tier.EMERGING: TierCap(max_outstanding_inr=15000, max_order_inr=7000, down_payment_ratio=0.3),
    Tier.TRUSTED: TierCap(max_outstanding_inr=50000, max_order_inr=20000, down_payment_ratio=0.15),
}

DEFAULT_APR: dict[Tier, int] = {
    Tier.NEW: 18,
    Tier.EMERGING: 14,
    Tier.TRUSTED: 10,
}

DEFAULT_RISK_POLICY = RiskPolicy()


def determine_tier(completed_plans: int, defaults: int, late_payments: int) -> Tier:
    if completed_plans >= 5 and defaults == 0 and late_payments <= 1:
        return Tier.TRUSTED
    if completed_plans >= 2 and defaults == 0:
        return Tier.EMERGING
    return Tier.NEW


def calculate_emi(principal: float, monthly_rate: float, months: int) -> float:
    if months <= 0:
        raise ValueError("months must be > 0")
    if principal <= 0:
        return 0.0
    if monthly_rate == 0:
        return principal / months

    multiplier = pow(1 + monthly_rate, months)
    return (principal * monthly_rate * multiplier) / (multiplier - 1)


def derive_risk_status(
    *,
    current_status: PlanStatus,
    next_due_unix: int,
    now_unix: int,
    policy: RiskPolicy = DEFAULT_RISK_POLICY,
) -> PlanStatus:
    if current_status in (PlanStatus.COMPLETED, PlanStatus.DEFAULTED, PlanStatus.CANCELLED):
        return current_status

    overdue_seconds = now_unix - next_due_unix
    if overdue_seconds >= policy.default_after_days * 24 * 60 * 60:
        return PlanStatus.DEFAULTED
    if overdue_seconds >= policy.late_after_days * 24 * 60 * 60:
        return PlanStatus.LATE
    return PlanStatus.ACTIVE
