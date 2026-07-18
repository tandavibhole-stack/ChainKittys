# ChainKitty Demo Video Script (2-3 Minutes)

This script and shot-list coordinates the production of the ChainKitty demo video.

---

## Shot 1: Introduction & Landing Page (0:00 - 0:20)
* **Visual**: Clean browser showing the ChainKitty landing page. The mouse points to the app logo and header details.
* **Audio Narration**: "Hi everyone! Welcome to ChainKitty, a transparent and secure digital ROSCA—commonly known as a chit fund—built on Stellar's Soroban smart contract framework. Traditional savings circles suffer from organizer fraud and manual errors. ChainKitty solves this by putting pool funds in trustless smart contracts."

---

## Shot 2: Onboarding Wizard (0:20 - 0:45)
* **Visual**: Click "Connect Wallet". Freighter wallet extension pops up, user logs in. The app shifts to the Onboarding Wizard. Click "Fund via Stellar Friendbot". The page shows the wallet address and verifies funding success.
* **Audio Narration**: "To make onboarding frictionless, we've introduced a guided first-time-user wizard. In three simple steps, users can connect their Freighter wallet, fund their Testnet address directly from Stellar Friendbot, and prepare to join their first savings circle."

---

## Shot 3: Group Discovery (0:45 - 1:10)
* **Visual**: Click the "Group Discovery" tab. Shows a list of open forming groups. Select "Savings Circle #3" and click "Join Circle". Approve the transaction in Freighter wallet. Show loading spinner, then redirect to Dashboard.
* **Audio Narration**: "Instead of relying on exclusive email invites, users can now browse our new public Group Discovery page. Here, they can search for forming groups, view the contribution requirements, and join them with a single click—fully verified on-chain."

---

## Shot 4: Circle Dashboard & Deadline Notification (1:10 - 1:35)
* **Visual**: The Dashboard for Circle #3 loads. At the top, a prominent red deadline warning banner is displayed. Click "Schedule Email Reminder". Click the "Contribute" button. Freighter wallet prompts for signature, transaction is signed. Banner disappears, and the pool status bar advances.
* **Audio Narration**: "Once inside a group, our proactive notification system displays clear banners for upcoming payment deadlines. Savers can configure an automated email reminder hook or contribute directly. Contributions are transferred securely into the Soroban escrow contract."

---

## Shot 5: Member Reputation Cards (1:35 - 2:00)
* **Visual**: Scroll down to the "Cycle Member Reputation" table. Hover over a member card showing a reputation bar at 100%, and another card showing 75% reputation due to a default penalty.
* **Audio Narration**: "We have also built an on-chain Member Reputation scoring system. Every time a member misses a deadline, organizers can flag a default. The contract decreases their reputation score, causing a permanent 10% payout penalty per default, capped at 50%. This creates a strong incentive for timely contributions."

---

## Shot 6: Payout Release & Transaction Confirmation (2:00 - 2:30)
* **Visual**: Click "Trigger Payout & Advance". Freighter prompts for signing. After a few seconds, a beautiful Transaction Confirmation popup appears showing "Success", transaction hash, and a link to Stellar.expert.
* **Audio Narration**: "When the cycle concludes, the organizer triggers the payout. The contract calculates default penalties, releases the savings pool to the designated recipient, and advances to the next cycle. When complete, a transaction confirmation screen provides the explorer transaction link."

---

## Shot 7: Analytics & Monitoring (2:30 - 2:50)
* **Visual**: Switch tabs to show the PostHog event dashboard or Sentry logging console, demonstrating user actions being recorded.
* **Audio Narration**: "Under the hood, ChainKitty is production-ready. We've integrated PostHog for product analytics and Sentry for error tracking, ensuring we maintain a high-quality user experience as we scale."

---

## Shot 8: Outro & Pitch (2:50 - 3:00)
* **Visual**: Logo of ChainKitty and slide asking viewers to try the live demo URL.
* **Audio Narration**: "ChainKitty is empowering communities by digitizing trust. Check out our live testnet demo and help us bank the underbanked. Thank you!"
