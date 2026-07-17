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
import {
  isConnected,
  getAddress,
  signTransaction,
} from '@stellar/freighter-api';

// RPC server for Stellar Testnet
export const RPC_SERVER_URL = 'https://soroban-testnet.stellar.org:443';
export const rpcServer = new rpc.Server(RPC_SERVER_URL);

// Native XLM token contract on Testnet
export const NATIVE_TOKEN_ID = 'CAS3J52FBZ64567472NJ2BIH5CD57FGBV53E2ND6VNG7DV7JUBU6F2F5';

// Deployed contract address fallback (will be overwritten by deploy.sh)
let CONTRACT_ID = 'CACR2G6WZKYYD6Q6G3T6UEXN3T5H77V5YWYXYLNX23G5JZQ6F6KITTY';

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
    const result = await getAddress();
    if (!result || result.error) {
      throw new Error(result?.error || 'Wallet is locked or user denied access.');
    }
    return {
      connected: true,
      address: result.address,
      network: 'testnet',
    };
  } catch (err: any) {
    throw new Error(err.message || 'Error connecting to Freighter.');
  }
}

/**
 * Helper to simulate a read-only contract call.
 */
async function queryContract(functionName: string, args: xdr.ScVal[] = []): Promise<any> {
  try {
    // We use a dummy source account to simulate
    const dummySource = 'GAAZIYQHP89NSAWVZJFR32TCPJOOOBK4ZTDMGHF9U7PVAQRO6ZDJSKTY';
    const sourceAccount = await rpcServer.getAccount(dummySource);

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: '100000',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: CONTRACT_ID,
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
    console.error(`Error in contract query (${functionName}):`, err);
    throw err;
  }
}

/**
 * Helper to build, sign (with Freighter), and submit a state-changing transaction.
 */
async function callContract(
  sourceAddress: string,
  functionName: string,
  args: xdr.ScVal[] = []
): Promise<string> {
  try {
    // 1. Fetch current transaction sequence number
    const sourceAccount = await rpcServer.getAccount(sourceAddress);

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
      const errorSim = simResult as any;
      throw new Error(`Transaction simulation failed: ${errorSim.result?.error || 'Unknown error'}`);
    }

    // 4. Assemble transaction with simulation footprints and fees
    const preparedTx = rpc.assembleTransaction(tx, simResult);

    // 5. Sign transaction via Freighter
    const xdrString = (preparedTx as any).toXDR();
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
    while ((status === 'PENDING' || status === 'ERROR') && pollCount < 15) {
      await new Promise((r) => setTimeout(r, 2000));
      const txStatus = await rpcServer.getTransaction(submitResult.hash);
      status = txStatus.status;
      if (status === 'SUCCESS') {
        return submitResult.hash;
      }
      if (status === 'FAILED') {
        throw new Error('Transaction execution failed on-chain.');
      }
      pollCount++;
    }

    if (status === 'SUCCESS') {
      return submitResult.hash;
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
): Promise<string> {
  const organizerAddr = Address.fromString(organizer);
  const memberAddrList = members.map((m) => Address.fromString(m));

  const args = [
    nativeToScVal(organizerAddr),
    nativeToScVal(memberAddrList),
    nativeToScVal(BigInt(contributionAmount), { type: 'i128' }),
    nativeToScVal(BigInt(cycleDurationSeconds), { type: 'u64' }),
    nativeToScVal(members.length, { type: 'u32' }),
  ];

  return callContract(organizer, 'create_group', args);
}

export async function contributeToGroup(groupId: number, memberAddress: string): Promise<string> {
  const memberAddr = Address.fromString(memberAddress);
  const args = [
    nativeToScVal(BigInt(groupId), { type: 'u64' }),
    nativeToScVal(memberAddr),
  ];

  return callContract(memberAddress, 'contribute', args);
}

export async function triggerGroupPayout(groupId: number, organizerAddress: string): Promise<string> {
  const args = [
    nativeToScVal(BigInt(groupId), { type: 'u64' }),
  ];

  return callContract(organizerAddress, 'trigger_payout', args);
}

export async function flagDefault(groupId: number, memberAddress: string, organizerAddress: string): Promise<string> {
  const memberAddr = Address.fromString(memberAddress);
  const args = [
    nativeToScVal(BigInt(groupId), { type: 'u64' }),
    nativeToScVal(memberAddr),
  ];

  return callContract(organizerAddress, 'handle_default', args);
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
}

export async function getMemberHistory(groupId: number, memberAddress: string): Promise<MemberRecordResponse> {
  const memberAddr = Address.fromString(memberAddress);
  const args = [
    nativeToScVal(BigInt(groupId), { type: 'u64' }),
    nativeToScVal(memberAddr),
  ];
  const raw = await queryContract('get_member_history', args);
  return {
    contributions_made: Number(raw.contributions_made),
    payouts_received: Number(raw.payouts_received),
    defaults: raw.defaults,
  };
}
