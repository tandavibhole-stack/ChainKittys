#!/bin/bash
set -e

# Load helper variables
NETWORK="testnet"
RPC_URL="https://soroban-testnet.stellar.org:443"
FRIENDBOT_URL="https://friendbot.stellar.org"
NATIVE_TOKEN="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

echo "=== ChainKitty Deployer ==="

# 1. Build Smart Contract
echo "Building contract WASM..."
cargo build --target wasm32-unknown-unknown --release

WASM_PATH="target/wasm32-unknown-unknown/release/chainkitty.wasm"
if [ ! -f "$WASM_PATH" ]; then
    echo "Error: WASM file not found at $WASM_PATH"
    exit 1
fi

# 2. Check/Generate Deployer Identity
IDENTITY="chainkitty_deployer"
echo "Checking identity '$IDENTITY'..."
if ! soroban keys address "$IDENTITY" >/dev/null 2>&1; then
    echo "Identity not found. Generating new keypair..."
    soroban keys generate "$IDENTITY"
fi

DEPLOYER_ADDR=$(soroban keys address "$IDENTITY")
echo "Deployer Address: $DEPLOYER_ADDR"

# 3. Fund Identity
echo "Funding deployer address via Friendbot..."
FUND_RES=$(curl -s -X GET "${FRIENDBOT_URL}?addr=${DEPLOYER_ADDR}")
if echo "$FUND_RES" | grep -q "hash"; then
    echo "Account funded successfully!"
else
    echo "Friendbot warning (might be already funded): $FUND_RES"
fi

# 4. Deploy Contract
echo "Deploying contract to Stellar Testnet..."
CONTRACT_ID=$(soroban contract deploy \
    --wasm "$WASM_PATH" \
    --source "$IDENTITY" \
    --network "$NETWORK")

echo "Contract deployed successfully! ID: $CONTRACT_ID"

# 5. Initialize Contract
echo "Initializing contract with admin and token..."
soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER_ADDR" \
    --token "$NATIVE_TOKEN"

echo "Contract initialized!"

# 6. Save Configuration for Frontend
mkdir -p frontend/src
cat <<EOF > frontend/src/contracts.json
{
  "contractId": "$CONTRACT_ID",
  "network": "$NETWORK",
  "token": "$NATIVE_TOKEN",
  "deployer": "$DEPLOYER_ADDR"
}
EOF

echo "Saved contract deployment info to frontend/src/contracts.json"
echo "Deployment complete! ðŸŽ‰"
