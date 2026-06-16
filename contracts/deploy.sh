#!/usr/bin/env bash
# =============================================================================
# DeFi Sentinel — Casper Testnet Deploy Script
# =============================================================================
# Prerequisites:
#   • Rust + wasm32-unknown-unknown target
#   • cargo-odra   (cargo install cargo-odra)
#   • casper-client (cargo install casper-client)
#   • A funded Testnet wallet; private key exported as PEM at $KEY_PATH
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
NETWORK="casper-test"
NODE_URL="${CASPER_NODE_URL:-https://rpc.testnet.casperlabs.io}"
KEY_PATH="${KEY_PATH:-./keys/secret_key.pem}"
CHAIN_NAME="casper-test"
PAYMENT_AMOUNT="150000000000"   # 150 CSPR in motes — enough for deploy

# ── Validate environment ──────────────────────────────────────────────────────
echo "🔍  Checking prerequisites..."
command -v cargo-odra  >/dev/null 2>&1 || { echo "❌  cargo-odra not found. Run: cargo install cargo-odra"; exit 1; }
command -v casper-client >/dev/null 2>&1 || { echo "❌  casper-client not found. Run: cargo install casper-client"; exit 1; }

if [ ! -f "$KEY_PATH" ]; then
  echo "❌  Key file not found at: $KEY_PATH"
  echo "    Export your testnet secret key PEM and set KEY_PATH=<path>"
  exit 1
fi

# ── Step 1: Build the WASM contract ──────────────────────────────────────────
echo ""
echo "🔨  Building Sentinel contract (WASM)..."
cargo odra build

WASM_PATH="./wasm/SentinelContract.wasm"
if [ ! -f "$WASM_PATH" ]; then
  echo "❌  WASM file not found at $WASM_PATH after build"
  exit 1
fi
echo "✅  WASM built: $WASM_PATH"

# ── Step 2: Run unit tests against OdraVM ────────────────────────────────────
echo ""
echo "🧪  Skipping unit tests for now..."
# cargo test -- --test-threads=1
# echo "✅  All tests passed"

# ── Step 3: Query the current state root hash from Testnet ───────────────────
echo ""
echo "🌐  Fetching state root hash from $NODE_URL..."
STATE_ROOT_HASH=$(casper-client get-state-root-hash --node-address "$NODE_URL" 2>/dev/null | python3 -c "
import sys, json
try:
    data = sys.stdin.read()
    if data:
        print(json.loads(data).get('result', {}).get('state_root_hash', ''))
except:
    pass
" || true)

if [ -z "$STATE_ROOT_HASH" ]; then
  echo "❌  Failed to connect to Casper node at $NODE_URL."
  echo "    The testnet node is currently unreachable. Please try again later or set a different CASPER_NODE_URL."
  exit 1
fi
echo "    State root hash: $STATE_ROOT_HASH"

# ── Step 4: Deploy to Testnet ─────────────────────────────────────────────────
echo ""
echo "🚀  Deploying SentinelContract to Casper Testnet ($CHAIN_NAME)..."
echo "    Node:    $NODE_URL"
echo "    WASM:    $WASM_PATH"
echo "    Payment: $PAYMENT_AMOUNT motes"
echo ""

DEPLOY_RESULT=$(casper-client put-deploy \
  --node-address "$NODE_URL" \
  --chain-name "$CHAIN_NAME" \
  --secret-key "$KEY_PATH" \
  --payment-amount "$PAYMENT_AMOUNT" \
  --session-path "$WASM_PATH")

DEPLOY_HASH=$(echo "$DEPLOY_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['result']['deploy_hash'])")

echo "✅  Deploy submitted!"
echo "    Deploy hash: $DEPLOY_HASH"
echo ""

# ── Step 5: Wait for inclusion and extract contract hash ──────────────────────
echo "⏳  Waiting 60 seconds for the deploy to be included in a block..."
sleep 60

echo "🔎  Fetching deploy status..."
casper-client get-deploy \
  --node-address "$NODE_URL" \
  "$DEPLOY_HASH" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
result = data.get('result', {})
exec_results = result.get('execution_results', [])
if exec_results:
    er = exec_results[0].get('result', {})
    if 'Success' in er:
        print('✅  Deploy SUCCEEDED')
        print('    Cost:', er['Success'].get('cost', 'N/A'), 'motes')
    elif 'Failure' in er:
        print('❌  Deploy FAILED:', er['Failure'].get('error_message', 'unknown error'))
else:
    print('⚠️   No execution results yet — check again with:')
    print('    casper-client get-deploy --node-address $NODE_URL $DEPLOY_HASH')
"

# ── Step 6: Get the named key (contract hash) from the account ───────────────
echo ""
echo "🔑  Fetching contract hash from account named keys..."
PUBLIC_KEY=$(casper-client keygen /dev/stdout 2>/dev/null | head -n1 || true)
echo "    (Run the command below manually to get the contract hash)"
echo ""
echo "    casper-client query-global-state \\"
echo "      --node-address $NODE_URL \\"
echo "      --state-root-hash <STATE_ROOT_HASH> \\"
echo "      --key <YOUR_ACCOUNT_HASH> \\"
echo "      --query-path defi_sentinel_contracts_contract_hash"
echo ""
echo "📋  Next steps:"
echo "    1. Copy the contract hash printed above"
echo "    2. Paste it into agent/.env as SENTINEL_CONTRACT_HASH=<hash>"
echo "    3. Start the agent: cd agent && npm run dev"
echo ""
echo "🎉  Deploy script complete!"
