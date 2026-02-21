/**
 * Comprehensive tests for stealth address cryptography.
 * Tests the core ERC-5564 SECP256k1 implementation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { Hex, Address } from 'viem';
import {
  generateRandomKeys,
  deriveKeysFromSignature,
  createStealthMetaAddress,
  parseStealthMetaAddress,
  generateStealthAddress,
  checkStealthAddress,
  computeStealthPrivateKey,
  isValidPublicKey,
  deriveMainAddress,
  createAnnouncementMetadata,
  extractViewTag,
  encryptData,
  decryptData
} from '../src/lib/crypto.js';

describe('Key Generation', () => {
  it('generates valid random keys', () => {
    const keys = generateRandomKeys();
    
    expect(keys.spendingPrivateKey).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(keys.viewingPrivateKey).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(keys.spendingPublicKey).toMatch(/^0x0[23][a-f0-9]{64}$/i);
    expect(keys.viewingPublicKey).toMatch(/^0x0[23][a-f0-9]{64}$/i);
    
    // Keys should be different
    expect(keys.spendingPrivateKey).not.toBe(keys.viewingPrivateKey);
  });

  it('generates different keys each time', () => {
    const keys1 = generateRandomKeys();
    const keys2 = generateRandomKeys();
    
    expect(keys1.spendingPrivateKey).not.toBe(keys2.spendingPrivateKey);
    expect(keys1.viewingPrivateKey).not.toBe(keys2.viewingPrivateKey);
  });

  it('derives keys from signature correctly', async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    
    const signature = await account.signMessage({
      message: 'Test message for stealth keys'
    });

    const keys = deriveKeysFromSignature(signature);
    
    expect(keys.spendingPrivateKey).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(keys.viewingPrivateKey).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(isValidPublicKey(keys.spendingPublicKey)).toBe(true);
    expect(isValidPublicKey(keys.viewingPublicKey)).toBe(true);
  });

  it('derives same keys from same signature', async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    
    const signature = await account.signMessage({
      message: 'Deterministic test'
    });

    const keys1 = deriveKeysFromSignature(signature);
    const keys2 = deriveKeysFromSignature(signature);
    
    expect(keys1.spendingPrivateKey).toBe(keys2.spendingPrivateKey);
    expect(keys1.viewingPrivateKey).toBe(keys2.viewingPrivateKey);
  });

  it('rejects invalid signature length', () => {
    expect(() => deriveKeysFromSignature('0x1234' as Hex)).toThrow('Invalid signature length');
  });
});

describe('Stealth Meta-Address', () => {
  it('creates meta-address from keys', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    
    // Should be 0x + 66 chars (spending) + 66 chars (viewing) = 134 chars
    expect(meta.length).toBe(134);
    expect(meta.startsWith('0x')).toBe(true);
  });

  it('parses meta-address with two keys', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    
    const { spendingPublicKey, viewingPublicKey } = parseStealthMetaAddress(meta);
    
    expect(spendingPublicKey).toBe(keys.spendingPublicKey);
    expect(viewingPublicKey).toBe(keys.viewingPublicKey);
  });

  it('parses meta-address with single key (same for both)', () => {
    const keys = generateRandomKeys();
    // Single-key meta-address (66 chars after 0x)
    const singleMeta = keys.spendingPublicKey;
    
    const { spendingPublicKey, viewingPublicKey } = parseStealthMetaAddress(singleMeta);
    
    expect(spendingPublicKey).toBe(keys.spendingPublicKey);
    expect(viewingPublicKey).toBe(keys.spendingPublicKey);
  });

  it('rejects invalid meta-address length', () => {
    expect(() => parseStealthMetaAddress('0x1234' as Hex)).toThrow('Invalid stealth meta-address length');
  });
});

describe('Public Key Validation', () => {
  it('validates correct compressed public keys', () => {
    const keys = generateRandomKeys();
    expect(isValidPublicKey(keys.spendingPublicKey)).toBe(true);
    expect(isValidPublicKey(keys.viewingPublicKey)).toBe(true);
  });

  it('rejects invalid public key prefix', () => {
    // Valid length but wrong prefix (should start with 02 or 03)
    const invalid = '0x04' + '0'.repeat(64);
    expect(isValidPublicKey(invalid as Hex)).toBe(false);
  });

  it('rejects wrong length public keys', () => {
    expect(isValidPublicKey('0x0212345678' as Hex)).toBe(false);
  });

  it('rejects non-curve points', () => {
    // Random data that's not on the curve
    const invalid = '0x02' + 'f'.repeat(64);
    expect(isValidPublicKey(invalid as Hex)).toBe(false);
  });
});

describe('Stealth Address Generation', () => {
  let recipientKeys: ReturnType<typeof generateRandomKeys>;
  let recipientMeta: Hex;

  beforeAll(() => {
    recipientKeys = generateRandomKeys();
    recipientMeta = createStealthMetaAddress(recipientKeys);
  });

  it('generates valid stealth address', () => {
    const result = generateStealthAddress(recipientMeta);
    
    expect(result.stealthAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(result.ephemeralPublicKey).toMatch(/^0x0[23][a-f0-9]{64}$/i);
    expect(result.viewTag).toMatch(/^0x[a-f0-9]{2}$/i);
  });

  it('generates different stealth addresses each time', () => {
    const result1 = generateStealthAddress(recipientMeta);
    const result2 = generateStealthAddress(recipientMeta);
    
    expect(result1.stealthAddress).not.toBe(result2.stealthAddress);
    expect(result1.ephemeralPublicKey).not.toBe(result2.ephemeralPublicKey);
  });

  it('recipient can identify their stealth address', () => {
    const result = generateStealthAddress(recipientMeta);
    
    const isOurs = checkStealthAddress(
      result.ephemeralPublicKey,
      recipientKeys.spendingPublicKey,
      recipientKeys.viewingPrivateKey,
      result.stealthAddress,
      result.viewTag
    );
    
    expect(isOurs).toBe(true);
  });

  it('non-recipient cannot identify stealth address', () => {
    const result = generateStealthAddress(recipientMeta);
    const otherKeys = generateRandomKeys();
    
    const isOurs = checkStealthAddress(
      result.ephemeralPublicKey,
      otherKeys.spendingPublicKey,
      otherKeys.viewingPrivateKey,
      result.stealthAddress,
      result.viewTag
    );
    
    expect(isOurs).toBe(false);
  });

  it('view tag optimization correctly filters', () => {
    const result = generateStealthAddress(recipientMeta);
    
    // Wrong view tag should fail fast
    const wrongViewTag = result.viewTag === '0x00' ? '0x01' : '0x00';
    
    const isOurs = checkStealthAddress(
      result.ephemeralPublicKey,
      recipientKeys.spendingPublicKey,
      recipientKeys.viewingPrivateKey,
      result.stealthAddress,
      wrongViewTag as Hex
    );
    
    expect(isOurs).toBe(false);
  });
});

describe('Stealth Private Key Computation', () => {
  it('computes correct stealth private key', async () => {
    const recipientKeys = generateRandomKeys();
    const recipientMeta = createStealthMetaAddress(recipientKeys);
    
    const result = generateStealthAddress(recipientMeta);
    
    // Compute stealth private key
    const stealthPrivateKey = computeStealthPrivateKey(
      result.ephemeralPublicKey,
      recipientKeys.spendingPrivateKey,
      recipientKeys.viewingPrivateKey
    );
    
    expect(stealthPrivateKey).toMatch(/^0x[a-f0-9]{64}$/i);
    
    // Verify the private key matches the stealth address
    const account = privateKeyToAccount(stealthPrivateKey);
    expect(account.address.toLowerCase()).toBe(result.stealthAddress.toLowerCase());
  });

  it('can sign transactions with stealth private key', async () => {
    const recipientKeys = generateRandomKeys();
    const recipientMeta = createStealthMetaAddress(recipientKeys);
    
    const result = generateStealthAddress(recipientMeta);
    
    const stealthPrivateKey = computeStealthPrivateKey(
      result.ephemeralPublicKey,
      recipientKeys.spendingPrivateKey,
      recipientKeys.viewingPrivateKey
    );
    
    const account = privateKeyToAccount(stealthPrivateKey);
    
    // Should be able to sign a message
    const signature = await account.signMessage({ message: 'test' });
    expect(signature).toMatch(/^0x[a-f0-9]+$/i);
  });
});

describe('Address Derivation', () => {
  it('derives main address from spending public key', () => {
    const keys = generateRandomKeys();
    const address = deriveMainAddress(keys.spendingPublicKey);
    
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('derives consistent addresses', () => {
    const keys = generateRandomKeys();
    const address1 = deriveMainAddress(keys.spendingPublicKey);
    const address2 = deriveMainAddress(keys.spendingPublicKey);
    
    expect(address1).toBe(address2);
  });
});

describe('Metadata Handling', () => {
  it('creates valid announcement metadata', () => {
    const viewTag = '0xab' as Hex;
    const metadata = createAnnouncementMetadata(viewTag);
    
    expect(metadata).toBe('0xab');
  });

  it('creates metadata with extra data', () => {
    const viewTag = '0xab' as Hex;
    const extra = '0x1234567890' as Hex;
    const metadata = createAnnouncementMetadata(viewTag, extra);
    
    expect(metadata).toBe('0xab1234567890');
  });

  it('extracts view tag from metadata', () => {
    const metadata = '0xabcdef123456' as Hex;
    const viewTag = extractViewTag(metadata);
    
    expect(viewTag).toBe('0xab');
  });
});

describe('Encryption', () => {
  it('encrypts and decrypts data correctly', async () => {
    const originalData = JSON.stringify({ secret: 'value123' });
    const password = 'testpassword123';
    
    const { encrypted, salt, iv } = await encryptData(originalData, password);
    
    expect(encrypted).toMatch(/^0x[a-f0-9]+$/i);
    expect(salt).toMatch(/^0x[a-f0-9]+$/i);
    expect(iv).toMatch(/^0x[a-f0-9]+$/i);
    
    const decrypted = await decryptData(encrypted, password, salt, iv);
    expect(decrypted).toBe(originalData);
  });

  it('fails with wrong password', async () => {
    const originalData = 'secret data';
    const password = 'correctpassword';
    
    const { encrypted, salt, iv } = await encryptData(originalData, password);
    
    await expect(
      decryptData(encrypted, 'wrongpassword', salt, iv)
    ).rejects.toThrow('Decryption failed');
  });

  it('produces different ciphertext for same data', async () => {
    const data = 'same data';
    const password = 'password';
    
    const result1 = await encryptData(data, password);
    const result2 = await encryptData(data, password);
    
    // Different salts/IVs mean different ciphertext
    expect(result1.encrypted).not.toBe(result2.encrypted);
    expect(result1.salt).not.toBe(result2.salt);
    expect(result1.iv).not.toBe(result2.iv);
  });
});

describe('Full Flow: Send → Receive', () => {
  it('completes full stealth payment flow', async () => {
    // 1. Recipient generates keys
    const recipientKeys = generateRandomKeys();
    const recipientMeta = createStealthMetaAddress(recipientKeys);
    
    // 2. Sender generates stealth address
    const { stealthAddress, ephemeralPublicKey, viewTag } = generateStealthAddress(recipientMeta);
    
    // 3. Sender creates metadata for announcement
    const metadata = createAnnouncementMetadata(viewTag);
    
    // 4. Recipient scans announcement
    const extractedViewTag = extractViewTag(metadata);
    
    // 5. Recipient checks if it's theirs
    const isForRecipient = checkStealthAddress(
      ephemeralPublicKey,
      recipientKeys.spendingPublicKey,
      recipientKeys.viewingPrivateKey,
      stealthAddress,
      extractedViewTag
    );
    
    expect(isForRecipient).toBe(true);
    
    // 6. Recipient computes private key
    const stealthPrivateKey = computeStealthPrivateKey(
      ephemeralPublicKey,
      recipientKeys.spendingPrivateKey,
      recipientKeys.viewingPrivateKey
    );
    
    // 7. Verify ownership
    const stealthAccount = privateKeyToAccount(stealthPrivateKey);
    expect(stealthAccount.address.toLowerCase()).toBe(stealthAddress.toLowerCase());
    
    // 8. Recipient can sign
    const proof = await stealthAccount.signMessage({ message: 'I own this stealth address' });
    expect(proof).toBeTruthy();
  });
});

describe('Edge Cases', () => {
  it('handles meta-address with same spending and viewing key', () => {
    const keys = generateRandomKeys();
    // Use spending key for both
    const meta = keys.spendingPublicKey;
    
    const result = generateStealthAddress(meta);
    
    // Should still work
    expect(result.stealthAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    
    // Recipient with same key for both should identify it
    const isOurs = checkStealthAddress(
      result.ephemeralPublicKey,
      keys.spendingPublicKey,
      keys.spendingPrivateKey, // Using spending key as viewing key
      result.stealthAddress,
      result.viewTag
    );
    
    expect(isOurs).toBe(true);
  });

  it('handles many consecutive stealth addresses', () => {
    const recipientKeys = generateRandomKeys();
    const recipientMeta = createStealthMetaAddress(recipientKeys);
    
    const addresses = new Set<string>();
    
    for (let i = 0; i < 100; i++) {
      const result = generateStealthAddress(recipientMeta);
      
      // All should be unique
      expect(addresses.has(result.stealthAddress)).toBe(false);
      addresses.add(result.stealthAddress);
      
      // All should be identifiable by recipient
      const isOurs = checkStealthAddress(
        result.ephemeralPublicKey,
        recipientKeys.spendingPublicKey,
        recipientKeys.viewingPrivateKey,
        result.stealthAddress,
        result.viewTag
      );
      expect(isOurs).toBe(true);
    }
  });
});
