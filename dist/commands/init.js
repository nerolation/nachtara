/**
 * Initialize a new wallet or import an existing one.
 */
import inquirer from 'inquirer';
import { generateRandomKeys, deriveKeysFromSignature } from '../lib/crypto.js';
import { saveWallet, walletExists, getWalletInfo, importWallet } from '../lib/storage.js';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { printHeader, printSuccess, printError, printWarning, printInfo, printWalletInfo, printSecurityNotice, startSpinner, stopSpinner } from '../ui/display.js';
const STEALTH_SIGNATURE_MESSAGE = 'Sign this message to generate your stealth address keys.\n\n' +
    'This signature will be used to derive your spending and viewing keys.\n\n' +
    'WARNING: Never sign this message on a phishing site.';
export async function initCommand(options) {
    printHeader('Initialize Stealth Wallet');
    // Check if wallet already exists
    const exists = await walletExists();
    if (exists && !options.force) {
        const info = await getWalletInfo();
        if (info) {
            printWarning('A wallet already exists:');
            printWalletInfo({
                address: info.address,
                stealthMetaAddress: info.stealthMetaAddress
            });
            console.log();
            printInfo('Use --force to overwrite the existing wallet.');
            return;
        }
    }
    // Handle import
    if (options.import) {
        await handleImport(options.import);
        return;
    }
    // Ask how to create wallet
    const { method } = await inquirer.prompt([
        {
            type: 'list',
            name: 'method',
            message: 'How would you like to create your wallet?',
            choices: [
                { name: '🎲 Generate new random keys (recommended)', value: 'random' },
                { name: '🔑 Derive from private key signature', value: 'signature' },
                { name: '📂 Import from backup file', value: 'import' }
            ]
        }
    ]);
    if (method === 'import') {
        const { backupPath } = await inquirer.prompt([
            {
                type: 'input',
                name: 'backupPath',
                message: 'Enter path to backup file:',
                validate: (input) => input.trim().length > 0 || 'Path is required'
            }
        ]);
        await handleImport(backupPath);
        return;
    }
    let keys;
    if (method === 'random') {
        keys = generateRandomKeys();
        printInfo('Generated new random stealth keys.');
    }
    else {
        // Derive from signature
        keys = await deriveFromSignature();
    }
    // Set password
    const { password, confirmPassword } = await inquirer.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Set wallet password (min 8 characters):',
            mask: '*',
            validate: (input) => {
                if (input.length < 8)
                    return 'Password must be at least 8 characters';
                return true;
            }
        },
        {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirm password:',
            mask: '*'
        }
    ]);
    if (password !== confirmPassword) {
        printError('Passwords do not match.');
        return;
    }
    // Save wallet
    const spinner = startSpinner('Creating wallet...');
    try {
        const wallet = await saveWallet(keys, password);
        stopSpinner(true, 'Wallet created!');
        console.log();
        printWalletInfo({
            address: wallet.address,
            stealthMetaAddress: wallet.stealthMetaAddress
        });
        printSecurityNotice();
        printSuccess('Wallet initialized successfully!');
        console.log();
        printInfo('Next steps:');
        console.log('  1. Use `stealth-wallet config network <name>` to set your network');
        console.log('  2. Use `stealth-wallet register` to register your stealth meta-address');
        console.log('  3. Share your stealth meta-address to receive payments');
    }
    catch (error) {
        stopSpinner(false, 'Failed to create wallet');
        printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
async function deriveFromSignature() {
    printInfo('You can derive stealth keys from an Ethereum private key signature.');
    printWarning('Make sure you are using a secure private key that you control.');
    console.log();
    const { hasPrivateKey } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'hasPrivateKey',
            message: 'Do you have a private key to sign with?',
            default: true
        }
    ]);
    let privateKey;
    if (hasPrivateKey) {
        const { inputKey } = await inquirer.prompt([
            {
                type: 'password',
                name: 'inputKey',
                message: 'Enter your private key (0x...):',
                mask: '*',
                validate: (input) => {
                    if (!input.startsWith('0x') || input.length !== 66) {
                        return 'Invalid private key format. Expected 0x followed by 64 hex characters.';
                    }
                    return true;
                }
            }
        ]);
        privateKey = inputKey;
    }
    else {
        // Generate a new key for signing
        privateKey = generatePrivateKey();
        const account = privateKeyToAccount(privateKey);
        printInfo(`Generated temporary signing key: ${account.address}`);
        printWarning('Save this private key if you want to recover your wallet later:');
        console.log(`  ${privateKey}`);
        console.log();
    }
    const spinner = startSpinner('Signing message to derive keys...');
    try {
        const account = privateKeyToAccount(privateKey);
        const signature = await account.signMessage({
            message: STEALTH_SIGNATURE_MESSAGE
        });
        stopSpinner(true, 'Signature generated');
        const keys = deriveKeysFromSignature(signature);
        printSuccess('Keys derived from signature.');
        return keys;
    }
    catch (error) {
        stopSpinner(false, 'Failed to sign message');
        throw error;
    }
}
async function handleImport(backupPath) {
    const spinner = startSpinner('Importing wallet...');
    try {
        await importWallet(backupPath);
        stopSpinner(true, 'Wallet imported');
        const info = await getWalletInfo();
        if (info) {
            printWalletInfo({
                address: info.address,
                stealthMetaAddress: info.stealthMetaAddress
            });
        }
        printSuccess('Wallet imported successfully!');
        printInfo('You can now use your existing password to unlock the wallet.');
    }
    catch (error) {
        stopSpinner(false, 'Import failed');
        printError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=init.js.map