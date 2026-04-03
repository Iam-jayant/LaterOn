import argparse
import base64
import getpass
import os
from dataclasses import dataclass

from algosdk import account, mnemonic, transaction
from algosdk.v2client.algod import AlgodClient
from pyteal import Mode, compileTeal

from lateron.bnpl_pyteal import approval_program as bnpl_approval
from lateron.bnpl_pyteal import clear_state_program as bnpl_clear
from lateron.pool_pyteal import approval_program as pool_approval
from lateron.pool_pyteal import clear_state_program as pool_clear

DEFAULT_ALGOD_ADDRESS = "https://testnet-api.algonode.cloud"
DEFAULT_ALGOD_TOKEN = ""
TEAL_VERSION = 8


@dataclass
class DeployedApps:
    bnpl_app_id: int
    pool_app_id: int


def compile_program(client: AlgodClient, source: str) -> bytes:
    response = client.compile(source)
    return base64.b64decode(response["result"])


def wait_for_confirmation(client: AlgodClient, tx_id: str, timeout_rounds: int = 10) -> dict:
    last_round = client.status().get("last-round")
    assert isinstance(last_round, int)

    current = last_round
    while current < last_round + timeout_rounds:
        pending = client.pending_transaction_info(tx_id)
        confirmed_round = pending.get("confirmed-round", 0)
        if isinstance(confirmed_round, int) and confirmed_round > 0:
            return pending
        if pending.get("pool-error"):
            raise RuntimeError(f"Pool error for tx {tx_id}: {pending['pool-error']}")
        current += 1
        client.status_after_block(current)
    raise TimeoutError(f"Transaction {tx_id} not confirmed after {timeout_rounds} rounds")


def create_app(
    client: AlgodClient,
    sender: str,
    sender_sk: str,
    approval_source: str,
    clear_source: str,
) -> int:
    approval_compiled = compile_program(client, approval_source)
    clear_compiled = compile_program(client, clear_source)

    params = client.suggested_params()
    global_schema = transaction.StateSchema(num_uints=4, num_byte_slices=1)
    local_schema = transaction.StateSchema(num_uints=0, num_byte_slices=0)

    tx = transaction.ApplicationCreateTxn(
        sender=sender,
        sp=params,
        on_complete=transaction.OnComplete.NoOpOC,
        approval_program=approval_compiled,
        clear_program=clear_compiled,
        global_schema=global_schema,
        local_schema=local_schema,
    )
    signed = tx.sign(sender_sk)
    tx_id = client.send_transaction(signed)
    pending = wait_for_confirmation(client, tx_id)
    app_id = pending.get("application-index")
    if not isinstance(app_id, int):
        raise RuntimeError(f"Unable to read application-index from tx {tx_id}")
    return app_id


def deploy(client: AlgodClient, sender: str, sender_sk: str) -> DeployedApps:
    bnpl_approval_teal = compileTeal(bnpl_approval(), mode=Mode.Application, version=TEAL_VERSION)
    bnpl_clear_teal = compileTeal(bnpl_clear(), mode=Mode.Application, version=TEAL_VERSION)
    pool_approval_teal = compileTeal(pool_approval(), mode=Mode.Application, version=TEAL_VERSION)
    pool_clear_teal = compileTeal(pool_clear(), mode=Mode.Application, version=TEAL_VERSION)

    bnpl_app_id = create_app(client, sender, sender_sk, bnpl_approval_teal, bnpl_clear_teal)
    pool_app_id = create_app(client, sender, sender_sk, pool_approval_teal, pool_clear_teal)
    return DeployedApps(bnpl_app_id=bnpl_app_id, pool_app_id=pool_app_id)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy LaterOn contracts to Algorand TestNet.")
    parser.add_argument(
        "--expected-address",
        default=os.getenv("EXPECTED_DEPLOYER_ADDRESS", ""),
        help="If provided, deployment fails when mnemonic address does not match this value.",
    )
    parser.add_argument(
        "--algod-address",
        default=os.getenv("ALGOD_ADDRESS", DEFAULT_ALGOD_ADDRESS),
        help="Algod address (default: Algonode TestNet public endpoint).",
    )
    parser.add_argument(
        "--algod-token",
        default=os.getenv("ALGOD_TOKEN", DEFAULT_ALGOD_TOKEN),
        help="Algod API token (empty for public Algonode endpoint).",
    )
    parser.add_argument(
        "--private-key",
        default=os.getenv("DEPLOYER_PRIVATE_KEY", ""),
        help="Deployer private key (Algorand base64 format). Takes precedence over mnemonic.",
    )
    parser.add_argument(
        "--interactive-mnemonic",
        action="store_true",
        help="Prompt securely for mnemonic when DEPLOYER_MNEMONIC is not set.",
    )
    return parser.parse_args()


def resolve_signer(args: argparse.Namespace) -> tuple[str, str]:
    private_key = (args.private_key or "").strip()
    if private_key:
        sender = account.address_from_private_key(private_key)
        return sender, private_key

    deployer_mnemonic = os.getenv("DEPLOYER_MNEMONIC", "").strip()
    if not deployer_mnemonic and args.interactive_mnemonic:
        deployer_mnemonic = getpass.getpass("Enter funded TestNet deployer mnemonic (hidden input): ").strip()
    if not deployer_mnemonic:
        raise RuntimeError(
            "No signer configured. Set DEPLOYER_PRIVATE_KEY or DEPLOYER_MNEMONIC, or use --interactive-mnemonic."
        )

    sender_sk = mnemonic.to_private_key(deployer_mnemonic)
    sender = account.address_from_private_key(sender_sk)
    return sender, sender_sk


def main() -> None:
    args = parse_args()
    sender, sender_sk = resolve_signer(args)
    if args.expected_address and sender != args.expected_address:
        raise RuntimeError(
            f"Mnemonic address {sender} does not match expected address {args.expected_address}"
        )

    client = AlgodClient(args.algod_token, args.algod_address)
    account_info = client.account_info(sender)
    amount = account_info.get("amount", 0)
    if not isinstance(amount, int) or amount < 600_000:
        raise RuntimeError(
            f"Insufficient balance for deployment on {sender}. Current microAlgos: {amount}"
        )

    deployed = deploy(client, sender, sender_sk)
    print("Deployment successful")
    print(f"Deployer: {sender}")
    print(f"BNPL App ID: {deployed.bnpl_app_id}")
    print(f"Liquidity Pool App ID: {deployed.pool_app_id}")


if __name__ == "__main__":
    main()
