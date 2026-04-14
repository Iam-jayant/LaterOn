from pyteal import (
    App,
    Approve,
    Assert,
    Btoi,
    Bytes,
    Concat,
    Cond,
    Expr,
    Extract,
    Global,
    Gtxn,
    If,
    Int,
    Itob,
    Len,
    Log,
    OnComplete,
    Pop,
    Reject,
    Seq,
    Substring,
    Txn,
    TxnType,
)

ADMIN_KEY = Bytes("admin")
PAUSED_KEY = Bytes("paused")
PLAN_COUNTER_KEY = Bytes("pc")
TOTAL_FINANCED_KEY = Bytes("tf")
TOTAL_REPAID_KEY = Bytes("tr")

METHOD_CREATE_PLAN = Bytes("create_plan")
METHOD_REPAY_INSTALLMENT = Bytes("repay_installment")
METHOD_SETTLE_RISK = Bytes("settle_risk")
METHOD_SET_PAUSED = Bytes("set_paused")

# Box storage constants
# Payment plan box structure (fixed size):
# - borrower_address: 32 bytes (Algorand address)
# - financed_amount_microalgo: 8 bytes (uint64)
# - remaining_amount_microalgo: 8 bytes (uint64)
# - installments_paid: 8 bytes (uint64)
# - next_due_unix: 8 bytes (uint64)
# - status: 1 byte (uint8: 0=ACTIVE, 1=LATE, 2=DEFAULTED, 3=COMPLETED, 4=CANCELLED)
# - tier_at_approval: 1 byte (uint8: 0=NEW, 1=EMERGING, 2=TRUSTED)
# Total: 66 bytes

BOX_SIZE = Int(66)
OFFSET_BORROWER = Int(0)
OFFSET_FINANCED = Int(32)
OFFSET_REMAINING = Int(40)
OFFSET_INSTALLMENTS = Int(48)
OFFSET_NEXT_DUE = Int(56)
OFFSET_STATUS = Int(64)
OFFSET_TIER = Int(65)

# Status enum values
STATUS_ACTIVE = Int(0)
STATUS_LATE = Int(1)
STATUS_DEFAULTED = Int(2)
STATUS_COMPLETED = Int(3)
STATUS_CANCELLED = Int(4)

# Tier enum values
TIER_NEW = Int(0)
TIER_EMERGING = Int(1)
TIER_TRUSTED = Int(2)

# Tier limits in microalgos (assuming 1 INR = 1 microalgo for simplicity in v1)
# Outstanding limits: NEW (5000), EMERGING (15000), TRUSTED (50000)
TIER_NEW_OUTSTANDING_LIMIT = Int(5000_000000)  # 5000 ALGO in microalgos
TIER_EMERGING_OUTSTANDING_LIMIT = Int(15000_000000)  # 15000 ALGO in microalgos
TIER_TRUSTED_OUTSTANDING_LIMIT = Int(50000_000000)  # 50000 ALGO in microalgos

# Order limits: NEW (5000), EMERGING (10000), TRUSTED (30000)
TIER_NEW_ORDER_LIMIT = Int(5000_000000)  # 5000 ALGO in microalgos
TIER_EMERGING_ORDER_LIMIT = Int(10000_000000)  # 10000 ALGO in microalgos
TIER_TRUSTED_ORDER_LIMIT = Int(30000_000000)  # 30000 ALGO in microalgos

# User box structure (8 bytes):
# - outstanding_amount_microalgo: 8 bytes (uint64)
USER_BOX_SIZE = Int(8)


def _get_user_box_name(user_address: Expr) -> Expr:
    """Generate box name for user from address (32 bytes)"""
    return Concat(Bytes("user_"), user_address)


def _get_user_outstanding(user_address: Expr) -> Expr:
    """
    Get user's current outstanding amount from user box.
    Returns 0 if user box doesn't exist yet.
    """
    box_name = _get_user_box_name(user_address)
    box_exists = App.box_get(box_name)
    return Seq(
        box_exists,
        If(
            box_exists.hasValue(),
            Btoi(box_exists.value()),
            Int(0)
        )
    )


def _update_user_outstanding(user_address: Expr, new_outstanding: Expr) -> Expr:
    """
    Update user's outstanding amount in user box.
    Creates the box if it doesn't exist.
    """
    box_name = _get_user_box_name(user_address)
    box_exists = App.box_get(box_name)
    return Seq(
        box_exists,
        If(
            box_exists.hasValue(),
            # Box exists, replace the value
            App.box_replace(box_name, Int(0), Itob(new_outstanding)),
            # Box doesn't exist, create it
            Seq(
                Pop(App.box_create(box_name, USER_BOX_SIZE)),
                App.box_replace(box_name, Int(0), Itob(new_outstanding))
            )
        )
    )


def _get_tier_outstanding_limit(tier: Expr) -> Expr:
    """Get outstanding limit for a given tier"""
    return Cond(
        [tier == TIER_NEW, TIER_NEW_OUTSTANDING_LIMIT],
        [tier == TIER_EMERGING, TIER_EMERGING_OUTSTANDING_LIMIT],
        [tier == TIER_TRUSTED, TIER_TRUSTED_OUTSTANDING_LIMIT],
    )


def _get_tier_order_limit(tier: Expr) -> Expr:
    """Get order limit for a given tier"""
    return Cond(
        [tier == TIER_NEW, TIER_NEW_ORDER_LIMIT],
        [tier == TIER_EMERGING, TIER_EMERGING_ORDER_LIMIT],
        [tier == TIER_TRUSTED, TIER_TRUSTED_ORDER_LIMIT],
    )


def _is_admin() -> Expr:
    return Txn.sender() == App.globalGet(ADMIN_KEY)


def _only_admin() -> Expr:
    return Assert(_is_admin())


def _assert_not_paused() -> Expr:
    return Assert(App.globalGet(PAUSED_KEY) == Int(0))


def _get_plan_box_name(plan_id: Expr) -> Expr:
    """Generate box name from plan ID (8-byte uint64)"""
    return Concat(Bytes("plan_"), Itob(plan_id))


def _create_plan_box(plan_id: Expr, borrower: Expr, financed: Expr, remaining: Expr, 
                     installments: Expr, next_due: Expr, status: Expr, tier: Expr) -> Expr:
    """
    Create a new payment plan box with the given parameters.
    Box structure (66 bytes):
    - borrower_address: 32 bytes
    - financed_amount_microalgo: 8 bytes
    - remaining_amount_microalgo: 8 bytes
    - installments_paid: 8 bytes
    - next_due_unix: 8 bytes
    - status: 1 byte
    - tier_at_approval: 1 byte
    """
    box_name = _get_plan_box_name(plan_id)
    return Seq(
        # Create box with fixed size (Pop to discard return value)
        Pop(App.box_create(box_name, BOX_SIZE)),
        # Write borrower address (32 bytes)
        App.box_replace(box_name, OFFSET_BORROWER, borrower),
        # Write financed amount (8 bytes)
        App.box_replace(box_name, OFFSET_FINANCED, Itob(financed)),
        # Write remaining amount (8 bytes)
        App.box_replace(box_name, OFFSET_REMAINING, Itob(remaining)),
        # Write installments paid (8 bytes)
        App.box_replace(box_name, OFFSET_INSTALLMENTS, Itob(installments)),
        # Write next due unix (8 bytes)
        App.box_replace(box_name, OFFSET_NEXT_DUE, Itob(next_due)),
        # Write status (1 byte)
        App.box_replace(box_name, OFFSET_STATUS, Substring(Itob(status), Int(7), Int(8))),
        # Write tier (1 byte)
        App.box_replace(box_name, OFFSET_TIER, Substring(Itob(tier), Int(7), Int(8))),
    )


def _get_plan_field_bytes(plan_id: Expr, offset: Expr, length: Expr) -> Expr:
    """Read bytes from a plan box at the given offset and length"""
    box_name = _get_plan_box_name(plan_id)
    return App.box_extract(box_name, offset, length)


def _get_plan_borrower(plan_id: Expr) -> Expr:
    """Get borrower address from plan box (32 bytes)"""
    return _get_plan_field_bytes(plan_id, OFFSET_BORROWER, Int(32))


def _get_plan_financed(plan_id: Expr) -> Expr:
    """Get financed amount from plan box (8 bytes as uint64)"""
    return Btoi(_get_plan_field_bytes(plan_id, OFFSET_FINANCED, Int(8)))


def _get_plan_remaining(plan_id: Expr) -> Expr:
    """Get remaining amount from plan box (8 bytes as uint64)"""
    return Btoi(_get_plan_field_bytes(plan_id, OFFSET_REMAINING, Int(8)))


def _get_plan_installments(plan_id: Expr) -> Expr:
    """Get installments paid from plan box (8 bytes as uint64)"""
    return Btoi(_get_plan_field_bytes(plan_id, OFFSET_INSTALLMENTS, Int(8)))


def _get_plan_next_due(plan_id: Expr) -> Expr:
    """Get next due unix timestamp from plan box (8 bytes as uint64)"""
    return Btoi(_get_plan_field_bytes(plan_id, OFFSET_NEXT_DUE, Int(8)))


def _get_plan_status(plan_id: Expr) -> Expr:
    """Get status from plan box (1 byte as uint8)"""
    return Btoi(_get_plan_field_bytes(plan_id, OFFSET_STATUS, Int(1)))


def _get_plan_tier(plan_id: Expr) -> Expr:
    """Get tier at approval from plan box (1 byte as uint8)"""
    return Btoi(_get_plan_field_bytes(plan_id, OFFSET_TIER, Int(1)))


def _update_plan_field(plan_id: Expr, offset: Expr, value_bytes: Expr) -> Expr:
    """Update a field in the plan box"""
    box_name = _get_plan_box_name(plan_id)
    return App.box_replace(box_name, offset, value_bytes)


def _update_plan_remaining(plan_id: Expr, new_remaining: Expr) -> Expr:
    """Update remaining amount in plan box"""
    return _update_plan_field(plan_id, OFFSET_REMAINING, Itob(new_remaining))


def _update_plan_installments(plan_id: Expr, new_installments: Expr) -> Expr:
    """Update installments paid in plan box"""
    return _update_plan_field(plan_id, OFFSET_INSTALLMENTS, Itob(new_installments))


def _update_plan_status(plan_id: Expr, new_status: Expr) -> Expr:
    """Update status in plan box"""
    return _update_plan_field(plan_id, OFFSET_STATUS, Substring(Itob(new_status), Int(7), Int(8)))


def _update_plan_next_due(plan_id: Expr, new_next_due: Expr) -> Expr:
    """Update next due unix timestamp in plan box"""
    return _update_plan_field(plan_id, OFFSET_NEXT_DUE, Itob(new_next_due))


def _create_plan() -> Expr:
    """
    Create a new payment plan in box storage.
    
    This function validates an atomic transaction group for BNPL marketplace checkout:
    - Txn 0: First EMI payment from borrower to pool (payment transaction)
    - Txn 1: Full amount payment from pool to merchant (payment transaction, signed by relayer)
    - Txn 2: Plan creation call (this transaction)
    
    Flow:
    1. User pays 1st EMI (1/3 of total) to pool
    2. Pool pays full amount to merchant (automated by backend)
    3. BNPL contract creates plan with 2 remaining installments
    
    Expected args:
    - args[0]: method name ("create_plan")
    - args[1]: borrower_address (32 bytes)
    - args[2]: total_amount_microalgo (8 bytes, uint64) - full order amount
    - args[3]: first_emi_amount_microalgo (8 bytes, uint64) - 1/3 of total
    - args[4]: pool_address (32 bytes)
    - args[5]: merchant_address (32 bytes)
    - args[6]: next_due_unix (8 bytes, uint64)
    - args[7]: tier_at_approval (1 byte, uint8: 0=NEW, 1=EMERGING, 2=TRUSTED)
    """
    borrower_address = Txn.application_args[1]
    total_amount = Btoi(Txn.application_args[2])
    first_emi_amount = Btoi(Txn.application_args[3])
    pool_address = Txn.application_args[4]
    merchant_address = Txn.application_args[5]
    next_due_unix = Btoi(Txn.application_args[6])
    tier_at_approval = Btoi(Txn.application_args[7])
    
    # Calculate financed amount (remaining after first EMI)
    financed_amount = total_amount - first_emi_amount
    
    # Get next plan ID
    new_plan_id = App.globalGet(PLAN_COUNTER_KEY) + Int(1)
    
    # Get user's current outstanding amount
    current_outstanding = _get_user_outstanding(borrower_address)
    
    # Calculate new outstanding amount (only the remaining 2 EMIs)
    new_outstanding = current_outstanding + financed_amount
    
    # Get tier limits
    outstanding_limit = _get_tier_outstanding_limit(tier_at_approval)
    order_limit = _get_tier_order_limit(tier_at_approval)
    
    return Seq(
        _assert_not_paused(),
        # Validate arguments
        Assert(Txn.application_args.length() >= Int(8)),
        Assert(Len(borrower_address) == Int(32)),
        Assert(Len(pool_address) == Int(32)),
        Assert(Len(merchant_address) == Int(32)),
        Assert(total_amount > Int(0)),
        Assert(first_emi_amount > Int(0)),
        Assert(first_emi_amount <= total_amount),
        Assert(next_due_unix > Global.latest_timestamp()),
        Assert((tier_at_approval == TIER_NEW) | (tier_at_approval == TIER_EMERGING) | (tier_at_approval == TIER_TRUSTED)),
        
        # Enforce tier limits
        # Check that the new outstanding amount doesn't exceed the tier's outstanding limit
        Assert(new_outstanding <= outstanding_limit),
        # Check that the total order amount doesn't exceed the tier's order limit
        Assert(total_amount <= order_limit),
        
        # Validate atomic transaction group structure
        # Must be part of a group of exactly 3 transactions
        Assert(Global.group_size() == Int(3)),
        
        # Validate Transaction 0: First EMI payment from borrower to pool
        # Must be a payment transaction
        Assert(Gtxn[0].type_enum() == TxnType.Payment),
        # Sender must be the borrower
        Assert(Gtxn[0].sender() == borrower_address),
        # Receiver must be the pool
        Assert(Gtxn[0].receiver() == pool_address),
        # Amount must match the first EMI amount
        Assert(Gtxn[0].amount() == first_emi_amount),
        
        # Validate Transaction 1: Full amount payment from pool to merchant
        # Must be a payment transaction
        Assert(Gtxn[1].type_enum() == TxnType.Payment),
        # Sender must be the pool (relayer)
        Assert(Gtxn[1].sender() == pool_address),
        # Receiver must be the merchant
        Assert(Gtxn[1].receiver() == merchant_address),
        # Amount must match the total order amount
        Assert(Gtxn[1].amount() == total_amount),
        
        # Validate Transaction 2: This transaction (plan creation)
        # Verify this is transaction index 2 in the group
        Assert(Txn.group_index() == Int(2)),
        
        # Create plan box with initial state
        # User already paid 1st EMI, so remaining = financed_amount (2 EMIs)
        _create_plan_box(
            new_plan_id,
            borrower_address,
            total_amount,  # Store total amount for reference
            financed_amount,  # Remaining = 2 EMIs (user already paid 1st)
            Int(1),  # installments_paid = 1 (first EMI just paid)
            next_due_unix,
            STATUS_ACTIVE,  # status = ACTIVE initially
            tier_at_approval
        ),
        # Update user's outstanding amount (only remaining 2 EMIs)
        _update_user_outstanding(borrower_address, new_outstanding),
        # Update global state
        App.globalPut(PLAN_COUNTER_KEY, new_plan_id),
        App.globalPut(TOTAL_FINANCED_KEY, App.globalGet(TOTAL_FINANCED_KEY) + financed_amount),
        Approve(),
    )


def _repay_installment() -> Expr:
    """
    Record a repayment for a payment plan.
    Expected args:
    - args[0]: method name ("repay_installment")
    - args[1]: plan_id (8 bytes, uint64)
    - args[2]: repaid_amount (8 bytes, uint64)
    
    Note: If the plan doesn't exist, the box_extract operations will fail automatically.
    
    Emits log event: "REPAY:" + plan_id (8 bytes) + repaid_amount (8 bytes) + new_remaining (8 bytes)
    """
    plan_id = Btoi(Txn.application_args[1])
    repaid_amount = Btoi(Txn.application_args[2])
    
    # Read current plan state (will fail if box doesn't exist)
    borrower_address = _get_plan_borrower(plan_id)
    current_remaining = _get_plan_remaining(plan_id)
    current_installments = _get_plan_installments(plan_id)
    
    # Calculate new state
    new_remaining = current_remaining - repaid_amount
    new_installments = current_installments + Int(1)
    
    # Get user's current outstanding and calculate new outstanding
    current_user_outstanding = _get_user_outstanding(borrower_address)
    new_user_outstanding = current_user_outstanding - repaid_amount
    
    return Seq(
        _assert_not_paused(),
        # Validate arguments
        Assert(Txn.application_args.length() >= Int(3)),
        Assert(repaid_amount > Int(0)),
        # Validate repayment doesn't exceed remaining
        Assert(repaid_amount <= current_remaining),
        # Update plan state
        _update_plan_remaining(plan_id, new_remaining),
        _update_plan_installments(plan_id, new_installments),
        # If fully paid, mark as completed
        If(
            new_remaining == Int(0),
            _update_plan_status(plan_id, STATUS_COMPLETED)
        ),
        # Update user's outstanding amount
        _update_user_outstanding(borrower_address, new_user_outstanding),
        # Update global state
        App.globalPut(TOTAL_REPAID_KEY, App.globalGet(TOTAL_REPAID_KEY) + repaid_amount),
        # Emit repayment event with plan ID, repaid amount, and new remaining balance
        Log(Concat(
            Bytes("REPAY:"),
            Itob(plan_id),
            Itob(repaid_amount),
            Itob(new_remaining)
        )),
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


def _settle_risk() -> Expr:
    """
    Settle risk for an overdue payment plan.
    Expected args:
    - args[0]: method name ("settle_risk")
    - args[1]: plan_id (8 bytes, uint64)
    - args[2]: current_unix (8 bytes, uint64)
    
    Transitions:
    - ACTIVE/LATE -> LATE if overdue >= 7 days (604800 seconds)
    - ACTIVE/LATE -> DEFAULTED if overdue >= 15 days (1296000 seconds)
    
    Emits log event: "SETTLE:" + plan_id (8 bytes) + old_status (1 byte) + new_status (1 byte) + days_overdue (8 bytes)
    
    Note: If the plan doesn't exist, the box_extract operations will fail automatically.
    """
    plan_id = Btoi(Txn.application_args[1])
    current_unix = Btoi(Txn.application_args[2])
    
    # Read plan state (will fail if box doesn't exist)
    next_due = _get_plan_next_due(plan_id)
    current_status = _get_plan_status(plan_id)
    
    # Calculate days overdue (in seconds)
    overdue_seconds = current_unix - next_due
    
    # Calculate days overdue (convert seconds to days)
    days_overdue = overdue_seconds / Int(86400)
    
    # Risk policy constants
    late_threshold = Int(604800)  # 7 days in seconds
    default_threshold = Int(1296000)  # 15 days in seconds
    
    # Determine new status
    new_status = If(
        overdue_seconds >= default_threshold,
        STATUS_DEFAULTED,
        If(
            overdue_seconds >= late_threshold,
            STATUS_LATE,
            current_status  # No change if not overdue enough
        )
    )
    
    return Seq(
        _assert_not_paused(),
        # Validate arguments
        Assert(Txn.application_args.length() >= Int(3)),
        # Only process ACTIVE or LATE plans
        Assert((current_status == STATUS_ACTIVE) | (current_status == STATUS_LATE)),
        # Validate plan is actually overdue
        Assert(current_unix > next_due),
        # Apply new status
        _update_plan_status(plan_id, new_status),
        # Emit risk settlement event with plan ID, old status, new status, and days overdue
        Log(Concat(
            Bytes("SETTLE:"),
            Itob(plan_id),
            Substring(Itob(current_status), Int(7), Int(8)),  # old_status as 1 byte
            Substring(Itob(new_status), Int(7), Int(8)),  # new_status as 1 byte
            Itob(days_overdue)  # days_overdue as 8 bytes
        )),
        Approve(),
    )


def approval_program() -> Expr:
    return Cond(
        [
            Txn.application_id() == Int(0),
            Seq(
                App.globalPut(ADMIN_KEY, Txn.sender()),
                App.globalPut(PAUSED_KEY, Int(0)),
                App.globalPut(PLAN_COUNTER_KEY, Int(0)),
                App.globalPut(TOTAL_FINANCED_KEY, Int(0)),
                App.globalPut(TOTAL_REPAID_KEY, Int(0)),
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
                    [Txn.application_args[0] == METHOD_CREATE_PLAN, _create_plan()],
                    [Txn.application_args[0] == METHOD_REPAY_INSTALLMENT, _repay_installment()],
                    [Txn.application_args[0] == METHOD_SETTLE_RISK, _settle_risk()],
                    [Txn.application_args[0] == METHOD_SET_PAUSED, _set_paused()],
                ),
            ),
        ],
    )


def clear_state_program() -> Expr:
    return Approve()
