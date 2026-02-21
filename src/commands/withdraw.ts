/**
 * Withdraw command - move funds from stealth addresses.
 */

import inquirer from 'inquirer';
import type { Address, Hex } from 'viem';
import { formatEther, parseEther } from 'viem';
import { loadWallet, getWalletInfo } from '../lib/storage.js';
import {
  getCurrentNetwork,
  getBalance,
  withdrawFromStealthAddress,
  getGasPrice
} from '../lib/network.js';
import { getDiscoveredAddresses } from './receive.js';
import type { OwnedStealthAddress } from '../lib/types.js';
import {
  printHeader,
  printSubheader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printStealthAddresses,
  printTxHash,
  printKeyValue,
  printNetworkInfo,
  startSpinner,
  stopSpinner,
  updateSpinner
} from '../ui/display.js';

export async function withdrawCommand(options: {
  index?: number;
  to?: string;
  amount?: string;
  all?: boolean;
}): Promise<void> {
  printHeader('Withdraw from Stealth Address');

  // Check wallet
  const walletInfo = await getWalletInfo();
  if (!walletInfo) {
    printError('No wallet found. Run `stealth-wallet init` first.');
    return;
  }

  const network = await getCurrentNetwork();
  printNetworkInfo(network);
  console.log();

  // Get discovered addresses
  let addresses = getDiscoveredAddresses();
  
  if (addresses.length === 0) {
    printWarning('No stealth addresses discovered.');
    printInfo('Run `stealth-wallet receive` first to scan for payments.');
    return;
  }

  // Refresh balances
  const refreshSpinner = startSpinner('Refreshing balances...');
  try {
    for (let i = 0; i < addresses.length; i++) {
      addresses[i].balance = await getBalance(addresses[i].address);
    }
    stopSpinner(true);
  } catch (error) {
    stopSpinner(false);
    printWarning('Failed to refresh some balances');
  }

  // Filter to addresses with balance
  const withBalance = addresses.filter(a => a.balance > 0n);
  
  if (withBalance.length === 0) {
    printInfo('No stealth addresses have a balance to withdraw.');
    return;
  }

  printSubheader('Available Balances');
  printStealthAddresses(withBalance);
  console.log();

  // Handle --all flag
  if (options.all) {
    await withdrawAll(withBalance, options.to, network);
    return;
  }

  // Select address to withdraw from
  let selectedAddress: OwnedStealthAddress;

  if (options.index !== undefined) {
    if (options.index < 1 || options.index > withBalance.length) {
      printError(`Invalid index. Choose between 1 and ${withBalance.length}`);
      return;
    }
    selectedAddress = withBalance[options.index - 1];
  } else {
    const choices = withBalance.map((addr, i) => ({
      name: `#${i + 1}: ${addr.address.slice(0, 10)}...${addr.address.slice(-8)} (${formatEther(addr.balance)} ETH)`,
      value: i
    }));

    const { index } = await inquirer.prompt<{ index: number }>([
      {
        type: 'list',
        name: 'index',
        message: 'Select stealth address to withdraw from:',
        choices
      }
    ]);

    selectedAddress = withBalance[index];
  }

  printKeyValue('Selected Address', selectedAddress.address);
  printKeyValue('Balance', `${formatEther(selectedAddress.balance)} ETH`);
  console.log();

  // Get destination
  let toAddress: Address;
  
  if (options.to) {
    if (!options.to.startsWith('0x') || options.to.length !== 42) {
      printError('Invalid destination address');
      return;
    }
    toAddress = options.to as Address;
  } else {
    const { destination } = await inquirer.prompt<{ destination: string }>([
      {
        type: 'list',
        name: 'destination',
        message: 'Where to send the funds?',
        choices: [
          { name: `My wallet address (${walletInfo.address})`, value: walletInfo.address },
          { name: 'Enter custom address', value: 'custom' }
        ]
      }
    ]);

    if (destination === 'custom') {
      const { customAddress } = await inquirer.prompt<{ customAddress: string }>([
        {
          type: 'input',
          name: 'customAddress',
          message: 'Enter destination address:',
          validate: (input) => {
            if (!input.startsWith('0x') || input.length !== 42) {
              return 'Invalid address format';
            }
            return true;
          }
        }
      ]);
      toAddress = customAddress as Address;
    } else {
      toAddress = destination as Address;
    }
  }

  // Get amount
  let amount: string | undefined;
  
  if (options.amount) {
    const amountWei = parseEther(options.amount);
    if (amountWei > selectedAddress.balance) {
      printError('Amount exceeds balance');
      return;
    }
    amount = options.amount;
  } else {
    const { amountChoice } = await inquirer.prompt<{ amountChoice: string }>([
      {
        type: 'list',
        name: 'amountChoice',
        message: 'How much to withdraw?',
        choices: [
          { name: 'Maximum (all minus gas)', value: 'max' },
          { name: 'Enter specific amount', value: 'custom' }
        ]
      }
    ]);

    if (amountChoice === 'custom') {
      const { customAmount } = await inquirer.prompt<{ customAmount: string }>([
        {
          type: 'input',
          name: 'customAmount',
          message: 'Enter amount in ETH:',
          validate: (input) => {
            try {
              const val = parseEther(input);
              if (val <= 0n) return 'Amount must be positive';
              if (val > selectedAddress.balance) return 'Amount exceeds balance';
              return true;
            } catch {
              return 'Invalid amount';
            }
          }
        }
      ]);
      amount = customAmount;
    }
    // If 'max', amount stays undefined and withdrawFromStealthAddress will send max
  }

  // Show summary
  printSubheader('Withdrawal Summary');
  printKeyValue('From (Stealth)', selectedAddress.address);
  printKeyValue('To', toAddress);
  printKeyValue('Amount', amount ? `${amount} ETH` : 'Maximum (minus gas)');
  console.log();

  // Confirm
  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Confirm withdrawal?',
      default: true
    }
  ]);

  if (!confirm) {
    printInfo('Withdrawal cancelled.');
    return;
  }

  // Execute
  const spinner = startSpinner('Processing withdrawal...');
  
  try {
    const txHash = await withdrawFromStealthAddress({
      stealthPrivateKey: selectedAddress.privateKey,
      toAddress,
      amount
    });

    stopSpinner(true, 'Withdrawal confirmed!');
    console.log();

    printSuccess('Funds withdrawn successfully!');
    printTxHash(txHash, network.blockExplorer);

  } catch (error) {
    stopSpinner(false, 'Withdrawal failed');
    printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function withdrawAll(
  addresses: OwnedStealthAddress[],
  toAddress?: string,
  network?: any
): Promise<void> {
  printSubheader('Withdraw All');
  
  const total = addresses.reduce((sum, a) => sum + a.balance, 0n);
  printKeyValue('Total to withdraw', `~${formatEther(total)} ETH (minus gas for ${addresses.length} tx)`);
  console.log();

  // Get destination
  let destination: Address;
  
  if (toAddress) {
    if (!toAddress.startsWith('0x') || toAddress.length !== 42) {
      printError('Invalid destination address');
      return;
    }
    destination = toAddress as Address;
  } else {
    const walletInfo = await getWalletInfo();
    if (!walletInfo) {
      printError('No wallet found');
      return;
    }

    const { dest } = await inquirer.prompt<{ dest: string }>([
      {
        type: 'list',
        name: 'dest',
        message: 'Where to send all funds?',
        choices: [
          { name: `My wallet address (${walletInfo.address})`, value: walletInfo.address },
          { name: 'Enter custom address', value: 'custom' }
        ]
      }
    ]);

    if (dest === 'custom') {
      const { customAddress } = await inquirer.prompt<{ customAddress: string }>([
        {
          type: 'input',
          name: 'customAddress',
          message: 'Enter destination address:',
          validate: (input) => {
            if (!input.startsWith('0x') || input.length !== 42) {
              return 'Invalid address format';
            }
            return true;
          }
        }
      ]);
      destination = customAddress as Address;
    } else {
      destination = dest as Address;
    }
  }

  // Confirm
  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Withdraw from ${addresses.length} addresses to ${destination}?`,
      default: true
    }
  ]);

  if (!confirm) {
    printInfo('Withdrawal cancelled.');
    return;
  }

  // Execute withdrawals
  const spinner = startSpinner('Processing withdrawals...');
  
  let success = 0;
  let failed = 0;

  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    updateSpinner(`Withdrawing ${i + 1}/${addresses.length}...`);

    try {
      await withdrawFromStealthAddress({
        stealthPrivateKey: addr.privateKey,
        toAddress: destination
      });
      success++;
    } catch (error) {
      failed++;
      // Continue with others
    }
  }

  stopSpinner(true, 'Batch withdrawal complete');
  console.log();

  printSuccess(`Successfully withdrew from ${success} addresses`);
  if (failed > 0) {
    printWarning(`Failed to withdraw from ${failed} addresses (possibly insufficient balance for gas)`);
  }
}
