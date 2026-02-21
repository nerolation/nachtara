/**
 * Secure wallet storage.
 * Encrypts private keys before writing to disk.
 */
import type { Address, Hex } from 'viem';
import type { StealthKeys, WalletData } from './types.js';
export interface AppConfig {
    activeNetwork: string;
    customRpcUrl?: string;
    lastScanBlock?: Record<number, string>;
}
/**
 * Check if a wallet exists.
 */
export declare function walletExists(): Promise<boolean>;
/**
 * Save wallet with encryption.
 */
export declare function saveWallet(keys: StealthKeys, password: string): Promise<WalletData>;
/**
 * Load wallet with decryption.
 */
export declare function loadWallet(password: string): Promise<WalletData>;
/**
 * Get wallet info without decryption (public data only).
 */
export declare function getWalletInfo(): Promise<{
    address: Address;
    stealthMetaAddress: Hex;
    createdAt: number;
} | null>;
/**
 * Load app configuration.
 */
export declare function loadConfig(): Promise<AppConfig>;
/**
 * Save app configuration.
 */
export declare function saveConfig(config: AppConfig): Promise<void>;
/**
 * Update last scanned block for a chain.
 */
export declare function updateLastScanBlock(chainId: number, blockNumber: bigint): Promise<void>;
/**
 * Get last scanned block for a chain.
 */
export declare function getLastScanBlock(chainId: number): Promise<bigint | null>;
/**
 * Delete wallet (requires confirmation).
 */
export declare function deleteWallet(): Promise<void>;
/**
 * Export wallet backup (encrypted).
 */
export declare function exportWallet(targetPath: string): Promise<void>;
/**
 * Import wallet from backup.
 */
export declare function importWallet(sourcePath: string): Promise<void>;
//# sourceMappingURL=storage.d.ts.map