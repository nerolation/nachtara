/**
 * Test StealthForwarder on Sepolia.
 * 
 * This script:
 * 1. Creates a test stealth address
 * 2. Sends ETH via the forwarder (atomic tx)
 * 3. Verifies the announcement event was emitted from ERC-5564 Announcer
 * 4. Verifies ETH arrived at stealth address
 * 5. Derives the stealth private key and verifies we can spend
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  type Hex,
  type Address,
  decodeEventLog
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import our crypto functions
import {
  generateRandomKeys,
  createStealthMetaAddress,
  generateStealthAddress,
  computeStealthPrivateKey
} from '../src/lib/crypto.js';
import { ERC5564_ANNOUNCER, STEALTH_FORWARDER } from '../src/lib/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Forwarder ABI
const FORWARDER_ABI = [
  {
    type: 'function',
    name: 'forward',
    inputs: [
      { name: 'stealthAddress', type: 'address' },
      { name: 'ephemeralPubKey', type: 'bytes' },
      { name: 'viewTag', type: 'bytes1' }
    ],
    outputs: [],
    stateMutability: 'payable'
  },
  {
    type: 'event',
    name: 'StealthPayment',
    inputs: [
      { name: 'stealthAddress', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false }
    ]
  }
] as const;

// ERC-5564 Announcement event ABI
const ANNOUNCEMENT_EVENT = {
  type: 'event',
  name: 'Announcement',
  inputs: [
    { name: 'schemeId', type: 'uint256', indexed: true },
    { name: 'stealthAddress', type: 'address', indexed: true },
    { name: 'caller', type: 'address', indexed: true },
    { name: 'ephemeralPubKey', type: 'bytes', indexed: false },
    { name: 'metadata', type: 'bytes', indexed: false }
  ]
} as const;

async function main() {
  console.log('=== StealthForwarder Test on Sepolia ===\n');

  // Load private key
  let privateKey: Hex;
  try {
    privateKey = ('0x' + readFileSync(join(__dirname, '..', '..', 'archive', 'misc', 'pk.txt'), 'utf8').trim()) as Hex;
  } catch {
    console.error('Could not read private key from archive/misc/pk.txt');
    process.exit(1);
  }

  const rpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com';
  const forwarderAddress = STEALTH_FORWARDER[11155111];

  if (!forwarderAddress) {
    console.error('No forwarder deployed on Sepolia');
    process.exit(1);
  }

  console.log('Forwarder:', forwarderAddress);
  console.log('Announcer:', ERC5564_ANNOUNCER);

  const account = privateKeyToAccount(privateKey);
  console.log('Sender:', account.address);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl)
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl)
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Balance:', formatEther(balance), 'ETH\n');

  if (balance < parseEther('0.001')) {
    console.error('Insufficient balance for test');
    process.exit(1);
  }

  // Step 1: Generate recipient stealth keys
  console.log('Step 1: Generate recipient stealth keys...');
  const recipientKeys = generateRandomKeys();
  const recipientMeta = createStealthMetaAddress(recipientKeys);
  console.log('  Recipient meta-address:', recipientMeta.slice(0, 20) + '...');

  // Step 2: Generate stealth address for payment
  console.log('\nStep 2: Generate one-time stealth address...');
  const stealthInfo = generateStealthAddress(recipientMeta);
  console.log('  Stealth address:', stealthInfo.stealthAddress);
  console.log('  Ephemeral pubkey:', stealthInfo.ephemeralPublicKey.slice(0, 20) + '...');
  console.log('  View tag:', stealthInfo.viewTag);

  // Step 3: Send via forwarder
  const testAmount = '0.0001'; // Small amount for testing
  console.log(`\nStep 3: Send ${testAmount} ETH via forwarder...`);

  const { request } = await publicClient.simulateContract({
    address: forwarderAddress,
    abi: FORWARDER_ABI,
    functionName: 'forward',
    args: [
      stealthInfo.stealthAddress,
      stealthInfo.ephemeralPublicKey,
      stealthInfo.viewTag as `0x${string}`
    ],
    value: parseEther(testAmount),
    account: account
  });

  const txHash = await walletClient.writeContract(request);
  console.log('  Transaction:', txHash);

  console.log('  Waiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log('  Block:', receipt.blockNumber.toString());
  console.log('  Gas used:', receipt.gasUsed.toString());
  console.log('  Status:', receipt.status);

  if (receipt.status !== 'success') {
    console.error('Transaction failed!');
    process.exit(1);
  }

  // Step 4: Verify events
  console.log('\nStep 4: Verify events...');

  // Find StealthPayment event from forwarder
  const stealthPaymentLog = receipt.logs.find(
    log => log.address.toLowerCase() === forwarderAddress.toLowerCase()
  );

  if (stealthPaymentLog) {
    console.log('  ✓ StealthPayment event emitted from forwarder');
  } else {
    console.log('  ⚠ StealthPayment event not found (non-critical)');
  }

  // Find Announcement event from ERC-5564 Announcer
  const announcementLog = receipt.logs.find(
    log => log.address.toLowerCase() === ERC5564_ANNOUNCER.toLowerCase()
  );

  if (!announcementLog) {
    console.error('  ✗ Announcement event NOT found from ERC-5564 Announcer!');
    process.exit(1);
  }

  console.log('  ✓ Announcement event emitted from ERC-5564 Announcer');

  // Decode announcement
  const decoded = decodeEventLog({
    abi: [ANNOUNCEMENT_EVENT],
    data: announcementLog.data,
    topics: announcementLog.topics
  });

  console.log('  Announcement details:');
  console.log('    schemeId:', decoded.args.schemeId.toString());
  console.log('    stealthAddress:', decoded.args.stealthAddress);
  console.log('    caller:', decoded.args.caller, '(forwarder)');
  console.log('    ephemeralPubKey:', (decoded.args.ephemeralPubKey as string).slice(0, 20) + '...');
  console.log('    metadata (viewTag):', decoded.args.metadata);

  // Verify caller is the forwarder (not the sender)
  if (decoded.args.caller.toLowerCase() !== forwarderAddress.toLowerCase()) {
    console.error('  ✗ Caller is not the forwarder!');
    process.exit(1);
  }
  console.log('  ✓ Caller is forwarder (privacy preserved)');

  // Step 5: Verify ETH arrived
  console.log('\nStep 5: Verify ETH received...');
  const stealthBalance = await publicClient.getBalance({
    address: stealthInfo.stealthAddress
  });
  console.log('  Stealth address balance:', formatEther(stealthBalance), 'ETH');

  if (stealthBalance !== parseEther(testAmount)) {
    console.error('  ✗ Balance mismatch!');
    process.exit(1);
  }
  console.log('  ✓ Correct amount received');

  // Step 6: Derive stealth private key and verify
  console.log('\nStep 6: Derive stealth private key...');
  const stealthPrivateKey = computeStealthPrivateKey(
    stealthInfo.ephemeralPublicKey,
    recipientKeys.spendingPrivateKey,
    recipientKeys.viewingPrivateKey
  );

  if (!stealthPrivateKey) {
    console.error('  ✗ Could not derive stealth private key!');
    process.exit(1);
  }

  const stealthAccount = privateKeyToAccount(stealthPrivateKey);
  console.log('  Derived address:', stealthAccount.address);

  if (stealthAccount.address.toLowerCase() !== stealthInfo.stealthAddress.toLowerCase()) {
    console.error('  ✗ Derived address does not match stealth address!');
    process.exit(1);
  }
  console.log('  ✓ Private key correctly derives to stealth address');

  // Step 7: Test we can spend from stealth address (optional - costs gas)
  console.log('\nStep 7: Test spending from stealth address...');
  
  const stealthWallet = createWalletClient({
    account: stealthAccount,
    chain: sepolia,
    transport: http(rpcUrl)
  });

  // Send a tiny amount back to sender to prove we control the key
  const gasPrice = await publicClient.getGasPrice();
  const gasCost = gasPrice * 21000n;
  const sendBack = stealthBalance - gasCost - gasCost; // Leave buffer

  if (sendBack > 0n) {
    const withdrawTx = await stealthWallet.sendTransaction({
      to: account.address,
      value: sendBack
    });
    console.log('  Withdraw tx:', withdrawTx);

    const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
    if (withdrawReceipt.status === 'success') {
      console.log('  ✓ Successfully spent from stealth address');
    } else {
      console.error('  ✗ Withdraw failed');
    }
  } else {
    console.log('  (Skipped - not enough to cover gas)');
  }

  // Summary
  console.log('\n=== TEST PASSED ===');
  console.log('The StealthForwarder correctly:');
  console.log('  1. Forwards ETH to stealth address');
  console.log('  2. Emits Announcement via ERC-5564 Announcer');
  console.log('  3. Records forwarder (not sender) as caller');
  console.log('  4. All in a single atomic transaction');
  console.log('');
  console.log('Transaction:', `https://sepolia.etherscan.io/tx/${txHash}`);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
