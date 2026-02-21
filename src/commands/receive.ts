/**
 * Receive command - scan for incoming stealth payments.
 */

import inquirer from 'inquirer';
import type { Hex } from 'viem';
import { formatEther } from 'viem';
import { loadWallet, getWalletInfo } from '../lib/storage.js';
import {
  getCurrentNetwork,
  fetchAnnouncements,
  getBalance,
  getBlockNumber
} from '../lib/network.js';
import {
  checkStealthAddress,
  computeStealthPrivateKey,
  extractViewTag
} from '../lib/crypto.js';
import type { AnnouncementData, OwnedStealthAddress } from '../lib/types.js';
import {
  printHeader,
  printSubheader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printStealthAddresses,
  printNetworkInfo,
  printKeyValue,
  startSpinner,
  stopSpinner,
  updateSpinner
} from '../ui/display.js';

// Cache for discovered stealth addresses in this session
let discoveredAddresses: OwnedStealthAddress[] = [];

export async function receiveCommand(options: {
  full?: boolean;
  fromBlock?: string;
}): Promise<void> {
  printHeader('Scan for Stealth Payments');

  // Check wallet
  const walletInfo = await getWalletInfo();
  if (!walletInfo) {
    printError('No wallet found. Run `stealth-wallet init` first.');
    return;
  }

  const network = await getCurrentNetwork();
  printNetworkInfo(network);
  console.log();

  // Get password
  const { password } = await inquirer.prompt<{ password: string }>([
    {
      type: 'password',
      name: 'password',
      message: 'Enter wallet password:',
      mask: '*'
    }
  ]);

  // Load wallet
  const loadSpinner = startSpinner('Loading wallet...');
  let wallet;
  try {
    wallet = await loadWallet(password);
    stopSpinner(true, 'Wallet loaded');
  } catch (error) {
    stopSpinner(false, 'Failed to load wallet');
    printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return;
  }

  // Fetch announcements
  const fromBlock = options.fromBlock ? BigInt(options.fromBlock) : undefined;
  
  const fetchSpinner = startSpinner('Fetching announcements...');
  
  let announcements: AnnouncementData[];
  try {
    const currentBlock = await getBlockNumber();
    updateSpinner(`Fetching announcements (up to block ${currentBlock})...`);
    
    announcements = await fetchAnnouncements({
      fromBlock: options.full ? undefined : fromBlock
    });
    
    stopSpinner(true, `Found ${announcements.length} announcements`);
  } catch (error) {
    stopSpinner(false, 'Failed to fetch announcements');
    printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return;
  }

  if (announcements.length === 0) {
    printInfo('No new announcements found.');
    return;
  }

  // Scan announcements
  const scanSpinner = startSpinner('Scanning for your payments...');
  
  const ownedAddresses: OwnedStealthAddress[] = [];
  let scanned = 0;

  for (const announcement of announcements) {
    scanned++;
    if (scanned % 100 === 0) {
      updateSpinner(`Scanning... ${scanned}/${announcements.length}`);
    }

    const viewTag = extractViewTag(announcement.metadata);

    const isOurs = checkStealthAddress(
      announcement.ephemeralPubKey,
      wallet.keys.spendingPublicKey,
      wallet.keys.viewingPrivateKey,
      announcement.stealthAddress,
      viewTag
    );

    if (isOurs) {
      const privateKey = computeStealthPrivateKey(
        announcement.ephemeralPubKey,
        wallet.keys.spendingPrivateKey,
        wallet.keys.viewingPrivateKey
      );

      ownedAddresses.push({
        address: announcement.stealthAddress,
        privateKey,
        balance: 0n, // Will fetch below
        announcement
      });
    }
  }

  stopSpinner(true, `Scanned ${announcements.length} announcements`);

  if (ownedAddresses.length === 0) {
    printInfo('No stealth payments found for your wallet.');
    return;
  }

  printSuccess(`Found ${ownedAddresses.length} stealth address(es)!`);
  console.log();

  // Fetch balances
  const balanceSpinner = startSpinner('Fetching balances...');
  
  try {
    for (let i = 0; i < ownedAddresses.length; i++) {
      updateSpinner(`Fetching balances... ${i + 1}/${ownedAddresses.length}`);
      const balance = await getBalance(ownedAddresses[i].address);
      ownedAddresses[i].balance = balance;
    }
    stopSpinner(true, 'Balances fetched');
  } catch (error) {
    stopSpinner(false, 'Failed to fetch some balances');
    printWarning('Some balances may be inaccurate');
  }

  // Store in session cache
  discoveredAddresses = ownedAddresses;

  // Display results
  printSubheader('Your Stealth Addresses');
  printStealthAddresses(ownedAddresses);

  // Show non-zero balances
  const withBalance = ownedAddresses.filter(a => a.balance > 0n);
  if (withBalance.length > 0) {
    console.log();
    printInfo('Addresses with funds available:');
    for (const addr of withBalance) {
      console.log(`  ${addr.address}: ${formatEther(addr.balance)} ETH`);
    }
    console.log();
    printInfo('Use `stealth-wallet withdraw` to move funds.');
  }
}

export async function balanceCommand(): Promise<void> {
  printHeader('Stealth Address Balances');

  // Check wallet
  const walletInfo = await getWalletInfo();
  if (!walletInfo) {
    printError('No wallet found. Run `stealth-wallet init` first.');
    return;
  }

  if (discoveredAddresses.length === 0) {
    printInfo('No stealth addresses discovered yet.');
    printInfo('Run `stealth-wallet receive` to scan for payments first.');
    return;
  }

  const network = await getCurrentNetwork();
  printNetworkInfo(network);
  console.log();

  // Refresh balances
  const spinner = startSpinner('Refreshing balances...');
  
  try {
    for (let i = 0; i < discoveredAddresses.length; i++) {
      updateSpinner(`Refreshing... ${i + 1}/${discoveredAddresses.length}`);
      const balance = await getBalance(discoveredAddresses[i].address);
      discoveredAddresses[i].balance = balance;
    }
    stopSpinner(true, 'Balances updated');
  } catch (error) {
    stopSpinner(false, 'Failed to refresh some balances');
  }

  printSubheader('Your Stealth Addresses');
  printStealthAddresses(discoveredAddresses);
}

export function getDiscoveredAddresses(): OwnedStealthAddress[] {
  return discoveredAddresses;
}
