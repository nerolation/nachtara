/**
 * Secure wallet storage.
 * Encrypts private keys before writing to disk.
 */

import { readFile, writeFile, mkdir, access, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Address, Hex } from 'viem';
import type { StealthKeys, WalletData, EncryptedWallet, NetworkConfig } from './types.js';
import {
  encryptData,
  decryptData,
  createStealthMetaAddress,
  deriveMainAddress
} from './crypto.js';

const WALLET_DIR = join(homedir(), '.stealth-wallet');
const WALLET_FILE = join(WALLET_DIR, 'wallet.json');
const CONFIG_FILE = join(WALLET_DIR, 'config.json');

export interface AppConfig {
  activeNetwork: string;
  customRpcUrl?: string;
  lastScanBlock?: Record<number, string>; // chainId -> block number
}

/**
 * Ensure the wallet directory exists.
 */
async function ensureDir(): Promise<void> {
  try {
    await access(WALLET_DIR);
  } catch {
    await mkdir(WALLET_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Check if a wallet exists.
 */
export async function walletExists(): Promise<boolean> {
  try {
    await access(WALLET_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save wallet with encryption.
 */
export async function saveWallet(
  keys: StealthKeys,
  password: string
): Promise<WalletData> {
  await ensureDir();

  const stealthMetaAddress = createStealthMetaAddress(keys);
  const address = deriveMainAddress(keys.spendingPublicKey);

  const keysJson = JSON.stringify(keys);
  const { encrypted, salt, iv } = await encryptData(keysJson, password);

  const encryptedWallet: EncryptedWallet = {
    version: 1,
    address,
    stealthMetaAddress,
    encryptedKeys: encrypted,
    salt,
    iv,
    createdAt: Date.now()
  };

  await writeFile(WALLET_FILE, JSON.stringify(encryptedWallet, null, 2), {
    mode: 0o600
  });

  return {
    address,
    stealthMetaAddress,
    keys,
    createdAt: encryptedWallet.createdAt
  };
}

/**
 * Load wallet with decryption.
 */
export async function loadWallet(password: string): Promise<WalletData> {
  const exists = await walletExists();
  if (!exists) {
    throw new Error('No wallet found. Run `init` first.');
  }

  const content = await readFile(WALLET_FILE, 'utf-8');
  const encrypted: EncryptedWallet = JSON.parse(content);

  if (encrypted.version !== 1) {
    throw new Error(`Unsupported wallet version: ${encrypted.version}`);
  }

  const keysJson = await decryptData(
    encrypted.encryptedKeys,
    password,
    encrypted.salt,
    encrypted.iv
  );

  const keys: StealthKeys = JSON.parse(keysJson);

  // Validate decrypted keys
  const computedMeta = createStealthMetaAddress(keys);
  if (computedMeta !== encrypted.stealthMetaAddress) {
    throw new Error('Wallet integrity check failed');
  }

  return {
    address: encrypted.address,
    stealthMetaAddress: encrypted.stealthMetaAddress,
    keys,
    createdAt: encrypted.createdAt
  };
}

/**
 * Get wallet info without decryption (public data only).
 */
export async function getWalletInfo(): Promise<{
  address: Address;
  stealthMetaAddress: Hex;
  createdAt: number;
} | null> {
  const exists = await walletExists();
  if (!exists) return null;

  const content = await readFile(WALLET_FILE, 'utf-8');
  const wallet: EncryptedWallet = JSON.parse(content);

  return {
    address: wallet.address,
    stealthMetaAddress: wallet.stealthMetaAddress,
    createdAt: wallet.createdAt
  };
}

/**
 * Load app configuration.
 */
export async function loadConfig(): Promise<AppConfig> {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { activeNetwork: 'mainnet' };
  }
}

/**
 * Save app configuration.
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  await ensureDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600
  });
}

/**
 * Update last scanned block for a chain.
 */
export async function updateLastScanBlock(
  chainId: number,
  blockNumber: bigint
): Promise<void> {
  const config = await loadConfig();
  config.lastScanBlock = config.lastScanBlock || {};
  config.lastScanBlock[chainId] = blockNumber.toString();
  await saveConfig(config);
}

/**
 * Get last scanned block for a chain.
 */
export async function getLastScanBlock(chainId: number): Promise<bigint | null> {
  const config = await loadConfig();
  const block = config.lastScanBlock?.[chainId];
  return block ? BigInt(block) : null;
}

/**
 * Delete wallet (requires confirmation).
 */
export async function deleteWallet(): Promise<void> {
  const exists = await walletExists();
  if (!exists) {
    throw new Error('No wallet to delete');
  }

  // Overwrite with zeros before deleting (best effort secure delete)
  const content = await readFile(WALLET_FILE, 'utf-8');
  const zeros = '0'.repeat(content.length);
  await writeFile(WALLET_FILE, zeros);
  
  // Now delete
  const { unlink } = await import('fs/promises');
  await unlink(WALLET_FILE);
}

/**
 * Export wallet backup (encrypted).
 */
export async function exportWallet(targetPath: string): Promise<void> {
  const exists = await walletExists();
  if (!exists) {
    throw new Error('No wallet to export');
  }

  const content = await readFile(WALLET_FILE, 'utf-8');
  await writeFile(targetPath, content, { mode: 0o600 });
}

/**
 * Import wallet from backup.
 */
export async function importWallet(sourcePath: string): Promise<void> {
  const content = await readFile(sourcePath, 'utf-8');
  const wallet: EncryptedWallet = JSON.parse(content);

  if (wallet.version !== 1) {
    throw new Error(`Unsupported wallet version: ${wallet.version}`);
  }

  // Validate structure
  if (!wallet.address || !wallet.stealthMetaAddress || !wallet.encryptedKeys) {
    throw new Error('Invalid wallet backup format');
  }

  await ensureDir();
  await writeFile(WALLET_FILE, content, { mode: 0o600 });
}
