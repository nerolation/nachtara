/**
 * CLI display utilities for nice-looking output.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { formatEther } from 'viem';
import type { Address, Hex } from 'viem';
import type { NetworkConfig, OwnedStealthAddress } from '../lib/types.js';

// Spinner singleton
let currentSpinner: ReturnType<typeof ora> | null = null;

export function startSpinner(text: string): ReturnType<typeof ora> {
  currentSpinner = ora(text).start();
  return currentSpinner;
}

export function stopSpinner(success: boolean = true, text?: string): void {
  if (currentSpinner) {
    if (success) {
      currentSpinner.succeed(text);
    } else {
      currentSpinner.fail(text);
    }
    currentSpinner = null;
  }
}

export function updateSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.text = text;
  }
}

// Colors and symbols
export const symbols = {
  success: chalk.green('✓'),
  error: chalk.red('✗'),
  warning: chalk.yellow('⚠'),
  info: chalk.blue('ℹ'),
  arrow: chalk.cyan('→'),
  key: chalk.yellow('🔑'),
  wallet: chalk.magenta('👛'),
  network: chalk.cyan('🌐'),
  send: chalk.green('📤'),
  receive: chalk.blue('📥'),
  lock: chalk.red('🔒'),
  unlock: chalk.green('🔓')
};

export function printHeader(text: string): void {
  console.log();
  console.log(chalk.bold.cyan('━'.repeat(50)));
  console.log(chalk.bold.cyan(`  ${text}`));
  console.log(chalk.bold.cyan('━'.repeat(50)));
  console.log();
}

export function printSubheader(text: string): void {
  console.log();
  console.log(chalk.bold.white(`▸ ${text}`));
  console.log();
}

export function printSuccess(text: string): void {
  console.log(`${symbols.success} ${chalk.green(text)}`);
}

export function printError(text: string): void {
  console.log(`${symbols.error} ${chalk.red(text)}`);
}

export function printWarning(text: string): void {
  console.log(`${symbols.warning} ${chalk.yellow(text)}`);
}

export function printInfo(text: string): void {
  console.log(`${symbols.info} ${chalk.blue(text)}`);
}

export function printKeyValue(key: string, value: string, indent: number = 0): void {
  const padding = '  '.repeat(indent);
  console.log(`${padding}${chalk.gray(key + ':')} ${chalk.white(value)}`);
}

export function printAddress(label: string, address: Address, showUrl?: string): void {
  console.log(`${chalk.gray(label + ':')} ${chalk.cyan(address)}`);
  if (showUrl) {
    console.log(`  ${chalk.gray('Explorer:')} ${chalk.underline.blue(showUrl)}`);
  }
}

export function printAmount(label: string, amountWei: bigint): void {
  const eth = formatEther(amountWei);
  console.log(`${chalk.gray(label + ':')} ${chalk.green(eth)} ${chalk.gray('ETH')}`);
}

export function printTxHash(hash: Hex, explorerUrl?: string): void {
  console.log(`${chalk.gray('Tx Hash:')} ${chalk.cyan(hash)}`);
  if (explorerUrl) {
    console.log(`  ${chalk.gray('Explorer:')} ${chalk.underline.blue(`${explorerUrl}/tx/${hash}`)}`);
  }
}

export function printWalletInfo(params: {
  address: Address;
  stealthMetaAddress: Hex;
  balance?: bigint;
  network?: NetworkConfig;
}): void {
  const { address, stealthMetaAddress, balance, network } = params;

  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: { head: ['cyan'], border: ['gray'] }
  });

  table.push(
    [chalk.gray('Address'), chalk.cyan(address)],
    [chalk.gray('Stealth Meta-Address'), chalk.white(truncateHex(stealthMetaAddress, 20))]
  );

  if (balance !== undefined) {
    table.push([chalk.gray('Balance'), chalk.green(`${formatEther(balance)} ETH`)]);
  }

  if (network) {
    table.push([chalk.gray('Network'), chalk.yellow(network.name)]);
  }

  console.log(table.toString());
}

export function printNetworkInfo(network: NetworkConfig): void {
  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: { head: ['cyan'], border: ['gray'] }
  });

  table.push(
    [chalk.gray('Network'), chalk.yellow(network.name)],
    [chalk.gray('Chain ID'), chalk.white(network.chainId.toString())],
    [chalk.gray('RPC URL'), chalk.cyan(truncateUrl(network.rpcUrl))]
  );

  if (network.blockExplorer) {
    table.push([chalk.gray('Explorer'), chalk.underline.blue(network.blockExplorer)]);
  }

  console.log(table.toString());
}

export function printStealthAddresses(addresses: OwnedStealthAddress[]): void {
  if (addresses.length === 0) {
    printInfo('No stealth addresses found');
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('#'),
      chalk.cyan('Stealth Address'),
      chalk.cyan('Balance'),
      chalk.cyan('Block')
    ],
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: { head: ['cyan'], border: ['gray'] }
  });

  addresses.forEach((addr, i) => {
    const balanceStr = formatEther(addr.balance);
    const balanceColor = addr.balance > 0n ? chalk.green : chalk.gray;
    
    table.push([
      chalk.white((i + 1).toString()),
      chalk.cyan(truncateHex(addr.address, 10)),
      balanceColor(`${balanceStr} ETH`),
      chalk.gray(addr.announcement.blockNumber.toString())
    ]);
  });

  console.log(table.toString());

  const total = addresses.reduce((sum, a) => sum + a.balance, 0n);
  console.log();
  printAmount('Total Balance', total);
}

export function printSendSummary(params: {
  recipient: string;
  stealthAddress: Address;
  amount: string;
  network: NetworkConfig;
}): void {
  const { recipient, stealthAddress, amount, network } = params;

  printSubheader('Transaction Summary');

  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: { head: ['cyan'], border: ['gray'] }
  });

  table.push(
    [chalk.gray('Recipient Meta-Address'), chalk.cyan(truncateHex(recipient as Hex, 15))],
    [chalk.gray('Generated Stealth Address'), chalk.cyan(stealthAddress)],
    [chalk.gray('Amount'), chalk.green(`${amount} ETH`)],
    [chalk.gray('Network'), chalk.yellow(network.name)]
  );

  console.log(table.toString());
}

export function printSecurityNotice(): void {
  console.log();
  console.log(chalk.yellow('━'.repeat(50)));
  console.log(chalk.yellow.bold('  ⚠️  SECURITY NOTICE'));
  console.log(chalk.yellow('━'.repeat(50)));
  console.log(chalk.gray('  • Never share your wallet password'));
  console.log(chalk.gray('  • Back up your wallet file securely'));
  console.log(chalk.gray('  • Verify addresses before sending'));
  console.log(chalk.yellow('━'.repeat(50)));
  console.log();
}

export function printRegistrationSuccess(params: {
  txHash: Hex;
  network: NetworkConfig;
}): void {
  const { txHash, network } = params;

  printSuccess('Stealth meta-address registered successfully!');
  console.log();
  printTxHash(txHash, network.blockExplorer);
  console.log();
  printInfo('Others can now send you stealth payments using your registered address.');
}

// Helpers
function truncateHex(hex: Hex, chars: number = 8): string {
  if (hex.length <= chars * 2 + 4) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

function truncateUrl(url: string): string {
  if (url.length <= 50) return url;
  return url.slice(0, 47) + '...';
}
