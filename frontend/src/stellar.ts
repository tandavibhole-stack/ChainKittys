import {
  rpc,
  TransactionBuilder,
  Networks,
  Operation,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  TimeoutInfinite,
} from '@stellar/stellar-sdk';
import * as freighterApi from '@stellar/freighter-api';

const { isConnected, signTransaction } = freighterApi;
const getAddress = (freighterApi as any).getAddress;
const getPublicKey = (freighterApi as any).getPublicKey;

// RPC server for Stellar Testnet
export const RPC_SERVER_URL = 'https://soroban-testnet.stellar.org:443';
export const rpcServer = new rpc.Server(RPC_SERVER_URL);

// Native XLM token contract on Testnet
export let NATIVE_TOKEN_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

// Deployed contract address fallback (will be overwritten by deploy.sh)
let CONTRACT_ID = 'CAHACLVVN6U7JMBEBD2TOGYJLPDC34QGOR7L2IBSXZTE6T4RBU3KZ5TS';

try {
  // Try to load contract ID dynamically from deployed config
  const deployed = import.meta.glob('./contracts.json', { eager: true });
  const config = (deployed['./contracts.json'] as any);
  if (config && config.contractId) {
    CONTRACT_ID = config.contractId;
    console.log('Loaded deployed contract ID:', CONTRACT_ID);
  }
} catch (e) {
  console.log('Using default contract ID fallback');
}

export { CONTRACT_ID };

export interface WalletInfo {
  connected: boolean;
  address: string | null;
  network: string | null;
}

/**
 * Checks if Freighter is installed and connected, and retrieves the user's public address.
 */
export async function connectWallet(): Promise<WalletInfo> {
  const freighterConnected = await isConnected();
  if (!freighterConnected) {
    throw new Error('Freighter wallet extension not found.');
  }

  try {
    let address = '';
    
    // 1. Try to get address using getAddress (Freighter v6+)
    if (typeof getAddress === 'function') {
      try {
        const result = await getAddress();
        if (result && result.address) {
          address = result.address;
        } else if (result && result.error) {
          console.warn('getAddress returned error:', result.error);
        }
      } catch (e) {
        console.warn('getAddress call failed:', e);
      }
    }

    // 2. Try to get public key as fallback (Freighter v5 and below)
    if (!address && typeof getPublicKey === 'function') {
      try {
        address = await getPublicKey();
      } catch (e) {
        console.warn('getPublicKey call failed:', e);
      }
    }

    if (!address) {
      throw new Error('Could not retrieve public key. Please unlock your Freighter extension and select/create a Testnet account.');
    }

    return {
      connected: true,
      address: address,
      network: 'testnet',
    };
  } catch (err: any) {
    throw new Error(err.message || 'Error connecting to Freighter.');
  }
}

/**
 * Helper to simulate a read-only contract call.
 */
async function queryContractAddress(contractId: string, functionName: string, args: xdr.ScVal[] = []): Promise<any> {
  try {
    // We use a dummy source account to simulate
    const dummySource = 'GB4YEUNCDRAP3W2FXJNCZEJW5V2LE5LJ5FVMOZNMXE3YFVL76HA3FX7E';
    const sourceAccount = await rpcServer.getAccount(dummySource);

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: '100000',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: functionName,
          args,
        })
      )
      .setTimeout(TimeoutInfinite)
      .build();

    const simulation = await rpcServer.simulateTransaction(transaction);

    if (rpc.Api.isSimulationSuccess(simulation)) {
      const successSim = simulation as any;
      if (successSim.result?.retval) {
        return scValToNative(successSim.result.retval);
      }
      return null;
    } else {
      const errorSim = simulation as any;
      const errorMsg = errorSim.result?.error || 'Simulation failed.';
      throw new Error(`Failed to simulate: ${errorMsg}`);
    }
  } catch (err: any) {
    console.error(`Error in contract query (${functionName}) on ${contractId}:`, err);
    throw err;
  }
}

async function queryContract(functionName: string, args: xdr.ScVal[] = []): Promise<any> {
  return queryContractAddress(CONTRACT_ID, functionName, args);
}

export async function getEscrowBalance(): Promise<number> {
  try {
    const args = [nativeToScVal(Address.fromString(CONTRACT_ID))];
    const balanceRaw = await queryContractAddress(NATIVE_TOKEN_ID, 'balance', args);
    return Number(balanceRaw) / 10000000;
  } catch (err) {
    console.error('Failed to get escrow balance:', err);
    return 0;
  }
}

/**
 * Helper to build, sign (with Freighter), and submit a state-changing transaction.
 */
async function callContract(
  sourceAddress: string,
  functionName: string,
  args: xdr.ScVal[] = []
): Promise<{ hash: string; returnValue?: xdr.ScVal }> {
  try {
    // 1. Fetch current transaction sequence number (fund automatically if new)
    let sourceAccount;
    try {
      sourceAccount = await rpcServer.getAccount(sourceAddress);
    } catch (e) {
      console.log('Account not found on Testnet. Funding via Friendbot...');
      try {
        const res = await fetch(`https://friendbot.stellar.org/?addr=${sourceAddress}`);
        if (!res.ok) throw new Error('Friendbot request failed');
        // Wait 4 seconds for ledger close
        await new Promise((r) => setTimeout(r, 4000));
        sourceAccount = await rpcServer.getAccount(sourceAddress);
      } catch (err) {
        throw new Error(
          'Your account is not funded on Testnet. Please fund it first at https://friendbot.stellar.org/?addr=' +
            sourceAddress
        );
      }
    }

    // 2. Build preliminary transaction
    const tx = new TransactionBuilder(sourceAccount, {
      fee: '100000', // Base fee (will be replaced by simulation results)
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: CONTRACT_ID,
          function: functionName,
          args,
        })
      )
      .setTimeout(30) // 30 seconds timeout
      .build();

    // 3. Simulate transaction to calculate exact gas fees and footprint
    const simResult = await rpcServer.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simResult)) {
      console.warn("Raw simulation failure:", simResult);
      let errorMsg = 'Unknown error';
      if ((simResult as any).error) {
        errorMsg = (simResult as any).error;
      } else if ((simResult as any).result?.error) {
        errorMsg = (simResult as any).result.error;
      } else if ((simResult as any).results && (simResult as any).results[0]?.error) {
        errorMsg = (simResult as any).results[0].error;
      } else if ((simResult as any).results && (simResult as any).results[0]?.retval) {
        try {
          const scVal = (simResult as any).results[0].retval;
          errorMsg = `Contract error code: ${scValToNative(scVal)}`;
        } catch (_) {}
      }
      throw new Error(`Transaction simulation failed: ${errorMsg}`);
    }

    // 4. Assemble transaction with simulation footprints and fees
    const preparedTx = rpc.assembleTransaction(tx, simResult).build();

    // 5. Sign transaction via Freighter
    const xdrString = preparedTx.toXDR();
    const result = await signTransaction(xdrString, {
      networkPassphrase: Networks.TESTNET,
    });

    const signedXdr = typeof result === 'string' ? result : (result as any).signedTxXdr;

    // 6. Reconstruct signed transaction
    const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);

    // 7. Submit transaction to Soroban RPC
    const submitResult = await rpcServer.sendTransaction(signedTx);
    if ((submitResult as any).status === 'ERROR') {
      throw new Error(`Transaction submission failed: ${JSON.stringify((submitResult as any).errorResult)}`);
    }

    // 8. Poll for transaction status
    let status: string = submitResult.status;
    let pollCount = 0;
    let txStatus;
    while ((status === 'PENDING' || status === 'ERROR' || status === 'NOT_FOUND') && pollCount < 30) {
      await new Promise((r) => setTimeout(r, 2000));
      txStatus = await rpcServer.getTransaction(submitResult.hash);
      status = txStatus.status;
      if (status === 'SUCCESS') {
        break;
      }
      if (status === 'FAILED') {
        throw new Error('Transaction execution failed on-chain.');
      }
      pollCount++;
    }

    if (status === 'SUCCESS' && txStatus) {
      return {
        hash: submitResult.hash,
        returnValue: (txStatus as any).returnValue,
      };
    }
    throw new Error(`Transaction status timeout: ${status}`);
  } catch (err: any) {
    console.error(`Error invoking contract (${functionName}):`, err);
    throw err;
  }
}

// === CONTRACT WRITE METHODS ===

export async function createGroup(
  organizer: string,
  members: string[],
  contributionAmount: number,
  cycleDurationSeconds: number
): Promise<{ hash: string; groupId: number }> {
  const organizerAddr = Address.fromString(organizer);
  const memberAddrList = members.map((m) => Address.fromString(m));

  const args = [
    nativeToScVal(organizerAddr),
    nativeToScVal(memberAddrList),
    nativeToScVal(BigInt(contributionAmount) * 10000000n, { type: 'i128' }),
    nativeToScVal(BigInt(cycleDurationSeconds), { type: 'u64' }),
    nativeToScVal(members.length, { type: 'u32' }),
  ];

  const res = await callContract(organizer, 'create_group', args);
  const groupId = res.returnValue ? Number(scValToNative(res.returnValue)) : 0;
  return { hash: res.hash, groupId };
}

export async function contributeToGroup(groupId: number, memberAddress: string): Promise<string> {
  const memberAddr = Address.fromString(memberAddress);
  const args = [
    nativeToScVal(BigInt(groupId), { type: 'u64' }),
    nativeToScVal(memberAddr),
  ];

  const res = await callContract(memberAddress, 'contribute', args);
  return res.hash;
}

export async function triggerGroupPayout(groupId: number, organizerAddress: string): Promise<string> {
  const args = [
    nativeToScVal(BigInt(groupId), { type: 'u64' }),
  ];

  const res = await callContract(organizerAddress, 'trigger_payout', args);
  return res.hash;
}

export async function flagDefault(groupId: number, memberAddress: string, organizerAddress: string): Promise<string> {
  const memberAddr = Address.fromString(memberAddress);
  const args = [
    nativeToScVal(BigInt(groupId), { type: 'u64' }),
    nativeToScVal(memberAddr),
  ];

  const res = await callContract(organizerAddress, 'handle_default', args);
  return res.hash;
}

// === CONTRACT READ METHODS ===

export async function getGroupStatus(groupId: number): Promise<number> {
  const args = [nativeToScVal(BigInt(groupId), { type: 'u64' })];
  return queryContract('get_group_status', args);
}

export interface CycleStatusResponse {
  current_cycle: number;
  paid_members: string[];
  unpaid_members: string[];
  next_recipient: string;
  deadline: number;
}

export async function getCycleInfo(groupId: number): Promise<CycleStatusResponse> {
  const args = [nativeToScVal(BigInt(groupId), { type: 'u64' })];
  const raw = await queryContract('get_cycle_info', args);
  return {
    current_cycle: raw.current_cycle,
    paid_members: raw.paid_members || [],
    unpaid_members: raw.unpaid_members || [],
    next_recipient: raw.next_recipient,
    deadline: Number(raw.deadline),
  };
}

export interface MemberRecordResponse {
  contributions_made: number;
  payouts_received: number;
  defaults: number;
  reputation_score: number;
}

export async function getMemberHistory(groupId: number, memberAddress: string): Promise<MemberRecordResponse> {
  const memberAddr = Address.fromString(memberAddress);
  const args = [
    nativeToScVal(BigInt(groupId), { type: 'u64' }),
    nativeToScVal(memberAddr),
  ];
  const raw = await queryContract('get_member_history', args);
  return {
    contributions_made: Number(raw.contributions_made) / 10000000,
    payouts_received: Number(raw.payouts_received) / 10000000,
    defaults: raw.defaults,
    reputation_score: raw.reputation_score,
  };
}

export async function joinGroup(groupId: number, memberAddress: string): Promise<string> {
  const memberAddr = Address.fromString(memberAddress);
  const args = [
    nativeToScVal(BigInt(groupId), { type: 'u64' }),
    nativeToScVal(memberAddr),
  ];
  const res = await callContract(memberAddress, 'join_group', args);
  return res.hash;
}

export async function getOpenGroups(): Promise<number[]> {
  const raw = await queryContract('get_open_groups');
  return (raw || []).map((id: any) => Number(id));
}
