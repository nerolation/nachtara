/**
 * Network and RPC handling.
 */
import { type PublicClient, type WalletClient, type Transport, type Chain, type Account, type Address, type Hex } from 'viem';
import { type NetworkConfig, type AnnouncementData } from './types.js';
/**
 * Get current network configuration.
 */
export declare function getCurrentNetwork(): Promise<NetworkConfig>;
/**
 * Set active network.
 */
export declare function setNetwork(networkName: string): Promise<NetworkConfig>;
/**
 * Set custom RPC URL.
 */
export declare function setCustomRpc(rpcUrl: string): Promise<void>;
/**
 * Clear custom RPC URL.
 */
export declare function clearCustomRpc(): Promise<void>;
/**
 * Create a public client for the current network.
 */
export declare function createPublicClientForNetwork(): Promise<PublicClient>;
/**
 * Create a wallet client for signing transactions.
 */
export declare function createWalletClientForNetwork(privateKey: Hex): Promise<WalletClient<Transport, Chain, Account>>;
/**
 * Get the stealth meta-address registered for an address.
 */
export declare function getRegisteredMetaAddress(registrant: Address): Promise<Hex | null>;
/**
 * Register a stealth meta-address on-chain.
 */
export declare function registerMetaAddress(stealthMetaAddress: Hex, privateKey: Hex): Promise<Hex>;
/**
 * Send ETH to a stealth address and announce.
 * Uses StealthForwarder for atomic single-tx when available,
 * falls back to two-tx approach otherwise.
 */
export declare function sendToStealthAddress(params: {
    stealthAddress: Address;
    ephemeralPublicKey: Hex;
    viewTag: Hex;
    amount: string;
    privateKey: Hex;
}): Promise<{
    txHash: Hex;
    usedForwarder: boolean;
}>;
/**
 * Fetch announcements from the chain.
 */
export declare function fetchAnnouncements(params?: {
    fromBlock?: bigint;
    toBlock?: bigint | 'latest';
}): Promise<AnnouncementData[]>;
/**
 * Get balance of an address.
 */
export declare function getBalance(address: Address): Promise<bigint>;
/**
 * Send ETH from a stealth address (withdraw).
 */
export declare function withdrawFromStealthAddress(params: {
    stealthPrivateKey: Hex;
    toAddress: Address;
    amount?: string;
}): Promise<Hex>;
/**
 * Get current gas price.
 */
export declare function getGasPrice(): Promise<bigint>;
/**
 * Get current block number.
 */
export declare function getBlockNumber(): Promise<bigint>;
//# sourceMappingURL=network.d.ts.map