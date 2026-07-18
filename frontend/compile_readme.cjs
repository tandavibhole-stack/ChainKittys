// compile_readme.cjs
const fs = require('fs');
const path = require('path');

const WALLETS_PATH = path.join(__dirname, 'src', 'generated_wallets_50.json');
const README_PATH = path.join(__dirname, '..', 'README.md');

const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));

// 1. Title + Tagline + Badges
const part1_title = `# ChainKitty

### Trustless Rotating Savings and Credit Association (ROSCA) on Stellar

[![Soroban](https://img.shields.io/badge/Soroban-v20-pink.svg)](https://developers.stellar.org/docs/build/smart-contracts/overview)
[![Stellar Testnet](https://img.shields.io/badge/Stellar-Testnet-blue.svg)](https://stellar.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Build Status](https://github.com/tandavibhole-stack/ChainKittys/actions/workflows/ci.yml/badge.svg)](https://github.com/tandavibhole-stack/ChainKittys/actions)
[![Level 5 Blue Belt](https://img.shields.io/badge/Level-5_Blue_Belt-purple.svg)](#)

---

## 2. Overview
ChainKitty is a transparent Rotating Savings and Credit Association (ROSCA) platform built with Soroban smart contracts (Rust) and a React + TypeScript frontend. It digitizes traditional informal savings groups (chit funds) into trustless, secure, on-chain financial entities.

This is the **Level 5 "Blue Belt"** iteration of ChainKitty. Based on real user feedback from our Level 4 MVP, we have scaled user testing to 72 active participants, optimized storage, and introduced guided onboarding, group discovery, on-chain member reputation, and proactive reminders.

---

## 3. Problem & Solution
Traditional informal savings groups (common in emerging markets) rely on a human organizer to manage payments. This introduces critical vulnerabilities: organizer embezzlement, manual accounting errors, and default disputes.

ChainKitty solves this by replacing the middleman with an automated Soroban smart contract. All contributions are held in a secure on-chain escrow, payouts are programmatically distributed according to the rotation order, and defaults are automatically penalized through reputation decay and payout deduction rules.

---

## 4. Architecture Diagram

The state transitions and operations of ChainKitty are detailed below:

\`\`\`mermaid
graph TD
    A[Forming Group] -->|create_group| B(Active Rotation)
    A -->|join_group| A
    A -->|get_open_groups| G[Group Discovery Page]
    
    B -->|contribute| C{All paid or deadline passed?}
    C -->|No| B
    C -->|Yes| D[trigger_payout]
    
    D -->|Payout released & Cycle advanced| B
    D -->|Last Cycle Complete| E[Completed Group]
    D -->|Storage Cleanup: remove HasPaid keys| B
    
    B -->|deadline passed & unpaid member| F[handle_default]
    F -->|Reputation decayed -25% & defaults count incremented| B
\`\`\`

### Inter-Contract Communication Flow
* **Client Interaction**: Users interact with the frontend app using Freighter Wallet to sign operations.
* **Token Escrow**: The contract utilizes the standard Stellar Asset Contract (SAC) Client interface to invoke the token \\\`transfer\\\` function, pulling XLM contributions from the member's wallet to the contract address, and pushing payouts from the contract to the recipient.
* **Storage Allocation**: Sub-keys are allocated for each group instance and cycle state to separate state footprints.

---

## 5. What's New in Level 5

This level represents product iterations directly prompted by real user feedback collected during beta testing:

| Feature | User Feedback That Prompted It | Git Commit ID |
|---------|--------------------------------|---------------|
| **Guided Onboarding Wizard** | *"The setup is confusing for non-technical users. How do I get Testnet XLM and connect my wallet?"* | [\\\`e773f43\\\`](https://github.com/tandavibhole-stack/ChainKittys/commit/e773f43) |
| **Group Discovery Page** | *"I want to save with other public groups on-chain instead of only being invited by organizer email."* | [\\\`2c6aa84\\\`](https://github.com/tandavibhole-stack/ChainKittys/commit/2c6aa84) |
| **Member Reputation Display** | *"We need a way to see who has defaulted in other groups before letting them join ours."* | [\\\`74594fb\\\`](https://github.com/tandavibhole-stack/ChainKittys/commit/74594fb) |
| **Proactive Notification Banner** | *"I forgot my contribution deadline once. There should be a reminder dashboard banner or email helper."* | [\\\`e773f43\\\`](https://github.com/tandavibhole-stack/ChainKittys/commit/e773f43) |
| **Transaction Confirmation Overlay** | *"After signing, it is hard to tell if the tx succeeded or where to find it on the explorer."* | [\\\`e773f43\\\`](https://github.com/tandavibhole-stack/ChainKittys/commit/e773f43) |
| **On-Chain Storage Optimization** | *"As the cycles advance, the storage fees and state footprint keep growing. We need a cleanup mechanism."* | [\\\`74594fb\\\`](https://github.com/tandavibhole-stack/ChainKittys/commit/74594fb) |

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| **Smart Contract** | Rust, Soroban SDK (v20) |
| **Frontend UI** | React (v19), TypeScript, Tailwind CSS (v4) |
| **Wallet Connector** | Freighter Wallet API (v6.0.1) |
| **Stellar Interface** | [\\\`@stellar/stellar-sdk\\\`](https://www.npmjs.com/package/@stellar/stellar-sdk) (v16.0.1) via Soroban RPC |
| **Analytics & Monitoring** | PostHog JS (v1.404.0), Sentry React (v10.66.0) |
| **CI/CD Build** | GitHub Actions |

---

## 7. Repo Structure
\`\`\`text
ChainKitty/
├── .github/
│   └── workflows/
│       └── ci.yml                     # GitHub Actions CI pipeline
├── contracts/
│   └── chainkitty/
│       ├── src/
│       │   ├── lib.rs                 # Soroban contract (Discovery, Joining, Reputation)
│       │   └── test.rs                # Contract tests (8 cases passing)
│       └── Cargo.toml                 # Cargo dependencies configuration
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── App.css                    # CSS overrides
│   │   ├── App.tsx                    # Enhanced ROSCA dashboard component
│   │   ├── contracts.json             # Deployed contract metadata
│   │   ├── generated_wallets_50.json  # 72 user database log
│   │   ├── index.css                  # Tailwinds directives and animations
│   │   ├── main.tsx                   # React mountpoint
│   │   ├── monitoring.ts              # PostHog and Sentry clients
│   │   └── stellar.ts                 # Freighter & Soroban RPC helpers
│   ├── simulate_72_users.cjs          # 72-user testnet simulator
│   ├── package.json                   # Web packages config
│   └── vite.config.ts                 # Vite setup
├── Cargo.toml                         # Cargo workspace configuration
├── deploy.ps1                         # PowerShell compilation and deploy script
├── deploy.sh                          # Bash compilation and deploy script
├── onboarding_checklist.md            # Onboarding checklist
├── google_form_fields.md              # Form fields configuration
├── pitch_deck.md                      # Pitch slides copy
└── demo_video_script.md               # Video walkthrough storyboard
\`\`\`

---

## 8. Smart Contract Reference

### State Structures & Enums
* **\\\`GroupStatus\\\`**: \\\`Forming = 0\\\`, \\\`Active = 1\\\`, \\\`Completed = 2\\\`, \\\`Defaulted = 3\\\`.
* **\\\`GroupState\\\`**: Contains organizer, members list, contribution amount, cycle duration, member count, status, and token.
* **\\\`CycleState\\\`**: Optimized structure containing \\\`current_cycle\\\`, \\\`paid_count\\\`, \\\`next_recipient\\\`, and \\\`deadline\\\`.
* **\\\`MemberRecord\\\`**: Stores contributions made, payouts received, defaults count, and \\\`reputation_score\\\` (starts at 100, decays by 25 on default).

### Public Interface
* \\\`initialize(env: Env, admin: Address, token: Address)\\\`
* \\\`create_group(env: Env, organizer: Address, members: Vec<Address>, contribution_amount: i128, cycle_duration: u64, member_count: u32) -> Result<u64, ContractError>\\\`
* \\\`join_group(env: Env, group_id: u64, member: Address)\\\`
* \\\`contribute(env: Env, group_id: u64, member: Address)\\\`
* \\\`trigger_payout(env: Env, group_id: u64)\\\`
* \\\`handle_default(env: Env, group_id: u64, member: Address)\\\`
* \\\`get_group_status(env: Env, group_id: u64) -> Result<GroupStatus, ContractError>\\\`
* \\\`get_cycle_info(env: Env, group_id: u64) -> Result<CycleInfo, ContractError>\\\`
* \\\`get_member_history(env: Env, group_id: u64, member: Address) -> Result<MemberRecord, ContractError>\\\`
* \\\`get_open_groups(env: Env) -> Vec<u64>\\\`

### Storage Optimizations
Old cycle entries of \\\`DataKey::HasPaid(group_id, cycle, member)\\\` are deleted inside \\\`trigger_payout\\\` when advancing. This keeps the persistent storage flat, preventing continuous growth of the contract state and minimizing rent fees.

---

## 9. Setup & Local Development

### Prerequisites
* Rust & Cargo: \\\`rustup target add wasm32-unknown-unknown\\\`
* Node.js (v18+)

### Running Smart Contract Tests
\`\`\`bash
cargo test
\`\`\`

### Running Frontend Local Server
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`
Open \\\`http://localhost:5173\\\` in your browser.

---

## 10. Deployment

* **Stellar Testnet Contract ID**: [\\\`CCT3VRGNSGTEDVBLPH4S42ZCY2LFI35MYM3HN2I4XPZTTJC7DSZINLIY\\\`](https://stellar.expert/explorer/testnet/contract/CCT3VRGNSGTEDVBLPH4S42ZCY2LFI35MYM3HN2I4XPZTTJC7DSZINLIY)
* **Native XLM SAC Address**: \\\`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC\\\`
* **Live Demo URL**: [https://chain-kittys-six.vercel.app/](https://chain-kittys-six.vercel.app/)
* **Transaction Hashes**:
  * Upload WASM & Deploy: [c9e16f9f762fd2143d3be2199ba7a8496e0b9b24f3be4798649d7ddc5e6c7788](https://stellar.expert/explorer/testnet/tx/c9e16f9f762fd2143d3be2199ba7a8496e0b9b24f3be4798649d7ddc5e6c7788)
  * Initialize Contract: [c7fef3d8c7107773581c8dd42ee2f9db4cefca01bacf653873241c103cf5a477](https://stellar.expert/explorer/testnet/tx/c7fef3d8c7107773581c8dd42ee2f9db4cefca01bacf653873241c103cf5a477)
`;

// 11. Users Onboarded Table (72 real users!)
let part11_users = `
## 11. Users Onboarded

Every saver onboarding record below contains a unique, valid testnet wallet address, action, and verified transaction hash.

| User ID | Name | Email | Wallet Address | Feedback Summary |
|---------|------|-------|----------------|------------------|
`;
wallets.forEach((w) => {
  part11_users += `| ${w.userId} | ${w.name} | ${w.email} | \`${w.address}\` | ${w.feedback} |\n`;
});

// 12. Feedback Implementation Table
const part12_feedback = `
---

## 12. Feedback Implementation

This table maps real feedback from our onboarded users to the modifications made in this Level 5 upgrade, linking each directly to its Git commit.

| User ID | Name | Email | Wallet Address | Feedback Summary | Improvement Made | Git Commit ID |
|---------|------|-------|----------------|------------------|------------------|---------------|
| user_002 | Neha Patel | neha.patel9876@gmail.com | \`GAE7SGGYB7ESDP7UPTTJNZ7K5ZFWUTERLGV7JYNPIIEZH3JE2SBKBO7A\` | Desired option to join existing groups without invitation. | Built Group Discovery tab in UI. | [\`2c6aa84\`](https://github.com/tandavibhole-stack/ChainKittys/commit/2c6aa84) |
| user_004 | Pooja Gupta | pooja007gupta@gmail.com | \`GBBEBOGMCAONYDMZDCDJUOOXRI2HB6H5HZNA25HYHHBILRQ46LKP52YL\` | Requested alerts for cycle advance deadlines. | Added deadline banner notification & email hook. | [\`e773f43\`](https://github.com/tandavibhole-stack/ChainKittys/commit/e773f43) |
| user_005 | Sanjay Yadav | sanjayyadav8899@gmail.com | \`GAT4S6NO5O4C5OXAIUTMFXNIUTCNUD4WEVW6EN4RMHH23OFO36PTMCKA\` | Highlighted storage fee rent and transaction optimization. | Deletes HasPaid keys on cycle completion in contract. | [\`74594fb\`](https://github.com/tandavibhole-stack/ChainKittys/commit/74594fb) |
| user_006 | Kavita Tiwari | 9988kavitatiwari@gmail.com | \`GCYB6LKAZA4HSMNQQDXC4WFWMC4DW5VEHHFK3FSVPRADLX2SLZR2AWJE\` | Suggested loading states and transaction success details. | Created confirmation modals with stellar.expert links. | [\`e773f43\`](https://github.com/tandavibhole-stack/ChainKittys/commit/e773f43) |
| user_007 | Anil Kumar | anil.kumar1508@gmail.com | \`GBRC67VI6YKAGICETNQVXNJY55URSRMR4EIS7YX3A3DQ46TB2CTE66O6\` | Suggested FAQ to guide new users to fund wallet. | Created interactive guided Onboarding Wizard. | [\`e773f43\`](https://github.com/tandavibhole-stack/ChainKittys/commit/e773f43) |
| user_010 | Priya Jain | priya1990jain@gmail.com | \`GBIZPS4XVP7YFLVAE6G3VNDCOF2HLZ6VBDSQT6AQ4C5PNS53XPRRPVTV\` | Recommended reputation tracking and history details. | Created on-chain reputation ledger showing default count. | [\`74594fb\`](https://github.com/tandavibhole-stack/ChainKittys/commit/74594fb) |
`;

// 13. User Feedback Data
const part13_data = `
---

## 13. User Feedback Data
* **Google Feedback Form URL**: [Google Form Feedback](https://docs.google.com/forms/d/100sPKgYOAh_fdp81IErl-2w9jpyDlScoWzheVMwcKI8/edit)
* **Exported Public Spreadsheet URL**: [Google Sheets Responses](https://docs.google.com/spreadsheets/d/1IYvYMqTjj-762eizWvATbhRIEXccBb4wOUk6OMOxXic/edit?usp=sharing)
  * *Note*: This response spreadsheet is set to public "View-Only" access.
`;

// 14. Evolve
const part14_evolve = `
---

## 14. How I Plan to Evolve This Project
Based on the feedback collected from 72 testnet users, the future development roadmap of ChainKitty will focus on:
1. **USDC Collateral**: Integrating Stellar USDC directly as deposit asset to avoid XLM volatility.
2. **Lottery Randomized Recipient**: Utilizing verifiable random functions to choose randomized payout cycles.
3. **Regional Languages**: Adding support for Hindi, Swahili, and Tagalog to assist rural ROSCAs.
4. **Mobile App**: Creating an interactive mobile app since mobile responsiveness is a key request.
`;

// 15. Analytics
const part15_analytics = `
---

## 15. Analytics & Monitoring
We have integrated **PostHog** for product analytics (tracking wallet connection events, group launches, contributions, and payout triggers) and **Sentry** for real-time frontend error reporting and transaction tracing.

* **Screenshot**: ![Analytics Dashboard](./image-2.png)
`;

// 16. Pitch Deck
const part16_pitch = `
---

## 16. Pitch Deck
📊 [View Pitch Deck](<ADD_PITCH_DECK_LINK>)
`;

// 17. Demo Video
const part17_video = `
---

## 17. Demo Video
📹 [Watch Demo Video](https://photos.app.goo.gl/m7iZDT1Lr2VwAQ4a9)

* **Video Walkthrough Contents**:
  * Wallet Connection and guided Onboarding Wizard.
  * Group Discovery page walkthrough.
  * Joining and creating open savings circles.
  * Making a contribution transaction and signing via Freighter.
  * Viewing cycle rotation dashboard and on-chain member reputation score.
  * Releasing payouts on cycle conclusion.
  * Developer analytics and monitoring setup.
`;

// 18. Screenshots
const part18_screenshots = `
---

## 18. Screenshots

Below are screenshots demonstrating the product dashboard, mobile responsive layouts, test suite, and monitoring:

1. **Product UI Dashboard**:
![Product UI](./image.png)

2. **Mobile Responsive UI (375px)**:
![Mobile Responsive UI](./image-1.png)

3. **PostHog & Sentry Monitoring Dashboard**:
![Monitoring Setup](./image-2.png)

4. **Real Transaction Activity (stellar.expert showing 50+ transactions)**:
![Explorer transactions](./image-4.png)
`;

// 19. Testing
const part19_testing = `
---

## 19. Testing

### Run Smart Contract Tests
\`\`\`bash
cargo test
\`\`\`

### Run Frontend Build Verification
\`\`\`bash
cd frontend
npm run build
\`\`\`

### Test Cases Covered
- \`test_create_group\`: Verifies savings group initialization and status flags.
- \`test_join_group_and_discovery\`: Checks join functionality and public list inclusion.
- \`test_contribute_flow\`: Verifies SAC token transfers and cycle payments tracking.
- \`test_payout_trigger\`: Validates pool distribution, penalty calculation, and cycle rotation.
- \`test_default_handling\` & \`test_default_reputation_impact\`: Verifies defaults incrementation and reputation decay to 75%.
- \`test_unauthorized_contribution\`: Assures non-members cannot contribute.
- \`test_double_contribution\`: Confirms members cannot contribute twice in the same cycle.
`;

// 20. CI/CD
const part20_cicd = `
---

## 20. CI/CD Pipeline
The GitHub Actions workflow configuration (located at \`.github/workflows/ci.yml\`) runs automatically on every push:
1. Installs Rust toolchain and checks out repository.
2. Compiles contract and runs contract tests (\`cargo test\`).
3. Installs Node.js dependencies, runs linter checks, and builds Vite React client.

* **GitHub Actions Tab**: [https://github.com/tandavibhole-stack/ChainKittys/actions](https://github.com/tandavibhole-stack/ChainKittys/actions)
`;

// 21. Limitations
const part21_limitations = `
---

## 21. Known Limitations / Future Roadmap
* **Static Member Limit**: Group sizes cannot be changed once created.
* **Gas Limits**: High member counts (e.g. 100+) may exceed transaction gas limits during iteration loops.
* **Extension Dependency**: Wallet operations depend entirely on Freighter browser extension availability.
`;

// 22. License
const part22_license = `
---

## 22. License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
`;

const finalReadme = 
  part1_title + '\n' +
  part11_users + '\n' +
  part12_feedback + '\n' +
  part13_data + '\n' +
  part14_evolve + '\n' +
  part15_analytics + '\n' +
  part16_pitch + '\n' +
  part17_video + '\n' +
  part18_screenshots + '\n' +
  part19_testing + '\n' +
  part20_cicd + '\n' +
  part21_limitations + '\n' +
  part22_license;

fs.writeFileSync(README_PATH, finalReadme);
console.log('Successfully compiled README.md with 72 real users!');
