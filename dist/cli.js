#!/usr/bin/env node
/**
 * Stealth Wallet CLI
 *
 * A secure CLI wallet for ERC-5564/6538 stealth address transactions.
 * Allows private, non-interactive transfers on Ethereum and EVM-compatible chains.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand, configCommand, registerCommand, lookupCommand, sendCommand, receiveCommand, balanceCommand, withdrawCommand } from './commands/index.js';
import { getWalletInfo } from './lib/storage.js';
import { getCurrentNetwork } from './lib/network.js';
import { printHeader, printWalletInfo, printNetworkInfo, printError } from './ui/display.js';
const program = new Command();
program
    .name('stealth-wallet')
    .description('Secure CLI wallet for ERC-5564/6538 stealth address transactions')
    .version('1.0.0');
// Init command
program
    .command('init')
    .description('Initialize a new stealth wallet')
    .option('-f, --force', 'Overwrite existing wallet')
    .option('-i, --import <path>', 'Import wallet from backup file')
    .action(initCommand);
// Config commands
program
    .command('config [action] [value]')
    .description('Configure network and RPC settings')
    .addHelpText('after', `
Actions:
  show                  Show current configuration (default)
  network <name>        Switch to network (mainnet, sepolia, holesky, etc.)
  rpc <url>             Set custom RPC URL
  rpc-clear             Clear custom RPC URL
  test                  Test RPC connection

Examples:
  $ stealth-wallet config network sepolia
  $ stealth-wallet config rpc https://my-node.example.com
  $ stealth-wallet config test`)
    .action(configCommand);
// Register command
program
    .command('register')
    .description('Register your stealth meta-address on-chain')
    .option('-f, --force', 'Update existing registration')
    .action(registerCommand);
// Lookup command
program
    .command('lookup <address>')
    .description('Look up a registered stealth meta-address')
    .action(lookupCommand);
// Send command
program
    .command('send')
    .description('Send ETH to a stealth address')
    .option('-t, --to <address>', 'Recipient address (to lookup from registry)')
    .option('-m, --meta <metaAddress>', 'Recipient stealth meta-address (direct)')
    .option('-a, --amount <eth>', 'Amount to send in ETH')
    .action(sendCommand);
// Receive command
program
    .command('receive')
    .description('Scan for incoming stealth payments')
    .option('--full', 'Scan from contract deployment (slow)')
    .option('--from-block <number>', 'Start scanning from specific block')
    .action(receiveCommand);
// Balance command
program
    .command('balance')
    .description('Show balances of discovered stealth addresses')
    .action(balanceCommand);
// Withdraw command
program
    .command('withdraw')
    .description('Withdraw funds from a stealth address')
    .option('-i, --index <number>', 'Index of stealth address to withdraw from', parseInt)
    .option('-t, --to <address>', 'Destination address')
    .option('-a, --amount <eth>', 'Amount to withdraw (omit for maximum)')
    .option('--all', 'Withdraw from all stealth addresses')
    .action(withdrawCommand);
// Status command
program
    .command('status')
    .description('Show wallet and network status')
    .action(async () => {
    printHeader('Stealth Wallet Status');
    const walletInfo = await getWalletInfo();
    if (walletInfo) {
        printWalletInfo({
            address: walletInfo.address,
            stealthMetaAddress: walletInfo.stealthMetaAddress
        });
    }
    else {
        console.log(chalk.yellow('No wallet configured. Run `stealth-wallet init` to create one.'));
    }
    console.log();
    const network = await getCurrentNetwork();
    printNetworkInfo(network);
});
// Handle unknown commands
program.on('command:*', () => {
    printError(`Unknown command: ${program.args.join(' ')}`);
    console.log();
    console.log('Run `stealth-wallet --help` for available commands.');
    process.exit(1);
});
// Run
program.parseAsync(process.argv).catch((error) => {
    printError(`Error: ${error.message}`);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map