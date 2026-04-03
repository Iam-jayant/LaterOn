# LaterOn Contracts

This package contains protocol rule logic and contract-level method scaffolding for LaterOn v1.

## v1 Scope

- ALGO-only settlement
- Tier-based caps and repayment progression
- On-chain final risk state transitions via `settle_risk(plan_id)`

## Notes

- `domain.py` provides deterministic business rule helpers covered by tests.
- `bnpl_contract.py` documents ARC4-facing methods expected in the on-chain implementation.
- `bnpl_pyteal.py` and `pool_pyteal.py` are deployable PyTeal contracts for TestNet MVP iteration.

## Compile TEAL

```bash
poetry install
poetry run python compile_contracts.py
```

This generates TEAL files in `packages/contracts/artifacts`.

## Deploy to TestNet

1. Configure environment:

```bash
cp .env.example .env
```

Set `DEPLOYER_MNEMONIC` (25-word mnemonic of funded TestNet account).

2. Deploy:

```bash
poetry run python deploy_testnet.py --expected-address CYPMTG3YHOOQSOFZRIAKJNP2TB2Z7WW3OYCTMYL33MKZQQ5HCRALVZTCEA
```

Or prompt securely (without exporting env):

```bash
poetry run python deploy_testnet.py --interactive-mnemonic --expected-address CYPMTG3YHOOQSOFZRIAKJNP2TB2Z7WW3OYCTMYL33MKZQQ5HCRALVZTCEA
```

Or deploy with exported private key (base64):

```bash
DEPLOYER_PRIVATE_KEY="<base64-private-key>" poetry run python deploy_testnet.py --expected-address CYPMTG3YHOOQSOFZRIAKJNP2TB2Z7WW3OYCTMYL33MKZQQ5HCRALVZTCEA
```

The script prints deployed BNPL and Pool app IDs.
