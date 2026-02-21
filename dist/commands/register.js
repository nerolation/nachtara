/**
 * Register stealth meta-address on-chain.
 */
import inquirer from 'inquirer';
import { formatEther } from 'viem';
import { loadWallet, getWalletInfo } from '../lib/storage.js';
import { getCurrentNetwork, getRegisteredMetaAddress, registerMetaAddress, getBalance, getGasPrice } from '../lib/network.js';
import { printHeader, printSubheader, printSuccess, printError, printWarning, printInfo, printRegistrationSuccess, printNetworkInfo, printKeyValue, startSpinner, stopSpinner } from '../ui/display.js';
export async function registerCommand(options) {
    printHeader('Register Stealth Meta-Address');
    // Check wallet exists
    const walletInfo = await getWalletInfo();
    if (!walletInfo) {
        printError('No wallet found. Run `stealth-wallet init` first.');
        return;
    }
    const network = await getCurrentNetwork();
    printNetworkInfo(network);
    console.log();
    // Check if already registered
    const spinner = startSpinner('Checking registration status...');
    try {
        const existing = await getRegisteredMetaAddress(walletInfo.address);
        stopSpinner(true, 'Status checked');
        if (existing && !options.force) {
            printWarning('You already have a registered stealth meta-address:');
            console.log(`  ${existing}`);
            console.log();
            if (existing === walletInfo.stealthMetaAddress) {
                printSuccess('Your current wallet is already registered!');
                return;
            }
            printWarning('The registered address differs from your wallet.');
            printInfo('Use --force to update your registration.');
            return;
        }
        if (existing && options.force) {
            printWarning('Updating existing registration...');
        }
    }
    catch (error) {
        stopSpinner(false, 'Failed to check status');
        printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
    }
    // Get password
    const { password } = await inquirer.prompt([
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
    }
    catch (error) {
        stopSpinner(false, 'Failed to load wallet');
        printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
    }
    // Check balance
    const checkSpinner = startSpinner('Checking balance...');
    try {
        const balance = await getBalance(wallet.address);
        const gasPrice = await getGasPrice();
        const estimatedGas = 50000n; // Registration gas estimate
        const estimatedCost = gasPrice * estimatedGas;
        stopSpinner(true);
        printSubheader('Transaction Details');
        printKeyValue('Your Address', wallet.address);
        printKeyValue('Balance', `${formatEther(balance)} ETH`);
        printKeyValue('Estimated Gas Cost', `${formatEther(estimatedCost)} ETH`);
        console.log();
        if (balance < estimatedCost) {
            printError(`Insufficient balance for gas. Need at least ${formatEther(estimatedCost)} ETH`);
            return;
        }
    }
    catch (error) {
        stopSpinner(false);
        printError(`Failed to check balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
    }
    // Confirm
    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Proceed with registration?',
            default: true
        }
    ]);
    if (!confirm) {
        printInfo('Registration cancelled.');
        return;
    }
    // Register
    const regSpinner = startSpinner('Registering stealth meta-address...');
    try {
        // We need a private key to sign the transaction
        // For this, we'll derive a transaction signing key from the spending key
        // Note: In production, you might want a separate "hot" key for gas
        const txHash = await registerMetaAddress(wallet.stealthMetaAddress, wallet.keys.spendingPrivateKey);
        stopSpinner(true, 'Registration confirmed!');
        console.log();
        printRegistrationSuccess({
            txHash,
            network
        });
    }
    catch (error) {
        stopSpinner(false, 'Registration failed');
        printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export async function lookupCommand(address) {
    printHeader('Lookup Stealth Meta-Address');
    if (!address.startsWith('0x') || address.length !== 42) {
        printError('Invalid Ethereum address format');
        return;
    }
    const network = await getCurrentNetwork();
    printKeyValue('Network', network.name);
    printKeyValue('Looking up', address);
    console.log();
    const spinner = startSpinner('Querying registry...');
    try {
        const metaAddress = await getRegisteredMetaAddress(address);
        stopSpinner(true);
        if (!metaAddress) {
            printWarning('No stealth meta-address registered for this address.');
            printInfo('The recipient may not have registered yet, or uses a different chain.');
            return;
        }
        printSuccess('Stealth meta-address found!');
        console.log();
        printKeyValue('Meta-Address', metaAddress);
        console.log();
        printInfo('You can use this to send stealth payments to this recipient.');
    }
    catch (error) {
        stopSpinner(false);
        printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=register.js.map