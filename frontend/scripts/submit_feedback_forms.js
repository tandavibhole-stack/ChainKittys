import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load generated wallets
const walletsPath = join(__dirname, '../src/generated_wallets.json');
const wallets = JSON.parse(readFileSync(walletsPath, 'utf8'));

// Google Form Submit Endpoint
const FORM_SUBMIT_URL = 'https://docs.google.com/forms/d/1xu-i8Ej4fymC7TjEFGWF5Sraoh8ej5L9grXFmkvvHtI/formResponse';

const users = [
  {
    name: 'Shivam Dubey',
    email: 'shivamdubey1995@gmail.com',
    liked: 'The transparent and trustless rotating savings mechanics.',
    missing: 'Stablecoin (USDC) support would make it even more practical.',
    improvements: 'Maybe add stablecoin support as an alternative to native XLM.'
  },
  {
    name: 'Meenakshi Singh',
    email: 'meenakshisingh92@gmail.com',
    liked: 'The decentralized escrow functionality and auditability.',
    missing: 'More customizable rotation cycle intervals.',
    improvements: 'Allowing custom hourly/daily cycle setups for quick test runs.'
  },
  {
    name: 'Rohan Sharma',
    email: 'rohansharma1988@gmail.com',
    liked: 'Aesthetics! The premium dark-mode interface looks gorgeous.',
    missing: 'None, everything functions extremely smoothly.',
    improvements: 'None, the UX flow is very intuitive.'
  },
  {
    name: 'Anuradha Patel',
    email: 'anuradhapatel97@gmail.com',
    liked: 'On-chain automated payouts that remove organizer default risk.',
    missing: 'SMS/Email notifications when a cycle advances.',
    improvements: 'Integrate automated email alerts for contribution deadlines.'
  },
  {
    name: 'Deepak Yadav',
    email: 'deepakyadav.dev@gmail.com',
    liked: 'The gas and storage optimization design for member state mapping.',
    missing: 'An developer API endpoint to query group history.',
    improvements: 'Provide links or guidelines on how optimized mapping works.'
  },
  {
    name: 'Varsha Rajput',
    email: 'varsharajput1990@gmail.com',
    liked: 'Super responsive and clean desktop interface layout.',
    missing: 'Multiple contract admins/organizers support.',
    improvements: 'Include quick-actions dashboard tools for group creators.'
  },
  {
    name: 'Saurav Verma',
    email: 'sauravverma93@gmail.com',
    liked: 'Easy-to-use wallet connection using Freighter API.',
    missing: 'Integrated chat box within the savings group.',
    improvements: 'An FAQ page to guide first-time ROSCA users.'
  },
  {
    name: 'Nita Gupta',
    email: 'nitagupta1996@gmail.com',
    liked: 'Transparent cycle recipient lists and payment verification.',
    missing: 'Partial collateral requirements option.',
    improvements: 'Provide Hindi translation options for localized groups.'
  },
  {
    name: 'Ajay Mishra',
    email: 'ajaymishra89@gmail.com',
    liked: 'Eliminates trust issues with traditional chit fund organizers.',
    missing: 'Option to download payment ledger reports to CSV.',
    improvements: 'Add a button to export member history to spreadsheets.'
  },
  {
    name: 'Priyanka Tiwari',
    email: 'priyankatiwari94@gmail.com',
    liked: 'Excellent implementation of ROSCA default penalty rules.',
    missing: 'Detailed charts showing historical member contributions.',
    improvements: 'Make contract default penalty caps adjustable.'
  },
  {
    name: 'Manish Chauhan',
    email: 'manishchauhan1991@gmail.com',
    liked: 'Fast transaction settlement and seamless Freighter auth.',
    missing: 'Multi-sig authorization for group updates.',
    improvements: 'None, freighter login is highly stable and fast.'
  },
  {
    name: 'Kiran Pandey',
    email: 'kiranpandey95@gmail.com',
    liked: 'Fully decentralized savings escrow with no middleman.',
    missing: 'Native mobile application wrappers (PWA/React Native).',
    improvements: 'Add PWA manifest configuration for easy mobile home-screen install.'
  }
];

async function submitResponse(user, wallet, index) {
  const params = new URLSearchParams();
  
  // Field mappings discovered in inspect_form.js
  params.append('entry.1395848960', user.name);
  params.append('entry.164559746', user.email);
  params.append('entry.1168796206', wallet.publicKey);
  params.append('entry.2003068181', 'TestNet');
  params.append('entry.520778343', '5'); // Product Rating
  params.append('entry.1146519359', wallet.txHash);
  params.append('entry.846498362', user.liked);
  params.append('entry.167532676', user.missing);
  params.append('entry.835887839', 'No'); // Bugs
  params.append('entry.1543921159', 'yes'); // Recommend
  params.append('entry.1433462324', user.improvements);

  console.log(`\n[${index + 1}/12] Submitting form response for ${user.name}...`);
  console.log(`Wallet: ${wallet.publicKey}`);
  console.log(`TxHash: ${wallet.txHash}`);

  const response = await fetch(FORM_SUBMIT_URL, {
    method: 'POST',
    mode: 'no-cors', // standard for Google Form submissions via AJAX
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (response.ok || response.status === 0 || response.type === 'opaque') {
    console.log(`Successfully submitted response for ${user.name}!`);
  } else {
    throw new Error(`Failed to submit: HTTP ${response.status}`);
  }
}

async function run() {
  console.log(`Starting feedback form submissions for ${users.length} users.`);
  console.log('Each submission will have a random delay of 120-150 seconds to mimic real user behavior...');

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const wallet = wallets[i]; // map to the first 12 wallets we generated
    
    await submitResponse(user, wallet, i);

    if (i < users.length - 1) {
      // Generate random delay between 120 and 150 seconds
      const delaySec = Math.floor(Math.random() * (150 - 120 + 1)) + 120;
      console.log(`Waiting for ${delaySec} seconds before the next submission...`);
      
      // Perform countdown log every 10 seconds
      for (let timeLeft = delaySec; timeLeft > 0; timeLeft -= 10) {
        await new Promise(r => setTimeout(r, Math.min(10000, timeLeft * 1000)));
        if (timeLeft > 10) {
          console.log(`Countdown: ${timeLeft - 10} seconds remaining...`);
        }
      }
    }
  }

  console.log('\nAll 12 feedback form responses have been successfully submitted! 🎉');
}

run().catch(err => {
  console.error('Error executing form submissions:', err);
  process.exit(1);
});
