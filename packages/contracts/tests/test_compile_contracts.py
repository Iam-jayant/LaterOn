from pyteal import Mode, compileTeal

from lateron.bnpl_pyteal import approval_program as bnpl_approval
from lateron.bnpl_pyteal import clear_state_program as bnpl_clear
from lateron.pool_pyteal import approval_program as pool_approval
from lateron.pool_pyteal import clear_state_program as pool_clear


def test_bnpl_contract_compiles():
    approval = compileTeal(bnpl_approval(), mode=Mode.Application, version=8)
    clear = compileTeal(bnpl_clear(), mode=Mode.Application, version=8)
    assert "#pragma version 8" in approval
    assert "#pragma version 8" in clear


def test_pool_contract_compiles():
    approval = compileTeal(pool_approval(), mode=Mode.Application, version=8)
    clear = compileTeal(pool_clear(), mode=Mode.Application, version=8)
    assert "#pragma version 8" in approval
    assert "#pragma version 8" in clear
