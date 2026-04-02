# LaterOn Contracts

This package contains protocol rule logic and contract-level method scaffolding for LaterOn v1.

## v1 Scope

- ALGO-only settlement
- Tier-based caps and repayment progression
- On-chain final risk state transitions via `settle_risk(plan_id)`

## Notes

- `domain.py` provides deterministic business rule helpers covered by tests.
- `bnpl_contract.py` documents ARC4-facing methods expected in the on-chain implementation.
