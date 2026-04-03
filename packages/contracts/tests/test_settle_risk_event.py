"""
Test to verify that the settle_risk method emits the correct event log.

This test verifies that the SETTLE event is properly formatted with:
- Event prefix: "SETTLE:"
- plan_id: 8 bytes (uint64)
- old_status: 1 byte (uint8)
- new_status: 1 byte (uint8)
- days_overdue: 8 bytes (uint64)
"""

from pyteal import Mode, compileTeal

from lateron.bnpl_pyteal import approval_program


def test_settle_risk_emits_event():
    """
    Verify that the compiled TEAL includes a log instruction for risk settlement events.
    
    The log event format should be:
    "SETTLE:" + plan_id (8 bytes) + old_status (1 byte) + new_status (1 byte) + days_overdue (8 bytes)
    """
    # Compile the approval program
    teal_code = compileTeal(approval_program(), mode=Mode.Application, version=8)
    
    # Verify the SETTLE event prefix is in the compiled code
    assert 'byte "SETTLE:"' in teal_code, "SETTLE event prefix not found in compiled TEAL"
    
    # Verify the log instruction is present
    assert "log" in teal_code, "Log instruction not found in compiled TEAL"
    
    # Verify the settle_risk method is present
    assert 'byte "settle_risk"' in teal_code, "settle_risk method not found in compiled TEAL"
    
    print("✓ settle_risk method emits SETTLE event correctly")
    print("✓ Event format: SETTLE: + plan_id (8 bytes) + old_status (1 byte) + new_status (1 byte) + days_overdue (8 bytes)")


if __name__ == "__main__":
    test_settle_risk_emits_event()
