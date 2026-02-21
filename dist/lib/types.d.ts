import type { Address, Hex } from 'viem';
export declare const SCHEME_ID = 1n;
export interface StealthKeys {
    spendingPrivateKey: Hex;
    spendingPublicKey: Hex;
    viewingPrivateKey: Hex;
    viewingPublicKey: Hex;
}
export interface WalletData {
    address: Address;
    stealthMetaAddress: Hex;
    keys: StealthKeys;
    createdAt: number;
}
export interface EncryptedWallet {
    version: 1;
    address: Address;
    stealthMetaAddress: Hex;
    encryptedKeys: string;
    salt: string;
    iv: string;
    createdAt: number;
}
export interface StealthAddressInfo {
    stealthAddress: Address;
    ephemeralPublicKey: Hex;
    viewTag: Hex;
}
export interface AnnouncementData {
    schemeId: bigint;
    stealthAddress: Address;
    caller: Address;
    ephemeralPubKey: Hex;
    metadata: Hex;
    blockNumber: bigint;
    transactionHash: Hex;
}
export interface OwnedStealthAddress {
    address: Address;
    privateKey: Hex;
    balance: bigint;
    announcement: AnnouncementData;
}
export interface NetworkConfig {
    chainId: number;
    name: string;
    rpcUrl: string;
    blockExplorer?: string;
}
export declare const SUPPORTED_NETWORKS: Record<string, NetworkConfig>;
export declare const ERC5564_ANNOUNCER: "0x55649E01B5Df198D18D95b5cc5051630cfD45564";
export declare const ERC6538_REGISTRY: "0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538";
export declare const STEALTH_FORWARDER: Record<number, `0x${string}`>;
export declare const START_BLOCKS: Record<number, bigint>;
//# sourceMappingURL=types.d.ts.map