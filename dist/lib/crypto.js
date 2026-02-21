/**
 * Cryptographic operations for stealth addresses.
 * Implements ERC-5564 SECP256k1 scheme with view tags.
 */
import { ProjectivePoint, getPublicKey, getSharedSecret, utils } from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { randomBytes } from '@noble/hashes/utils';
import { bytesToHex, hexToBytes, keccak256, publicKeyToAddress } from 'viem/utils';
const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
/**
 * Generate stealth keys from a cryptographically secure random source.
 * This is the recommended way to create new keys.
 */
export function generateRandomKeys() {
    const spendingPrivateKey = utils.randomPrivateKey();
    const viewingPrivateKey = utils.randomPrivateKey();
    const spendingPublicKey = getPublicKey(spendingPrivateKey, true);
    const viewingPublicKey = getPublicKey(viewingPrivateKey, true);
    return {
        spendingPrivateKey: bytesToHex(spendingPrivateKey),
        spendingPublicKey: bytesToHex(spendingPublicKey),
        viewingPrivateKey: bytesToHex(viewingPrivateKey),
        viewingPublicKey: bytesToHex(viewingPublicKey)
    };
}
/**
 * Derive stealth keys from a signature (EIP-191/712).
 * The signature is split into two halves, each hashed to derive a private key.
 * WARNING: The signature must come from a secure source and never be reused.
 */
export function deriveKeysFromSignature(signature) {
    if (signature.length !== 132) { // 0x + 65 bytes = 132 chars
        throw new Error('Invalid signature length. Expected 65 bytes.');
    }
    // Remove 0x prefix
    const sigBytes = signature.slice(2);
    // Split signature: first 32 bytes for spending, second 32 bytes for viewing
    const portion1 = sigBytes.slice(0, 64);
    const portion2 = sigBytes.slice(64, 128);
    // Hash each portion to derive private keys
    const spendingPrivateKey = hexToBytes(keccak256(`0x${portion1}`));
    const viewingPrivateKey = hexToBytes(keccak256(`0x${portion2}`));
    // Validate keys are within curve order
    if (!utils.isValidPrivateKey(spendingPrivateKey)) {
        throw new Error('Derived spending key is invalid');
    }
    if (!utils.isValidPrivateKey(viewingPrivateKey)) {
        throw new Error('Derived viewing key is invalid');
    }
    const spendingPublicKey = getPublicKey(spendingPrivateKey, true);
    const viewingPublicKey = getPublicKey(viewingPrivateKey, true);
    return {
        spendingPrivateKey: bytesToHex(spendingPrivateKey),
        spendingPublicKey: bytesToHex(spendingPublicKey),
        viewingPrivateKey: bytesToHex(viewingPrivateKey),
        viewingPublicKey: bytesToHex(viewingPublicKey)
    };
}
/**
 * Create a stealth meta-address from public keys.
 * Format: 0x<spendingPubKey><viewingPubKey> (66 bytes total for compressed keys)
 */
export function createStealthMetaAddress(keys) {
    const spending = keys.spendingPublicKey.slice(2); // Remove 0x
    const viewing = keys.viewingPublicKey.slice(2);
    return `0x${spending}${viewing}`;
}
/**
 * Parse a stealth meta-address into spending and viewing public keys.
 */
export function parseStealthMetaAddress(metaAddress) {
    const cleaned = metaAddress.slice(2);
    // Can be 66 chars (single key) or 132 chars (two keys)
    if (cleaned.length === 66) {
        return {
            spendingPublicKey: `0x${cleaned}`,
            viewingPublicKey: `0x${cleaned}`
        };
    }
    if (cleaned.length !== 132) {
        throw new Error('Invalid stealth meta-address length');
    }
    return {
        spendingPublicKey: `0x${cleaned.slice(0, 66)}`,
        viewingPublicKey: `0x${cleaned.slice(66)}`
    };
}
/**
 * Validate a compressed public key.
 */
export function isValidPublicKey(pubKey) {
    const cleaned = pubKey.slice(2);
    if (cleaned.length !== 66)
        return false;
    if (!cleaned.startsWith('02') && !cleaned.startsWith('03'))
        return false;
    try {
        ProjectivePoint.fromHex(cleaned);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Generate a stealth address for a recipient.
 * Implements ERC-5564 SECP256k1 with view tags.
 */
export function generateStealthAddress(recipientMetaAddress, ephemeralPrivateKey) {
    const { spendingPublicKey, viewingPublicKey } = parseStealthMetaAddress(recipientMetaAddress);
    // Generate or use provided ephemeral key
    const ephPrivKey = ephemeralPrivateKey ?? utils.randomPrivateKey();
    const ephPubKey = getPublicKey(ephPrivKey, true);
    // Compute shared secret: ephemeralPrivate * viewingPublic
    const sharedSecret = getSharedSecret(ephPrivKey, hexToBytes(viewingPublicKey));
    // Hash shared secret
    const hashedSecret = keccak256(sharedSecret);
    // Extract view tag (first byte)
    const viewTag = `0x${hashedSecret.slice(2, 4)}`;
    // Compute stealth public key: spendingPublic + hash(sharedSecret) * G
    const spendingPoint = ProjectivePoint.fromHex(spendingPublicKey.slice(2));
    const hashedSecretPoint = ProjectivePoint.fromPrivateKey(hexToBytes(hashedSecret));
    const stealthPublicKey = spendingPoint.add(hashedSecretPoint).toRawBytes(false);
    // Derive address from stealth public key
    const stealthAddress = publicKeyToAddress(bytesToHex(stealthPublicKey));
    return {
        stealthAddress,
        ephemeralPublicKey: bytesToHex(ephPubKey),
        viewTag
    };
}
/**
 * Check if a stealth address belongs to us using the viewing key.
 * Returns null if not ours, the address info if it is.
 */
export function checkStealthAddress(ephemeralPublicKey, spendingPublicKey, viewingPrivateKey, announcedAddress, announcedViewTag) {
    // Compute shared secret: viewingPrivate * ephemeralPublic
    const sharedSecret = getSharedSecret(hexToBytes(viewingPrivateKey), hexToBytes(ephemeralPublicKey));
    // Hash shared secret
    const hashedSecret = keccak256(sharedSecret);
    // Check view tag first (optimization)
    const computedViewTag = `0x${hashedSecret.slice(2, 4)}`;
    if (computedViewTag.toLowerCase() !== announcedViewTag.toLowerCase()) {
        return false;
    }
    // Compute stealth public key
    const spendingPoint = ProjectivePoint.fromHex(spendingPublicKey.slice(2));
    const hashedSecretPoint = ProjectivePoint.fromPrivateKey(hexToBytes(hashedSecret));
    const stealthPublicKey = spendingPoint.add(hashedSecretPoint).toRawBytes(false);
    // Derive address
    const computedAddress = publicKeyToAddress(bytesToHex(stealthPublicKey));
    return computedAddress.toLowerCase() === announcedAddress.toLowerCase();
}
/**
 * Compute the private key for a stealth address.
 * stealthPrivate = spendingPrivate + hash(viewingPrivate * ephemeralPublic) mod n
 */
export function computeStealthPrivateKey(ephemeralPublicKey, spendingPrivateKey, viewingPrivateKey) {
    // Compute shared secret
    const sharedSecret = getSharedSecret(hexToBytes(viewingPrivateKey), hexToBytes(ephemeralPublicKey));
    // Hash shared secret
    const hashedSecret = keccak256(sharedSecret);
    // Add spending private key + hashed secret mod curve order
    const spendingBigInt = BigInt(spendingPrivateKey);
    const hashedBigInt = BigInt(hashedSecret);
    const stealthPrivateKeyBigInt = (spendingBigInt + hashedBigInt) % CURVE_ORDER;
    // Convert to 32-byte hex
    return `0x${stealthPrivateKeyBigInt.toString(16).padStart(64, '0')}`;
}
/**
 * Derive the user's main address from their spending public key.
 */
export function deriveMainAddress(spendingPublicKey) {
    // For compressed key, we need to decompress first
    const point = ProjectivePoint.fromHex(spendingPublicKey.slice(2));
    const uncompressed = point.toRawBytes(false);
    return publicKeyToAddress(bytesToHex(uncompressed));
}
/**
 * Create metadata for an announcement.
 * Format: viewTag (1 byte) + optional data
 */
export function createAnnouncementMetadata(viewTag, extraData) {
    const viewTagByte = viewTag.slice(2, 4);
    const extra = extraData ? extraData.slice(2) : '';
    return `0x${viewTagByte}${extra}`;
}
/**
 * Extract view tag from announcement metadata.
 */
export function extractViewTag(metadata) {
    return `0x${metadata.slice(2, 4)}`;
}
// --- Encryption utilities for wallet storage ---
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
/**
 * Derive an encryption key from a password using PBKDF2.
 */
export function deriveEncryptionKey(password, salt) {
    return pbkdf2(sha256, new TextEncoder().encode(password), salt, {
        c: PBKDF2_ITERATIONS,
        dkLen: 32
    });
}
/**
 * Encrypt data using AES-256-GCM.
 */
export async function encryptData(data, password) {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = deriveEncryptionKey(password, salt);
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(data));
    return {
        encrypted: bytesToHex(new Uint8Array(encrypted)),
        salt: bytesToHex(salt),
        iv: bytesToHex(iv)
    };
}
/**
 * Decrypt data using AES-256-GCM.
 */
export async function decryptData(encryptedHex, password, saltHex, ivHex) {
    const salt = hexToBytes(saltHex);
    const iv = hexToBytes(ivHex);
    const encrypted = hexToBytes(encryptedHex);
    const key = deriveEncryptionKey(password, salt);
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
    try {
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted);
        return new TextDecoder().decode(decrypted);
    }
    catch {
        throw new Error('Decryption failed. Wrong password?');
    }
}
//# sourceMappingURL=crypto.js.map