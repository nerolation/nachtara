/**
 * Configuration commands for network and RPC settings.
 */
import inquirer from 'inquirer';
import { getCurrentNetwork, setNetwork, setCustomRpc, clearCustomRpc, getBlockNumber, getGasPrice } from '../lib/network.js';
import { loadConfig } from '../lib/storage.js';
import { SUPPORTED_NETWORKS } from '../lib/types.js';
import { formatGwei } from 'viem';
import { printHeader, printSubheader, printSuccess, printError, printInfo, printNetworkInfo, printKeyValue, startSpinner, stopSpinner } from '../ui/display.js';
export async function configCommand(action, value) {
    if (!action) {
        await showConfig();
        return;
    }
    switch (action) {
        case 'network':
            if (value) {
                await setNetworkCommand(value);
            }
            else {
                await selectNetwork();
            }
            break;
        case 'rpc':
            if (value) {
                await setRpcCommand(value);
            }
            else {
                await promptRpc();
            }
            break;
        case 'rpc-clear':
            await clearRpcCommand();
            break;
        case 'test':
            await testConnection();
            break;
        case 'show':
        default:
            await showConfig();
    }
}
async function showConfig() {
    printHeader('Current Configuration');
    const config = await loadConfig();
    const network = await getCurrentNetwork();
    printNetworkInfo(network);
    console.log();
    printInfo('Available Networks:');
    for (const [name, net] of Object.entries(SUPPORTED_NETWORKS)) {
        const active = name === config.activeNetwork ? ' (active)' : '';
        console.log(`  • ${name}: ${net.name}${active}`);
    }
    console.log();
    printInfo('Commands:');
    console.log('  stealth-wallet config network <name>  - Switch network');
    console.log('  stealth-wallet config rpc <url>       - Set custom RPC');
    console.log('  stealth-wallet config rpc-clear       - Clear custom RPC');
    console.log('  stealth-wallet config test            - Test RPC connection');
}
async function setNetworkCommand(networkName) {
    printHeader('Switch Network');
    try {
        const network = await setNetwork(networkName);
        printSuccess(`Switched to ${network.name}`);
        printNetworkInfo(network);
    }
    catch (error) {
        printError(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
async function selectNetwork() {
    printHeader('Select Network');
    const config = await loadConfig();
    const choices = Object.entries(SUPPORTED_NETWORKS).map(([name, net]) => ({
        name: `${net.name} (${name})${name === config.activeNetwork ? ' ✓' : ''}`,
        value: name
    }));
    const { networkName } = await inquirer.prompt([
        {
            type: 'list',
            name: 'networkName',
            message: 'Select network:',
            choices
        }
    ]);
    await setNetworkCommand(networkName);
}
async function setRpcCommand(rpcUrl) {
    printHeader('Set Custom RPC');
    // Validate URL format
    try {
        new URL(rpcUrl);
    }
    catch {
        printError('Invalid URL format');
        return;
    }
    const spinner = startSpinner('Testing RPC connection...');
    try {
        await setCustomRpc(rpcUrl);
        // Test the connection
        const blockNumber = await getBlockNumber();
        stopSpinner(true, `Connected! Current block: ${blockNumber}`);
        printSuccess('Custom RPC URL set successfully');
        const network = await getCurrentNetwork();
        printNetworkInfo(network);
    }
    catch (error) {
        stopSpinner(false, 'Connection failed');
        // Still save if user wants to
        const { saveAnyway } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'saveAnyway',
                message: 'RPC test failed. Save anyway?',
                default: false
            }
        ]);
        if (saveAnyway) {
            await setCustomRpc(rpcUrl);
            printSuccess('RPC URL saved (untested)');
        }
    }
}
async function promptRpc() {
    const { rpcUrl } = await inquirer.prompt([
        {
            type: 'input',
            name: 'rpcUrl',
            message: 'Enter custom RPC URL:',
            validate: (input) => {
                try {
                    new URL(input);
                    return true;
                }
                catch {
                    return 'Invalid URL format';
                }
            }
        }
    ]);
    await setRpcCommand(rpcUrl);
}
async function clearRpcCommand() {
    printHeader('Clear Custom RPC');
    await clearCustomRpc();
    printSuccess('Custom RPC cleared. Using default network RPC.');
    const network = await getCurrentNetwork();
    printNetworkInfo(network);
}
async function testConnection() {
    printHeader('Test RPC Connection');
    const network = await getCurrentNetwork();
    printNetworkInfo(network);
    console.log();
    const spinner = startSpinner('Testing connection...');
    try {
        const [blockNumber, gasPrice] = await Promise.all([
            getBlockNumber(),
            getGasPrice()
        ]);
        stopSpinner(true, 'Connection successful!');
        console.log();
        printSubheader('Network Status');
        printKeyValue('Block Number', blockNumber.toString());
        printKeyValue('Gas Price', `${formatGwei(gasPrice)} Gwei`);
    }
    catch (error) {
        stopSpinner(false, 'Connection failed');
        printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=config.js.map