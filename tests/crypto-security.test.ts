/**
 * Security-focused cryptographic tests.
 * Tests edge cases, malformed inputs, and cryptographic properties.
 */

import { describe, it, expect } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { Hex } from 'viem';
import {
  generateRandomKeys,
  deriveKeysFromSignature,
  createStealthMetaAddress,
  parseStealthMetaAddress,
  generateStealthAddress,
  checkStealthAddress,
  computeStealthPrivateKey,
  isValidPublicKey,
  encryptData,
  decryptData,
  deriveEncryptionKey
} from '../src/lib/crypto.js';

describe('Cryptographic Security Properties', () => {
  describe('Key Entropy', () => {
    it('generates keys with sufficient entropy', () => {
      const samples = 1000;
      const keys = new Set<string>();
      
      for (let i = 0; i < samples; i++) {
        const k = generateRandomKeys();
        keys.add(k.spendingPrivateKey);
        keys.add(k.viewingPrivateKey);
      }
      
      // All keys should be unique
      expect(keys.size).toBe(samples * 2);
    });

    it('spending and viewing keys are independent', () => {
      // Keys derived from different parts shouldn't correlate
      for (let i = 0; i < 100; i++) {
        const keys = generateRandomKeys();
        
        // Keys should be different
        expect(keys.spendingPrivateKey).not.toBe(keys.viewingPrivateKey);
        
        // No obvious relationship (XOR shouldn't be zero or simple pattern)
        const spend = BigInt(keys.spendingPrivateKey);
        const view = BigInt(keys.viewingPrivateKey);
        const xor = spend ^ view;
        
        // XOR should have high Hamming weight (many 1 bits)
        const hammingWeight = xor.toString(2).split('1').length - 1;
        expect(hammingWeight).toBeGreaterThan(50); // At least 50 bits different
      }
    });
  });

  describe('Signature-Derived Keys Security', () => {
    it('different messages produce different keys', async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      
      const sig1 = await account.signMessage({ message: 'message 1' });
      const sig2 = await account.signMessage({ message: 'message 2' });
      
      const keys1 = deriveKeysFromSignature(sig1);
      const keys2 = deriveKeysFromSignature(sig2);
      
      expect(keys1.spendingPrivateKey).not.toBe(keys2.spendingPrivateKey);
      expect(keys1.viewingPrivateKey).not.toBe(keys2.viewingPrivateKey);
    });

    it('signature portions are properly separated', async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      
      const signature = await account.signMessage({ message: 'test' });
      const keys = deriveKeysFromSignature(signature);
      
      // Spending comes from first 32 bytes, viewing from second 32 bytes
      // They should be unrelated
      expect(keys.spendingPrivateKey).not.toBe(keys.viewingPrivateKey);
    });
  });

  describe('Stealth Address Unlinkability', () => {
    it('same recipient gets unlinkable stealth addresses', () => {
      const recipientKeys = generateRandomKeys();
      const meta = createStealthMetaAddress(recipientKeys);
      
      const addresses: string[] = [];
      const ephemeralKeys: string[] = [];
      
      for (let i = 0; i < 100; i++) {
        const result = generateStealthAddress(meta);
        addresses.push(result.stealthAddress);
        ephemeralKeys.push(result.ephemeralPublicKey);
      }
      
      // All addresses unique
      expect(new Set(addresses).size).toBe(100);
      
      // All ephemeral keys unique
      expect(new Set(ephemeralKeys).size).toBe(100);
      
      // No obvious pattern (addresses shouldn't be sequential)
      for (let i = 1; i < addresses.length; i++) {
        const diff = BigInt(addresses[i]) - BigInt(addresses[i-1]);
        // Difference should be large and random
        expect(Math.abs(Number(diff))).toBeGreaterThan(1000);
      }
    });

    it('different senders to same recipient produce unlinkable addresses', () => {
      const recipientKeys = generateRandomKeys();
      const meta = createStealthMetaAddress(recipientKeys);
      
      // Simulate different senders
      const addresses: string[] = [];
      
      for (let i = 0; i < 50; i++) {
        const result = generateStealthAddress(meta);
        addresses.push(result.stealthAddress);
      }
      
      // All unique
      expect(new Set(addresses).size).toBe(50);
    });
  });

  describe('View Tag Privacy', () => {
    it('view tag reveals only 1 byte of shared secret', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      // Generate many and collect view tags
      const viewTags = new Map<string, number>();
      
      for (let i = 0; i < 1000; i++) {
        const result = generateStealthAddress(meta);
        const count = viewTags.get(result.viewTag) || 0;
        viewTags.set(result.viewTag, count + 1);
      }
      
      // View tags should be roughly uniformly distributed
      // With 256 possible values and 1000 samples, expect ~4 each
      // Allow for statistical variation
      for (const [_, count] of viewTags) {
        expect(count).toBeLessThan(20); // No single tag dominates
      }
    });

    it('view tag cannot reveal stealth address', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      // Same view tag should map to different addresses
      const byViewTag = new Map<string, string[]>();
      
      for (let i = 0; i < 500; i++) {
        const result = generateStealthAddress(meta);
        const addrs = byViewTag.get(result.viewTag) || [];
        addrs.push(result.stealthAddress);
        byViewTag.set(result.viewTag, addrs);
      }
      
      // Each view tag should have different addresses
      for (const [_, addrs] of byViewTag) {
        if (addrs.length > 1) {
          expect(new Set(addrs).size).toBe(addrs.length);
        }
      }
    });
  });

  describe('Private Key Derivation Security', () => {
    it('stealth private key is valid secp256k1 key', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      for (let i = 0; i < 50; i++) {
        const result = generateStealthAddress(meta);
        const stealthKey = computeStealthPrivateKey(
          result.ephemeralPublicKey,
          keys.spendingPrivateKey,
          keys.viewingPrivateKey
        );
        
        // Should be valid 32-byte hex
        expect(stealthKey).toMatch(/^0x[a-f0-9]{64}$/i);
        
        // Should be within curve order
        const keyBigInt = BigInt(stealthKey);
        const curveOrder = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
        expect(keyBigInt).toBeGreaterThan(0n);
        expect(keyBigInt).toBeLessThan(curveOrder);
        
        // Should produce valid account
        const account = privateKeyToAccount(stealthKey);
        expect(account.address.toLowerCase()).toBe(result.stealthAddress.toLowerCase());
      }
    });

    it('cannot derive stealth key without viewing key', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Try with wrong viewing key
      const wrongKeys = generateRandomKeys();
      const wrongStealthKey = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        keys.spendingPrivateKey, // Correct spending
        wrongKeys.viewingPrivateKey // Wrong viewing
      );
      
      const wrongAccount = privateKeyToAccount(wrongStealthKey);
      expect(wrongAccount.address.toLowerCase()).not.toBe(result.stealthAddress.toLowerCase());
    });

    it('cannot derive stealth key without spending key', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Try with wrong spending key
      const wrongKeys = generateRandomKeys();
      const wrongStealthKey = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        wrongKeys.spendingPrivateKey, // Wrong spending
        keys.viewingPrivateKey // Correct viewing
      );
      
      const wrongAccount = privateKeyToAccount(wrongStealthKey);
      expect(wrongAccount.address.toLowerCase()).not.toBe(result.stealthAddress.toLowerCase());
    });
  });
});

describe('Input Validation & Edge Cases', () => {
  describe('Malformed Signatures', () => {
    it('rejects too-short signatures', () => {
      expect(() => deriveKeysFromSignature('0x1234' as Hex)).toThrow();
    });

    it('rejects too-long signatures', () => {
      const long = '0x' + 'ab'.repeat(100);
      expect(() => deriveKeysFromSignature(long as Hex)).toThrow();
    });

    it('handles signatures with different v values', async () => {
      // v can be 27, 28, or 0, 1 - all should work
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk);
      
      const sig = await account.signMessage({ message: 'test' });
      
      // Should not throw
      const keys = deriveKeysFromSignature(sig);
      expect(keys.spendingPrivateKey).toBeTruthy();
    });
  });

  describe('Malformed Meta-Addresses', () => {
    it('rejects invalid length meta-addresses', () => {
      expect(() => parseStealthMetaAddress('0x1234' as Hex)).toThrow();
      expect(() => parseStealthMetaAddress('0x' + 'ab'.repeat(50) as Hex)).toThrow();
    });

    it('rejects meta-addresses with invalid public keys', () => {
      // Valid length but invalid public key prefix
      const invalidMeta = '0x04' + '0'.repeat(64) + '04' + '0'.repeat(64);
      const { spendingPublicKey } = parseStealthMetaAddress(invalidMeta as Hex);
      expect(isValidPublicKey(spendingPublicKey)).toBe(false);
    });
  });

  describe('Public Key Validation', () => {
    it('rejects uncompressed public keys', () => {
      // Uncompressed key starts with 04
      const uncompressed = '0x04' + '0'.repeat(128);
      expect(isValidPublicKey(uncompressed as Hex)).toBe(false);
    });

    it('rejects keys not on curve', () => {
      // Valid format but not a real point
      const notOnCurve = '0x02' + 'ff'.repeat(32);
      expect(isValidPublicKey(notOnCurve as Hex)).toBe(false);
    });

    it('accepts valid compressed keys', () => {
      const keys = generateRandomKeys();
      expect(isValidPublicKey(keys.spendingPublicKey)).toBe(true);
      expect(isValidPublicKey(keys.viewingPublicKey)).toBe(true);
    });
  });

  describe('Address Checking Edge Cases', () => {
    it('rejects wrong stealth address', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Try with a different address
      const wrongAddress = '0x' + '1'.repeat(40);
      
      const isOurs = checkStealthAddress(
        result.ephemeralPublicKey,
        keys.spendingPublicKey,
        keys.viewingPrivateKey,
        wrongAddress as `0x${string}`,
        result.viewTag
      );
      
      expect(isOurs).toBe(false);
    });

    it('handles case-insensitive address comparison', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Try with uppercase address
      const upperAddress = result.stealthAddress.toUpperCase() as `0x${string}`;
      
      const isOurs = checkStealthAddress(
        result.ephemeralPublicKey,
        keys.spendingPublicKey,
        keys.viewingPrivateKey,
        upperAddress,
        result.viewTag
      );
      
      expect(isOurs).toBe(true);
    });
  });
});

describe('Encryption Security', () => {
  describe('AES-GCM Properties', () => {
    it('uses random IV for each encryption', async () => {
      const data = 'same data';
      const password = 'password';
      
      const ivs = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const { iv } = await encryptData(data, password);
        ivs.add(iv);
      }
      
      // All IVs should be unique
      expect(ivs.size).toBe(100);
    });

    it('uses random salt for each encryption', async () => {
      const data = 'same data';
      const password = 'password';
      
      const salts = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const { salt } = await encryptData(data, password);
        salts.add(salt);
      }
      
      // All salts should be unique
      expect(salts.size).toBe(100);
    });

    it('ciphertext changes with different IV/salt', async () => {
      const data = 'test data';
      const password = 'password';
      
      const ciphertexts = new Set<string>();
      
      for (let i = 0; i < 50; i++) {
        const { encrypted } = await encryptData(data, password);
        ciphertexts.add(encrypted);
      }
      
      // All ciphertexts should be unique
      expect(ciphertexts.size).toBe(50);
    });
  });

  describe('Password Security', () => {
    it('different passwords produce different ciphertext', async () => {
      const data = 'secret';
      
      const result1 = await encryptData(data, 'password1');
      const result2 = await encryptData(data, 'password2');
      
      // Even with same salt/IV (which won't happen), key derivation differs
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('empty password still works but is different from non-empty', async () => {
      const data = 'test';
      
      const empty = await encryptData(data, '');
      const nonEmpty = await encryptData(data, 'x');
      
      // Both should work
      const decrypted1 = await decryptData(empty.encrypted, '', empty.salt, empty.iv);
      const decrypted2 = await decryptData(nonEmpty.encrypted, 'x', nonEmpty.salt, nonEmpty.iv);
      
      expect(decrypted1).toBe(data);
      expect(decrypted2).toBe(data);
    });

    it('key derivation is deterministic given same inputs', () => {
      const password = 'test';
      const salt = new Uint8Array(32).fill(1);
      
      const key1 = deriveEncryptionKey(password, salt);
      const key2 = deriveEncryptionKey(password, salt);
      
      expect(Buffer.from(key1).toString('hex')).toBe(Buffer.from(key2).toString('hex'));
    });
  });

  describe('Tamper Detection', () => {
    it('detects modified ciphertext', async () => {
      const data = 'secret';
      const password = 'password';
      
      const { encrypted, salt, iv } = await encryptData(data, password);
      
      // Modify one byte
      const modified = encrypted.slice(0, -2) + 'ff';
      
      await expect(
        decryptData(modified, password, salt, iv)
      ).rejects.toThrow();
    });

    it('detects modified salt', async () => {
      const data = 'secret';
      const password = 'password';
      
      const { encrypted, salt, iv } = await encryptData(data, password);
      
      // Modify salt
      const modifiedSalt = salt.slice(0, -2) + 'ff';
      
      await expect(
        decryptData(encrypted, password, modifiedSalt, iv)
      ).rejects.toThrow();
    });

    it('detects modified IV', async () => {
      const data = 'secret';
      const password = 'password';
      
      const { encrypted, salt, iv } = await encryptData(data, password);
      
      // Modify IV
      const modifiedIv = iv.slice(0, -2) + 'ff';
      
      await expect(
        decryptData(encrypted, password, salt, modifiedIv)
      ).rejects.toThrow();
    });
  });
});

describe('Timing Attack Resistance', () => {
  // Note: These tests verify consistent behavior, not actual timing
  // True timing attack testing requires specialized tools
  
  it('checkStealthAddress rejects quickly on wrong view tag', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    const result = generateStealthAddress(meta);
    
    // Wrong view tag should fail on first comparison
    const wrongViewTag = (result.viewTag === '0x00' ? '0x01' : '0x00') as Hex;
    
    const isOurs = checkStealthAddress(
      result.ephemeralPublicKey,
      keys.spendingPublicKey,
      keys.viewingPrivateKey,
      result.stealthAddress,
      wrongViewTag
    );
    
    expect(isOurs).toBe(false);
  });
});
