"""
ARC4 method scaffolding for LaterOn v1.

This module intentionally stays framework-light in this repository baseline.
It defines the on-chain API intent and state transition responsibility boundaries.
"""

from dataclasses import dataclass


@dataclass
class PlanCreationInput:
    wallet: str
    merchant: str
    order_amount_algo: int
    upfront_amount_algo: int
    financed_amount_algo: int
    tenure_months: int


class LaterOnBNPLContract:
    """
    Contract boundary specification:
    - ALGO-only plan lifecycle
    - authoritative risk materialization on-chain
    - permissionless risk settlement entrypoint
    """

    def create_plan(self, args: PlanCreationInput) -> str:
        """
        Atomic checkout leg:
        1. user upfront payment
        2. pool merchant payout
        3. plan storage write
        """
        raise NotImplementedError

    def repay_installment(self, plan_id: str, amount_algo: int) -> None:
        """Apply repayment and update principal/next due on-chain."""
        raise NotImplementedError

    def settle_risk(self, plan_id: str) -> None:
        """
        Permissionless risk sync that materializes:
        - LATE at 7 days overdue
        - DEFAULTED at 15 days overdue
        """
        raise NotImplementedError

    def update_protocol_params(self) -> None:
        """Admin-only APR caps, reserve ratio, and pause updates."""
        raise NotImplementedError
