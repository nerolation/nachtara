/**
 * Cryptographic operations for stealth addresses.
 * Implements ERC-5564 SECP256k1 scheme with view tags.
 */
import type { Address, Hex } from 'viem';
import type { StealthKeys, StealthAddressInfo } from './types.js';
/**
 * Generate stealth keys from a cryptographically secure random source.
 * This is the recommended way to create new keys.
 */
export declare function generateRandomKeys(): StealthKeys;
/**
 * Derive stealth keys from a signature (EIP-191/712).
 * The signature is split into two halves, each hashed to derive a private key.
 * WARNING: The signature must come from a secure source and never be reused.
 */
export declare function deriveKeysFromSignature(signature: Hex): StealthKeys;
/**
 * Create a stealth meta-address from public keys.
 * Format: 0x<spendingPubKey><viewingPubKey> (66 bytes total for compressed keys)
 */
export declare function createStealthMetaAddress(keys: StealthKeys): Hex;
/**
 * Parse a stealth meta-address into spending and viewing public keys.
 */
export declare function parseStealthMetaAddress(metaAddress: Hex): {
    spendingPublicKey: Hex;
    viewingPublicKey: Hex;
};
/**
 * Validate a compressed public key.
 */
export declare function isValidPublicKey(pubKey: Hex): boolean;
/**
 * Generate a stealth address for a recipient.
 * Implements ERC-5564 SECP256k1 with view tags.
 */
export declare function generateStealthAddress(recipientMetaAddress: Hex, ephemeralPrivateKey?: Uint8Array): StealthAddressInfo;
/**
 * Check if a stealth address belongs to us using the viewing key.
 * Returns null if not ours, the address info if it is.
 */
export declare function checkStealthAddress(ephemeralPublicKey: Hex, spendingPublicKey: Hex, viewingPrivateKey: Hex, announcedAddress: Address, announcedViewTag: Hex): boolean;
/**
 * Compute the private key for a stealth address.
 * stealthPrivate = spendingPrivate + hash(viewingPrivate * ephemeralPublic) mod n
 */
export declare function computeStealthPrivateKey(ephemeralPublicKey: Hex, spendingPrivateKey: Hex, viewingPrivateKey: Hex): Hex;
/**
 * Derive the user's main address from their spending public key.
 */
export declare function deriveMainAddress(spendingPublicKey: Hex): Address;
/**
 * Create metadata for an announcement.
 * Format: viewTag (1 byte) + optional data
 */
export declare function createAnnouncementMetadata(viewTag: Hex, extraData?: Hex): Hex;
/**
 * Extract view tag from announcement metadata.
 */
export declare function extractViewTag(metadata: Hex): Hex;
/**
 * Derive an encryption key from a password using PBKDF2.
 */
export declare function deriveEncryptionKey(password: string, salt: Uint8Array): Uint8Array;
/**
 * Encrypt data using AES-256-GCM.
 */
export declare function encryptData(data: string, password: string): Promise<{
    encrypted: string;
    salt: string;
    iv: string;
}>;
/**
 * Decrypt data using AES-256-GCM.
 */
export declare function decryptData(encryptedHex: string, password: string, saltHex: string, ivHex: string): Promise<string>;
//# sourceMappingURL=crypto.d.ts.map