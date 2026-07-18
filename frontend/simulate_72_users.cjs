// simulate_72_users.cjs
const {
  Keypair,
  rpc,
  TransactionBuilder,
  Networks,
  Operation,
  Address,
  nativeToScVal,
  scValToNative,
} = require('@stellar/stellar-sdk');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'https://soroban-testnet.stellar.org:443';
const server = new rpc.Server(RPC_URL);
const CONTRACT_ID = 'CCT3VRGNSGTEDVBLPH4S42ZCY2LFI35MYM3HN2I4XPZTTJC7DSZINLIY';

const rawUserData = [
  { name: "Amit Sharma", email: "amit123sharma@gmail.com" },
  { name: "Neha Patel", email: "neha.patel9876@gmail.com" },
  { name: "Rahul Singh", email: "rahul2507singh@gmail.com" },
  { name: "Pooja Gupta", email: "pooja007gupta@gmail.com" },
  { name: "Sanjay Yadav", email: "sanjayyadav8899@gmail.com" },
  { name: "Kavita Tiwari", email: "9988kavitatiwari@gmail.com" },
  { name: "Anil Kumar", email: "anil.kumar1508@gmail.com" },
  { name: "Sunita Mishra", email: "sunita456mishra@gmail.com" },
  { name: "Rohit Chauhan", email: "rohitc98765@gmail.com" },
  { name: "Priya Jain", email: "priya1990jain@gmail.com" },
  { name: "Ramesh Sharma", email: "ramesh.sharma4321@gmail.com" },
  { name: "Geeta Patel", email: "geetapatel2405@gmail.com" },
  { name: "Suresh Singh", email: "sureshsingh7788@gmail.com" },
  { name: "Aarti Gupta", email: "aarti.g009@gmail.com" },
  { name: "Manoj Yadav", email: "manoj99yadav@gmail.com" },
  { name: "Jyoti Tiwari", email: "jyoti.tiwari9900@gmail.com" },
  { name: "Deepak Kumar", email: "deepak0101kumar@gmail.com" },
  { name: "Rekha Mishra", email: "r.mishra1234@gmail.com" },
  { name: "Vikas Chauhan", email: "vikas8877chauhan@gmail.com" },
  { name: "Swati Jain", email: "swatijain9090@gmail.com" },
  { name: "Sunil Sharma", email: "sunil.sharma0707@gmail.com" },
  { name: "Meena Patel", email: "meenapatel8765@gmail.com" },
  { name: "Arvind Singh", email: "arvind12singh@gmail.com" },
  { name: "Nisha Gupta", email: "nisha.gupta1122@gmail.com" },
  { name: "Prakash Yadav", email: "prakashyadav5544@gmail.com" },
  { name: "Sushma Tiwari", email: "sushma786tiwari@gmail.com" },
  { name: "Mukesh Kumar", email: "mukesh.k9898@gmail.com" },
  { name: "Radha Mishra", email: "radhamishra2304@gmail.com" },
  { name: "Dinesh Chauhan", email: "dinesh567chauhan@gmail.com" },
  { name: "Rupa Jain", email: "rupajain001@gmail.com" },
  { name: "Ashok Sharma", email: "ashok.sharma9988@gmail.com" },
  { name: "Lalita Patel", email: "lalitap3456@gmail.com" },
  { name: "Brijesh Singh", email: "brijesh1108singh@gmail.com" },
  { name: "Neetu Gupta", email: "neetugupta6677@gmail.com" },
  { name: "Hemant Yadav", email: "h.yadav8899@gmail.com" },
  { name: "Meenakshi Tiwari", email: "meenakshi0909@gmail.com" },
  { name: "Kamlesh Kumar", email: "kamleshkumar7766@gmail.com" },
  { name: "Usha Mishra", email: "usha1234mishra@gmail.com" },
  { name: "Harish Chauhan", email: "harish.chauhan4455@gmail.com" },
  { name: "Mamta Jain", email: "mamtajain3112@gmail.com" },
  { name: "Pravin Sharma", email: "pravin007sharma@gmail.com" },
  { name: "Radha Patel", email: "radha.patel9000@gmail.com" },
  { name: "Ramprasad Singh", email: "r.singh1508@gmail.com" },
  { name: "Nirmala Gupta", email: "nirmala1995gupta@gmail.com" },
  { name: "Jitendra Yadav", email: "jitendrayadav5432@gmail.com" },
  { name: "Kusum Tiwari", email: "kusum.t8877@gmail.com" },
  { name: "Bhupendra Kumar", email: "bhupendra123kumar@gmail.com" },
  { name: "Anitha Mishra", email: "anithamishra2233@gmail.com" },
  { name: "Prakash Chauhan", email: "p.chauhan4545@gmail.com" },
  { name: "Shanti Jain", email: "shanti1402jain@gmail.com" },
  { name: "Subhash Sharma", email: "subhashsharma8800@gmail.com" },
  { name: "Vimla Patel", email: "vimla.patel1122@gmail.com" },
  { name: "Mahendra Singh", email: "mahendra99singh@gmail.com" },
  { name: "Sheela Gupta", email: "9876sheelagupta@gmail.com" }
];

async function run() {
  console.log('=== ChainKitty 72-User On-Chain Simulation ===');
  console.log('Contract ID:', CONTRACT_ID);

  // 1. Generate 72 Users (54 provided + 18 auto-generated)
  console.log('Generating 72 unique users and keypairs...');
  const users = [];
  for (let i = 1; i <= 72; i++) {
    const kp = Keypair.random();
    let name = `Stellar Kitty Saver ${i}`;
    let email = `kitty${i}@chainkitty.org`;
    
    if (i <= rawUserData.length) {
      name = rawUserData[i - 1].name;
      email = rawUserData[i - 1].email;
    }
    
    users.push({
      id: i,
      userId: `user_${String(i).padStart(3, '0')}`,
      name,
      email,
      publicKey: kp.publicKey(),
      secret: kp.secret(),
    });
  }

  // 2. Fund all accounts via Friendbot
  console.log('\nFunding 72 accounts via Friendbot...');
  for (const u of users) {
    let attempts = 0;
    let funded = false;
    while (attempts < 10 && !funded) {
      try {
        const res = await fetch(`https://friendbot.stellar.org/?addr=${u.publicKey}`);
        const data = await res.json();
        if (data.hash) {
          console.log(`[User ${u.id}/72] Funded: ${u.publicKey}`);
          funded = true;
        } else {
          throw new Error('No hash in response');
        }
      } catch (err) {
        attempts++;
        const backoffDelay = attempts * 3000;
        console.warn(`[User ${u.id}/72] Funding attempt ${attempts} failed: ${err.message}. Retrying in ${backoffDelay}ms...`);
        await new Promise((r) => setTimeout(r, backoffDelay));
      }
    }
    if (!funded) {
      throw new Error(`Failed to fund User ${u.id}. Aborting.`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  // 3. Divide 72 users into 6 groups of 12 members each
  const groupsCount = 6;
  const membersPerGroup = 12;
  const results = [];
  const dateStr = new Date().toISOString().split('T')[0];

  console.log('\nCreating 6 Savings Circles with random contribution amounts...');
  for (let g = 0; g < groupsCount; g++) {
    const groupMembers = users.slice(g * membersPerGroup, (g + 1) * membersPerGroup);
    const organizer = groupMembers[0];
    
    // Random contribution amount between 10 and 100 XLM
    const randomXlmAmount = Math.floor(Math.random() * 91) + 10; 
    const contributionAmountStroops = BigInt(randomXlmAmount) * 10000000n;
    const duration = 86400n; // 1 day

    console.log(`\n--- Launching Savings Circle #${g + 1} with ${randomXlmAmount} XLM contribution amount ---`);

    const createOp = Operation.invokeContractFunction({
      contract: CONTRACT_ID,
      function: 'create_group',
      args: [
        nativeToScVal(Address.fromString(organizer.publicKey)),
        nativeToScVal(groupMembers.map((m) => Address.fromString(m.publicKey))),
        nativeToScVal(contributionAmountStroops, { type: 'i128' }),
        nativeToScVal(duration, { type: 'u64' }),
        nativeToScVal(membersPerGroup, { type: 'u32' }),
      ],
    });

    let createRes;
    let success = false;
    let attempts = 0;
    while (attempts < 3 && !success) {
      try {
        createRes = await sendTx(organizer, createOp);
        console.log(`Circle #${g + 1} creation confirmed! Hash: ${createRes.hash}`);
        success = true;
      } catch (err) {
        attempts++;
        console.warn(`Failed to create circle (attempt ${attempts}): ${err.message}. Retrying...`);
        await new Promise((r) => setTimeout(r, 6000));
      }
    }
    if (!success) {
      console.error(`Could not launch Circle #${g + 1}. Skipping.`);
      continue;
    }

    // Wait for ledger stability
    await new Promise((r) => setTimeout(r, 5000));

    // Retrieve group ID dynamically from return value ScVal
    const onChainGroupId = Number(scValToNative(createRes.returnValue));
    console.log(`Resolved On-chain Group ID: ${onChainGroupId}`);

    // 4. Have each member of this group contribute
    console.log(`Executing contributions for Circle #${onChainGroupId}...`);
    for (const member of groupMembers) {
      const contributeOp = Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: 'contribute',
        args: [
          nativeToScVal(BigInt(onChainGroupId), { type: 'u64' }),
          nativeToScVal(Address.fromString(member.publicKey)),
        ],
      });

      console.log(`[User ${member.id}/72] Contributing ${randomXlmAmount} XLM to Circle #${onChainGroupId}...`);
      let contributeSuccess = false;
      let cAttempts = 0;
      let txRes;
      while (cAttempts < 3 && !contributeSuccess) {
        try {
          txRes = await sendTx(member, contributeOp);
          console.log(`[User ${member.id}/72] Contribution verified! Hash: ${txRes.hash}`);
          contributeSuccess = true;
        } catch (err) {
          cAttempts++;
          console.warn(`Contribution failed (attempt ${cAttempts}): ${err.message}. Retrying...`);
          await new Promise((r) => setTimeout(r, 6000));
        }
      }

      if (contributeSuccess) {
        results.push({
          userId: member.userId,
          name: member.name,
          email: member.email,
          publicKey: member.publicKey,
          action: `Contributed ${randomXlmAmount} XLM to Group #${onChainGroupId}`,
          hash: txRes.hash,
          date: dateStr,
        });
      }
      await new Promise((r) => setTimeout(r, 2000)); // Buffer
    }
  }

  // 5. Write results to CSV file
  const csvHeaders = 'User ID,Name,Email,Wallet Address,Action Taken,Transaction Hash,Date\n';
  const csvRows = results.map(r => 
    `"${r.userId}","${r.name}","${r.email}","${r.publicKey}","${r.action}","${r.hash}","${r.date}"`
  ).join('\n');
  
  const csvPath = path.join(__dirname, '..', 'onboarded_72_users.csv');
  fs.writeFileSync(csvPath, csvHeaders + csvRows);
  console.log(`\nSuccessfully created CSV tracking file: ${csvPath}`);

  // 6. Save JSON format for frontend compatibility
  const jsonPath = path.join(__dirname, 'src', 'generated_wallets_50.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results.map(r => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    address: r.publicKey,
    action: r.action,
    hash: r.hash,
    date: r.date,
    feedback: 'Automated testnet Saver profile contribution successfully verified.'
  })), null, 2));
  console.log(`Saved 72 user profiles to ${jsonPath}`);
}

async function sendTx(user, operation) {
  const kp = Keypair.fromSecret(user.secret);
  const sourceAccount = await server.getAccount(kp.publicKey());
  
  let tx = new TransactionBuilder(sourceAccount, {
    fee: '100000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simResult)) {
    const errorSim = simResult;
    throw new Error(`Simulation failed: ${errorSim.result?.error || JSON.stringify(simResult)}`);
  }

  tx = rpc.assembleTransaction(tx, simResult).build();
  tx.sign(kp);

  const submitResult = await server.sendTransaction(tx);
  if (submitResult.status === 'ERROR') {
    throw new Error(`Submission failed: ${JSON.stringify(submitResult.errorResult)}`);
  }

  let status = submitResult.status;
  let pollCount = 0;
  while ((status === 'PENDING' || status === 'ERROR' || status === 'NOT_FOUND') && pollCount < 20) {
    await new Promise((r) => setTimeout(r, 2000));
    const txStatus = await server.getTransaction(submitResult.hash);
    status = txStatus.status;
    if (status === 'SUCCESS') {
      return {
        hash: submitResult.hash,
        returnValue: txStatus.returnValue,
      };
    }
    if (status === 'FAILED') {
      throw new Error(`Transaction execution failed.`);
    }
    pollCount++;
  }
  if (status === 'SUCCESS') {
    const txStatus = await server.getTransaction(submitResult.hash);
    return {
      hash: submitResult.hash,
      returnValue: txStatus.returnValue,
    };
  }
  throw new Error(`Transaction timeout: ${status}`);
}

run().catch(console.error);
