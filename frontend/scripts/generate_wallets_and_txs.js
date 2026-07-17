import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  Keypair,
  Address,
  TransactionBuilder,
  Networks,
  Operation,
  rpc,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load contract config
const contractsPath = join(__dirname, '../src/contracts.json');
const config = JSON.parse(readFileSync(contractsPath, 'utf8'));
const { contractId } = config;

console.log('Using Contract ID:', contractId);

const RPC_SERVER_URL = 'https://soroban-testnet.stellar.org:443';
const rpcServer = new rpc.Server(RPC_SERVER_URL);

// Helper to fund account via Friendbot
async function ensureFunded(publicKey) {
  for (let i = 0; i < 5; i++) {
    try {
      await rpcServer.getAccount(publicKey);
      console.log(`Account ${publicKey} is funded and active on Testnet!`);
      return;
    } catch (e) {
      console.log(`Account ${publicKey} not found on ledger. Requesting Friendbot (attempt ${i + 1})...`);
      try {
        const res = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
        if (!res.ok) {
          console.warn(`Friendbot returned status ${res.status}`);
        }
      } catch (err) {
        console.error(`Fetch to Friendbot failed: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  throw new Error(`Failed to fund account ${publicKey} after 5 attempts`);
}

async function run() {
  console.log('Generating 13 unique Stellar keypairs...');
  const wallets = Array.from({ length: 13 }, () => Keypair.random());

  console.log('Funding all 13 accounts on Testnet...');
  for (let i = 0; i < wallets.length; i++) {
    const pubKey = wallets[i].publicKey();
    console.log(`Funding wallet ${i + 1}/13: ${pubKey}`);
    await ensureFunded(pubKey);
  }

  const organizer = wallets[0];
  const memberAddresses = wallets.map(w => w.publicKey());

  console.log('\nCreating a new chit fund group with 13 members...');
  console.log(`Organizer: ${organizer.publicKey()}`);

  const organizerAccount = await rpcServer.getAccount(organizer.publicKey());
  
  // Build create_group transaction
  const createGroupTx = new TransactionBuilder(organizerAccount, {
    fee: '100000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: 'create_group',
        args: [
          nativeToScVal(Address.fromString(organizer.publicKey())),
          nativeToScVal(memberAddresses.map(m => Address.fromString(m))),
          nativeToScVal(10n * 10000000n, { type: 'i128' }), // 10 XLM contribution
          nativeToScVal(86400n, { type: 'u64' }), // 1 day cycle duration
          nativeToScVal(13, { type: 'u32' }), // 13 members
        ],
      })
    )
    .setTimeout(30)
    .build();

  console.log('Simulating create_group transaction...');
  const simCreateGroup = await rpcServer.simulateTransaction(createGroupTx);
  if (!rpc.Api.isSimulationSuccess(simCreateGroup)) {
    throw new Error(`create_group simulation failed: ${JSON.stringify(simCreateGroup)}`);
  }

  const prepCreateGroup = rpc.assembleTransaction(createGroupTx, simCreateGroup).build();
  prepCreateGroup.sign(organizer);

  console.log('Submitting create_group transaction...');
  const submitCreateGroup = await rpcServer.sendTransaction(prepCreateGroup);
  if (submitCreateGroup.status === 'ERROR') {
    throw new Error(`Failed to submit create_group: ${JSON.stringify(submitCreateGroup.errorResult)}`);
  }

  let status = submitCreateGroup.status;
  let txStatus;
  let attempts = 0;
  while ((status === 'PENDING' || status === 'ERROR' || status === 'NOT_FOUND') && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000));
    txStatus = await rpcServer.getTransaction(submitCreateGroup.hash);
    status = txStatus.status;
    if (status === 'SUCCESS') break;
    if (status === 'FAILED') throw new Error('create_group execution failed on-chain.');
    attempts++;
  }

  if (status !== 'SUCCESS') {
    throw new Error(`create_group transaction timeout: ${status}`);
  }

  const groupId = scValToNative(txStatus.returnValue).toString();
  console.log(`Group created successfully! ID: ${groupId}, Hash: ${submitCreateGroup.hash}`);

  const results = [];

  // Make contributions for all 13 wallets
  console.log('\nSubmitting contribution transactions for all 13 wallets...');
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    const walletAddr = wallet.publicKey();
    console.log(`\n[${i + 1}/13] Submitting contribution for ${walletAddr}...`);

    const account = await rpcServer.getAccount(walletAddr);
    const contributeTx = new TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: 'contribute',
          args: [
            nativeToScVal(BigInt(groupId), { type: 'u64' }),
            nativeToScVal(Address.fromString(walletAddr)),
          ],
        })
      )
      .setTimeout(30)
      .build();

    console.log('Simulating contribute transaction...');
    const simContribute = await rpcServer.simulateTransaction(contributeTx);
    if (!rpc.Api.isSimulationSuccess(simContribute)) {
      throw new Error(`contribute simulation failed for ${walletAddr}: ${JSON.stringify(simContribute)}`);
    }

    const prepContribute = rpc.assembleTransaction(contributeTx, simContribute).build();
    prepContribute.sign(wallet);

    console.log('Submitting contribute transaction...');
    const submitContribute = await rpcServer.sendTransaction(prepContribute);
    if (submitContribute.status === 'ERROR') {
      throw new Error(`Failed to submit contribute for ${walletAddr}: ${JSON.stringify(submitContribute.errorResult)}`);
    }

    let cStatus = submitContribute.status;
    let cTxStatus;
    let cAttempts = 0;
    while ((cStatus === 'PENDING' || cStatus === 'ERROR' || cStatus === 'NOT_FOUND') && cAttempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      cTxStatus = await rpcServer.getTransaction(submitContribute.hash);
      cStatus = cTxStatus.status;
      if (cStatus === 'SUCCESS') break;
      if (cStatus === 'FAILED') throw new Error(`contribute failed on-chain for ${walletAddr}`);
      cAttempts++;
    }

    if (cStatus !== 'SUCCESS') {
      throw new Error(`contribute timeout for ${walletAddr}: ${cStatus}`);
    }

    console.log(`Wallet ${i + 1} contributed successfully! Hash: ${submitContribute.hash}`);

    results.push({
      userId: i + 1,
      publicKey: walletAddr,
      secretKey: wallet.secret(),
      txHash: submitContribute.hash,
    });
  }

  // Write all generated wallets detail to src/generated_wallets.json
  const outPath = join(__dirname, '../src/generated_wallets.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nSaved wallet and transaction details to ${outPath}`);

  // Log markdown table
  console.log('\n--- Markdown Table ---');
  console.log('| User ID | Name | Email | Wallet Address | Transaction Hash |');
  console.log('|---------|------|-------|----------------|------------------|');
  
  const names = [
    'Amit Sharma', 'Priya Patel', 'Vikram Singh', 'Ananya Iyer', 
    'Rahul Verma', 'Sneha Reddy', 'Arjun Rao', 'Divya Nair',
    'Rohan Gupta', 'Kavita Joshi', 'Manish Pandey', 'Neha Kapoor', 'Sanjay Kumar'
  ];

  results.forEach((res, index) => {
    const name = names[index];
    const email = `${name.toLowerCase().replace(' ', '.')}@example.com`;
    console.log(`| User ${res.userId} | ${name} | ${email} | \`${res.publicKey}\` | [\`${res.txHash.substring(0, 8)}...\`](https://testnet.lumenscan.io/txs/${res.txHash}) |`);
  });
}

run().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
