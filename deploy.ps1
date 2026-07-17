# deploy.ps1
$ErrorActionPreference = "Stop"

$NETWORK = "testnet"
$RPC_URL = "https://soroban-testnet.stellar.org:443"
$PASSPHRASE = "Test SDF Network ; September 2015"
$NATIVE_TOKEN = "CAS3J52FBZ64567472NJ2BIH5CD57FGBV53E2ND6VNG7DV7JUBU6F2F5"

Write-Host "=== ChainKitty PowerShell Deployer ===" -ForegroundColor Cyan

# 1. Build Smart Contract
Write-Host "Building contract WASM..." -ForegroundColor Yellow
cargo build --target-dir target_release --target wasm32-unknown-unknown --release -j 1

$WASM_PATH = "target_release/wasm32-unknown-unknown/release/chainkitty.wasm"
if (-not (Test-Path $WASM_PATH)) {
    Write-Error "Error: WASM file not found at $WASM_PATH"
}

# 2. Check/Generate Deployer Identity
$IDENTITY = "chainkitty_deployer"
Write-Host "Checking identity '$IDENTITY'..." -ForegroundColor Yellow
$DEPLOYER_ADDR = ""
try {
    $DEPLOYER_ADDR = & soroban config identity address $IDENTITY 2>$null
} catch {
    # If it fails, generate a new identity
}

if (-not $DEPLOYER_ADDR) {
    Write-Host "Identity not found. Generating new keypair..." -ForegroundColor Yellow
    & soroban config identity generate $IDENTITY
    $DEPLOYER_ADDR = & soroban config identity address $IDENTITY
}
Write-Host "Deployer Address: $DEPLOYER_ADDR" -ForegroundColor Green

# 3. Fund Identity
Write-Host "Funding deployer address via Friendbot..." -ForegroundColor Yellow
try {
    $url = "https://friendbot.stellar.org/?addr=$DEPLOYER_ADDR"
    $response = Invoke-RestMethod -Uri $url -Method Get
    Write-Host "Account funded successfully!" -ForegroundColor Green
} catch {
    Write-Host "Friendbot warning (might be already funded): $_" -ForegroundColor DarkYellow
}

# 4. Deploy Contract
Write-Host "Deploying contract to Stellar Testnet..." -ForegroundColor Yellow
$CONTRACT_ID = & soroban contract deploy `
    --wasm $WASM_PATH `
    --source $IDENTITY `
    --rpc-url $RPC_URL `
    --network-passphrase $PASSPHRASE

# Trim whitespace/newlines from contract ID
$CONTRACT_ID = $CONTRACT_ID.Trim()
Write-Host "Contract deployed successfully! ID: $CONTRACT_ID" -ForegroundColor Green

# 5. Initialize Contract
Write-Host "Initializing contract with admin and token..." -ForegroundColor Yellow
& soroban contract invoke `
    --id $CONTRACT_ID `
    --source $IDENTITY `
    --rpc-url $RPC_URL `
    --network-passphrase $PASSPHRASE `
    -- `
    initialize `
    --admin $DEPLOYER_ADDR `
    --token $NATIVE_TOKEN

Write-Host "Contract initialized!" -ForegroundColor Green

# 6. Save Configuration for Frontend
$configFolder = "frontend/src"
if (-not (Test-Path $configFolder)) {
    New-Item -ItemType Directory -Path $configFolder | Out-Null
}

$configJson = @"
{
  "contractId": "$CONTRACT_ID",
  "network": "$NETWORK",
  "token": "$NATIVE_TOKEN",
  "deployer": "$DEPLOYER_ADDR"
}
"@

$configJson | Out-File -Encoding utf8 "$configFolder/contracts.json"

Write-Host "Saved contract deployment info to frontend/src/contracts.json" -ForegroundColor Green
Write-Host "Deployment complete! 🎉" -ForegroundColor Green
