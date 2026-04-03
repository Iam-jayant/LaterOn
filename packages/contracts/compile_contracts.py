from pathlib import Path

from pyteal import Mode, compileTeal

from lateron.bnpl_pyteal import approval_program as bnpl_approval
from lateron.bnpl_pyteal import clear_state_program as bnpl_clear
from lateron.pool_pyteal import approval_program as pool_approval
from lateron.pool_pyteal import clear_state_program as pool_clear

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
TEAL_VERSION = 8


def write_teal(filename: str, source: str) -> Path:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = ARTIFACTS_DIR / filename
    output_path.write_text(source, encoding="utf-8")
    return output_path


def main() -> None:
    bnpl_approval_teal = compileTeal(bnpl_approval(), mode=Mode.Application, version=TEAL_VERSION)
    bnpl_clear_teal = compileTeal(bnpl_clear(), mode=Mode.Application, version=TEAL_VERSION)
    pool_approval_teal = compileTeal(pool_approval(), mode=Mode.Application, version=TEAL_VERSION)
    pool_clear_teal = compileTeal(pool_clear(), mode=Mode.Application, version=TEAL_VERSION)

    write_teal("bnpl_approval.teal", bnpl_approval_teal)
    write_teal("bnpl_clear.teal", bnpl_clear_teal)
    write_teal("pool_approval.teal", pool_approval_teal)
    write_teal("pool_clear.teal", pool_clear_teal)

    print("Generated TEAL artifacts in packages/contracts/artifacts")


if __name__ == "__main__":
    main()
