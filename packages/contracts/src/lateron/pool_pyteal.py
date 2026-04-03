from pyteal import (
    App,
    Approve,
    Assert,
    Btoi,
    Bytes,
    Cond,
    Expr,
    Int,
    OnComplete,
    Reject,
    Seq,
    Txn,
    TxnType,
)

ADMIN_KEY = Bytes("admin")
PAUSED_KEY = Bytes("paused")
TOTAL_DEPOSITS_KEY = Bytes("td")
TOTAL_LENT_KEY = Bytes("tl")
RESERVE_KEY = Bytes("rv")

METHOD_DEPOSIT = Bytes("deposit")
METHOD_LEND_OUT = Bytes("lend_out")
METHOD_RECORD_REPAYMENT = Bytes("record_repayment")
METHOD_SET_PAUSED = Bytes("set_paused")


def _is_admin() -> Expr:
    return Txn.sender() == App.globalGet(ADMIN_KEY)


def _only_admin() -> Expr:
    return Assert(_is_admin())


def _assert_not_paused() -> Expr:
    return Assert(App.globalGet(PAUSED_KEY) == Int(0))


def _deposit() -> Expr:
    amount = Btoi(Txn.application_args[1])
    return Seq(
        _assert_not_paused(),
        Assert(Txn.application_args.length() >= Int(2)),
        Assert(amount > Int(0)),
        App.globalPut(TOTAL_DEPOSITS_KEY, App.globalGet(TOTAL_DEPOSITS_KEY) + amount),
        Approve(),
    )


def _lend_out() -> Expr:
    amount = Btoi(Txn.application_args[1])
    return Seq(
        _assert_not_paused(),
        _only_admin(),
        Assert(Txn.application_args.length() >= Int(2)),
        Assert(amount > Int(0)),
        Assert(App.globalGet(TOTAL_DEPOSITS_KEY) >= amount),
        App.globalPut(TOTAL_DEPOSITS_KEY, App.globalGet(TOTAL_DEPOSITS_KEY) - amount),
        App.globalPut(TOTAL_LENT_KEY, App.globalGet(TOTAL_LENT_KEY) + amount),
        Approve(),
    )


def _record_repayment() -> Expr:
    repaid = Btoi(Txn.application_args[1])
    reserve_cut = Btoi(Txn.application_args[2])
    return Seq(
        _assert_not_paused(),
        Assert(Txn.application_args.length() >= Int(3)),
        Assert(repaid >= reserve_cut),
        Assert(repaid > Int(0)),
        App.globalPut(TOTAL_DEPOSITS_KEY, App.globalGet(TOTAL_DEPOSITS_KEY) + (repaid - reserve_cut)),
        App.globalPut(RESERVE_KEY, App.globalGet(RESERVE_KEY) + reserve_cut),
        Approve(),
    )


def _set_paused() -> Expr:
    paused_value = Btoi(Txn.application_args[1])
    return Seq(
        _only_admin(),
        Assert(Txn.application_args.length() >= Int(2)),
        Assert((paused_value == Int(0)) | (paused_value == Int(1))),
        App.globalPut(PAUSED_KEY, paused_value),
        Approve(),
    )


def approval_program() -> Expr:
    return Cond(
        [
            Txn.application_id() == Int(0),
            Seq(
                App.globalPut(ADMIN_KEY, Txn.sender()),
                App.globalPut(PAUSED_KEY, Int(0)),
                App.globalPut(TOTAL_DEPOSITS_KEY, Int(0)),
                App.globalPut(TOTAL_LENT_KEY, Int(0)),
                App.globalPut(RESERVE_KEY, Int(0)),
                Approve(),
            ),
        ],
        [Txn.on_completion() == OnComplete.DeleteApplication, Seq(_only_admin(), Approve())],
        [Txn.on_completion() == OnComplete.UpdateApplication, Seq(_only_admin(), Approve())],
        [Txn.on_completion() == OnComplete.CloseOut, Approve()],
        [Txn.on_completion() == OnComplete.OptIn, Reject()],
        [Txn.on_completion() == OnComplete.ClearState, Approve()],
        [
            Txn.on_completion() == OnComplete.NoOp,
            Seq(
                Assert(Txn.type_enum() == TxnType.ApplicationCall),
                Assert(Txn.application_args.length() > Int(0)),
                Cond(
                    [Txn.application_args[0] == METHOD_DEPOSIT, _deposit()],
                    [Txn.application_args[0] == METHOD_LEND_OUT, _lend_out()],
                    [Txn.application_args[0] == METHOD_RECORD_REPAYMENT, _record_repayment()],
                    [Txn.application_args[0] == METHOD_SET_PAUSED, _set_paused()],
                ),
            ),
        ],
    )


def clear_state_program() -> Expr:
    return Approve()
