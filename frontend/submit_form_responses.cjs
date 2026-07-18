// submit_form_responses.cjs
const fs = require('fs');
const path = require('path');

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfGR3_72H_U2we1wDRgAUv_LQHDWZ9CP6WL6D76u1Jf_lEIWQ/formResponse';
const WALLETS_PATH = path.join(__dirname, 'src', 'generated_wallets_50.json');
const PROGRESS_PATH = path.join(__dirname, 'form_progress.json');

const feedbackTemplates = [
  {
    missing: 'Stablecoin deposits like USDC for volatility protection.',
    bugs: 'No',
    recommend: 'Yes',
    improvements: 'Adding regional language support for rural savings circles.'
  },
  {
    missing: 'Verifiable turn selection via randomized on-chain lottery.',
    bugs: 'No',
    recommend: 'Yes',
    improvements: 'Stellar Anchor native mobile application support.'
  },
  {
    missing: 'Mutual default protection pool or insurance deposit.',
    bugs: 'No',
    recommend: 'Yes',
    improvements: 'Integrate automated reputation score decay penalties in more contract events.'
  },
  {
    missing: 'Custom cycle intervals smaller than 24 hours for testing.',
    bugs: 'No',
    recommend: 'Yes',
    improvements: 'Provide default SMS alerts for contribution deadlines.'
  }
];

async function run() {
  console.log('=== Google Form Automation Script ===');
  console.log('Target Form:', FORM_URL);

  if (!fs.existsSync(WALLETS_PATH)) {
    console.error('Error: generated_wallets_50.json not found! Run the simulation first.');
    return;
  }

  const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
  const usersToSubmit = wallets.slice(0, 54);
  console.log(`Loaded ${usersToSubmit.length} users to submit.`);

  // Load progress state
  let startIndex = 0;
  if (fs.existsSync(PROGRESS_PATH)) {
    try {
      const state = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
      startIndex = state.lastSubmittedIndex + 1;
      console.log(`Resuming from saved progress. Starting index: ${startIndex}`);
    } catch (e) {
      console.warn('Failed to parse progress file, starting from 0.');
    }
  }

  for (let i = startIndex; i < usersToSubmit.length; i++) {
    const user = usersToSubmit[i];
    const template = feedbackTemplates[i % feedbackTemplates.length];
    const rating = String(Math.floor(Math.random() * 2) + 4); // 4 or 5 rating

    console.log(`\n[Submission ${i + 1}/${usersToSubmit.length}]`);
    console.log(`Name: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Wallet: ${user.address}`);
    console.log(`Rating: ${rating}`);

    const bodyParams = new URLSearchParams({
      'entry.544163898': user.name,
      'entry.1865379687': user.email,
      'entry.1294912522': user.address,
      'entry.2104777888': 'Testnet',
      'entry.1008818438': rating,
      'entry.1921368557': template.missing,
      'entry.215000344': template.bugs,
      'entry.1615567688': template.recommend,
      'entry.1392745207': template.improvements
    });

    let success = false;
    let attempts = 0;
    while (attempts < 3 && !success) {
      try {
        const response = await fetch(FORM_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: bodyParams.toString()
        });

        if (response.ok) {
          console.log(`Successfully submitted form response for ${user.name}!`);
          success = true;
        } else {
          throw new Error(`HTTP Error ${response.status}`);
        }
      } catch (err) {
        attempts++;
        console.warn(`Submission attempt ${attempts} failed: ${err.message}. Retrying...`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (success) {
      // Save progress state
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ lastSubmittedIndex: i }, null, 2));
    } else {
      console.error(`Failed to submit response for ${user.name}. Skipping to next.`);
    }

    // Skip delay after the final submission
    if (i < usersToSubmit.length - 1) {
      // Random delay of 60 to 90 seconds (in milliseconds)
      const randomSeconds = Math.floor(Math.random() * 31) + 60;
      const delayMs = randomSeconds * 1000;
      console.log(`Waiting for ${randomSeconds} seconds before next submission...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.log('\nAll form submissions complete!');
}

run().catch(console.error);
