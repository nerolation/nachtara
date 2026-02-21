/**
 * Send ETH to a stealth address.
 */

import inquirer from 'inquirer';
import type { Address, Hex } from 'viem';
import { formatEther, parseEther } from 'viem';
import { loadWallet, getWalletInfo } from '../lib/storage.js';
import {
  getCurrentNetwork,
  getRegisteredMetaAddress,
  sendToStealthAddress,
  getBalance,
  getGasPrice
} from '../lib/network.js';
import {
  generateStealthAddress,
  isValidPublicKey,
  parseStealthMetaAddress
} from '../lib/crypto.js';
import {
  printHeader,
  printSubheader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printSendSummary,
  printTxHash,
  printKeyValue,
  printNetworkInfo,
  startSpinner,
  stopSpinner
} from '../ui/display.js';

export async function sendCommand(options: {
  to?: string;
  amount?: string;
  meta?: string;
}): Promise<void> {
  printHeader('Send Stealth Payment');

  // Get wallet
  const walletInfo = await getWalletInfo();
  if (!walletInfo) {
    printError('No wallet found. Run `stealth-wallet init` first.');
    return;
  }

  const network = await getCurrentNetwork();
  printNetworkInfo(network);
  console.log();

  // Get recipient meta-address
  let recipientMetaAddress: Hex;

  if (options.meta) {
    // Direct meta-address provided
    recipientMetaAddress = options.meta as Hex;
  } else if (options.to) {
    // Lookup from registry
    const spinner = startSpinner('Looking up recipient...');
    try {
      const meta = await getRegisteredMetaAddress(options.to as Address);
      stopSpinner(true);

      if (!meta) {
        printError('Recipient has no registered stealth meta-address.');
        printInfo('Ask them to register, or provide the meta-address directly with --meta');
        return;
      }

      recipientMetaAddress = meta;
      printInfo(`Found registered meta-address for ${options.to}`);
    } catch (error) {
      stopSpinner(false);
      printError(`Lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return;
    }
  } else {
    // Interactive mode
    const { inputType } = await inquirer.prompt<{ inputType: string }>([
      {
        type: 'list',
        name: 'inputType',
        message: 'How would you like to specify the recipient?',
        choices: [
          { name: 'Lookup by Ethereum address (from registry)', value: 'address' },
          { name: 'Enter stealth meta-address directly', value: 'meta' }
        ]
      }
    ]);

    if (inputType === 'address') {
      const { address } = await inquirer.prompt<{ address: string }>([
        {
          type: 'input',
          name: 'address',
          message: 'Enter recipient Ethereum address:',
          validate: (input) => {
            if (!input.startsWith('0x') || input.length !== 42) {
              return 'Invalid address format';
            }
            return true;
          }
        }
      ]);

      const spinner = startSpinner('Looking up recipient...');
      try {
        const meta = await getRegisteredMetaAddress(address as Address);
        stopSpinner(true);

        if (!meta) {
          printError('Recipient has no registered stealth meta-address.');
          return;
        }

        recipientMetaAddress = meta;
        printInfo(`Found registered meta-address`);
      } catch (error) {
        stopSpinner(false);
        printError(`Lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }
    } else {
      const { meta } = await inquirer.prompt<{ meta: string }>([
        {
          type: 'input',
          name: 'meta',
          message: 'Enter stealth meta-address (0x...):',
          validate: (input) => {
            if (!input.startsWith('0x')) return 'Must start with 0x';
            // Should be 66 chars (single key) or 132 chars (two keys) + 2 for 0x
            if (input.length !== 68 && input.length !== 134) {
              return 'Invalid meta-address length';
            }
            return true;
          }
        }
      ]);
      recipientMetaAddress = meta as Hex;
    }
  }

  // Validate meta-address
  try {
    const { spendingPublicKey, viewingPublicKey } = parseStealthMetaAddress(recipientMetaAddress);
    if (!isValidPublicKey(spendingPublicKey) || !isValidPublicKey(viewingPublicKey)) {
      printError('Invalid stealth meta-address: public keys are malformed');
      return;
    }
  } catch (error) {
    printError(`Invalid meta-address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return;
  }

  // Get amount
  let amount: string;
  if (options.amount) {
    amount = options.amount;
  } else {
    const { inputAmount } = await inquirer.prompt<{ inputAmount: string }>([
      {
        type: 'input',
        name: 'inputAmount',
        message: 'Enter amount to send (in ETH):',
        validate: (input) => {
          try {
            const val = parseEther(input);
            if (val <= 0n) return 'Amount must be positive';
            return true;
          } catch {
            return 'Invalid amount';
          }
        }
      }
    ]);
    amount = inputAmount;
  }

  // Generate stealth address
  const stealthInfo = generateStealthAddress(recipientMetaAddress);

  printSendSummary({
    recipient: recipientMetaAddress,
    stealthAddress: stealthInfo.stealthAddress,
    amount,
    network
  });

  console.log();
  printInfo('The recipient will scan announcements to discover this payment.');
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

  // Check balance
  const checkSpinner = startSpinner('Checking balance...');
  try {
    const balance = await getBalance(wallet.address);
    const amountWei = parseEther(amount);
    const gasPrice = await getGasPrice();
    const estimatedGas = 100000n; // ETH transfer + announce
    const estimatedCost = amountWei + (gasPrice * estimatedGas);

    stopSpinner(true);

    printKeyValue('Your Balance', `${formatEther(balance)} ETH`);
    printKeyValue('Total Cost (incl. gas)', `~${formatEther(estimatedCost)} ETH`);
    console.log();

    if (balance < estimatedCost) {
      printError('Insufficient balance');
      return;
    }
  } catch (error) {
    stopSpinner(false);
    printError(`Balance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return;
  }

  // Confirm
  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Confirm send transaction?',
      default: true
    }
  ]);

  if (!confirm) {
    printInfo('Transaction cancelled.');
    return;
  }

  // Execute
  const sendSpinner = startSpinner('Sending transaction...');
  try {
    const { txHash, usedForwarder } = await sendToStealthAddress({
      stealthAddress: stealthInfo.stealthAddress,
      ephemeralPublicKey: stealthInfo.ephemeralPublicKey,
      viewTag: stealthInfo.viewTag,
      amount,
      privateKey: wallet.keys.spendingPrivateKey
    });

    stopSpinner(true, 'Transaction confirmed!');
    console.log();

    printSuccess('Payment sent successfully!');
    console.log();

    printSubheader('Transaction Details');
    if (usedForwarder) {
      printKeyValue('Atomic Transfer + Announce', '');
    } else {
      printKeyValue('Transfer + Announce (2 txs)', '');
    }
    printTxHash(txHash, network.blockExplorer);
    console.log();

    printInfo('The recipient can now scan to discover this payment.');

  } catch (error) {
    stopSpinner(false, 'Transaction failed');
    printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
