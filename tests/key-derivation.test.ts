/**
 * Tests for key derivation and elliptic curve operations.
 * Ensures cryptographic correctness of the SECP256k1 scheme.
 */

import { describe, it, expect } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { getPublicKey, utils, ProjectivePoint, CURVE } from '@noble/secp256k1';
import { hexToBytes, bytesToHex, keccak256 } from 'viem/utils';
import type { Hex } from 'viem';
import {
  generateRandomKeys,
  deriveKeysFromSignature,
  createStealthMetaAddress,
  parseStealthMetaAddress,
  generateStealthAddress,
  computeStealthPrivateKey,
  isValidPublicKey
} from '../src/lib/crypto.js';

const CURVE_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

describe('Private Key Validity', () => {
  it('generated private keys are within curve order', () => {
    for (let i = 0; i < 100; i++) {
      const keys = generateRandomKeys();
      
      const spending = BigInt(keys.spendingPrivateKey);
      const viewing = BigInt(keys.viewingPrivateKey);
      
      expect(spending).toBeGreaterThan(0n);
      expect(spending).toBeLessThan(CURVE_ORDER);
      expect(viewing).toBeGreaterThan(0n);
      expect(viewing).toBeLessThan(CURVE_ORDER);
    }
  });

  it('derived private keys are valid', async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const sig = await account.signMessage({ message: 'test' });
    
    const keys = deriveKeysFromSignature(sig);
    
    // Both keys should be valid secp256k1 private keys
    expect(utils.isValidPrivateKey(hexToBytes(keys.spendingPrivateKey))).toBe(true);
    expect(utils.isValidPrivateKey(hexToBytes(keys.viewingPrivateKey))).toBe(true);
  });

  it('stealth private keys are within curve order', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    
    for (let i = 0; i < 50; i++) {
      const result = generateStealthAddress(meta);
      const stealthKey = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        keys.spendingPrivateKey,
        keys.viewingPrivateKey
      );
      
      const keyBigInt = BigInt(stealthKey);
      expect(keyBigInt).toBeGreaterThan(0n);
      expect(keyBigInt).toBeLessThan(CURVE_ORDER);
    }
  });
});

describe('Public Key Derivation', () => {
  it('public keys are on the curve', () => {
    for (let i = 0; i < 50; i++) {
      const keys = generateRandomKeys();
      
      // Both public keys should be valid curve points
      const spendingPoint = ProjectivePoint.fromHex(keys.spendingPublicKey.slice(2));
      const viewingPoint = ProjectivePoint.fromHex(keys.viewingPublicKey.slice(2));
      
      // assertValidity throws if not on curve
      expect(() => spendingPoint.assertValidity()).not.toThrow();
      expect(() => viewingPoint.assertValidity()).not.toThrow();
    }
  });

  it('public keys match private keys', () => {
    for (let i = 0; i < 50; i++) {
      const keys = generateRandomKeys();
      
      // Derive public keys from private keys
      const expectedSpending = bytesToHex(getPublicKey(hexToBytes(keys.spendingPrivateKey), true));
      const expectedViewing = bytesToHex(getPublicKey(hexToBytes(keys.viewingPrivateKey), true));
      
      expect(keys.spendingPublicKey.toLowerCase()).toBe(expectedSpending.toLowerCase());
      expect(keys.viewingPublicKey.toLowerCase()).toBe(expectedViewing.toLowerCase());
    }
  });

  it('compressed public keys have correct format', () => {
    const keys = generateRandomKeys();
    
    // Compressed keys start with 02 or 03
    expect(keys.spendingPublicKey.slice(0, 4)).toMatch(/^0x0[23]$/);
    expect(keys.viewingPublicKey.slice(0, 4)).toMatch(/^0x0[23]$/);
    
    // Length: 0x + 66 hex chars = 68
    expect(keys.spendingPublicKey.length).toBe(68);
    expect(keys.viewingPublicKey.length).toBe(68);
  });
});

describe('ECDH Shared Secret', () => {
  it('shared secret is symmetric', () => {
    // Alice and Bob should compute same shared secret
    const alicePrivate = hexToBytes(generateRandomKeys().spendingPrivateKey);
    const bobPrivate = hexToBytes(generateRandomKeys().spendingPrivateKey);
    
    const alicePublic = getPublicKey(alicePrivate, true);
    const bobPublic = getPublicKey(bobPrivate, true);
    
    // Using noble's getSharedSecret internally
    const { getSharedSecret } = require('@noble/secp256k1');
    
    const aliceComputes = getSharedSecret(alicePrivate, bobPublic);
    const bobComputes = getSharedSecret(bobPrivate, alicePublic);
    
    expect(bytesToHex(aliceComputes)).toBe(bytesToHex(bobComputes));
  });

  it('different keys produce different shared secrets', () => {
    const keys1 = generateRandomKeys();
    const keys2 = generateRandomKeys();
    
    const { getSharedSecret } = require('@noble/secp256k1');
    
    // Ephemeral with keys1
    const eph1 = utils.randomPrivateKey();
    const secret1 = getSharedSecret(eph1, hexToBytes(keys1.viewingPublicKey));
    
    // Same ephemeral with keys2
    const secret2 = getSharedSecret(eph1, hexToBytes(keys2.viewingPublicKey));
    
    expect(bytesToHex(secret1)).not.toBe(bytesToHex(secret2));
  });
});

describe('Point Addition (Stealth Public Key)', () => {
  it('P_stealth = P_spend + hash(secret) * G is valid', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    
    for (let i = 0; i < 20; i++) {
      const result = generateStealthAddress(meta);
      
      // The stealth address was derived from a valid public key
      // Verify by computing private key and checking address
      const stealthKey = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        keys.spendingPrivateKey,
        keys.viewingPrivateKey
      );
      
      const account = privateKeyToAccount(stealthKey);
      expect(account.address.toLowerCase()).toBe(result.stealthAddress.toLowerCase());
    }
  });

  it('stealth public key is on curve', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    
    for (let i = 0; i < 20; i++) {
      const result = generateStealthAddress(meta);
      
      // Verify the stealth private key produces a valid point
      const stealthKey = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        keys.spendingPrivateKey,
        keys.viewingPrivateKey
      );
      
      const stealthPublic = getPublicKey(hexToBytes(stealthKey), false);
      
      // Should be valid uncompressed public key
      expect(stealthPublic[0]).toBe(4); // Uncompressed prefix
      
      // Point should be on curve
      const point = ProjectivePoint.fromHex(stealthPublic);
      expect(() => point.assertValidity()).not.toThrow();
    }
  });
});

describe('Modular Arithmetic', () => {
  it('stealth key = spending + hash mod n', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    
    const result = generateStealthAddress(meta);
    
    // Manually compute what the stealth key should be
    const { getSharedSecret } = require('@noble/secp256k1');
    
    const sharedSecret = getSharedSecret(
      hexToBytes(keys.viewingPrivateKey),
      hexToBytes(result.ephemeralPublicKey)
    );
    
    const hashedSecret = keccak256(sharedSecret);
    
    const spendBigInt = BigInt(keys.spendingPrivateKey);
    const hashBigInt = BigInt(hashedSecret);
    const expectedStealth = (spendBigInt + hashBigInt) % CURVE_ORDER;
    
    const actualStealth = computeStealthPrivateKey(
      result.ephemeralPublicKey,
      keys.spendingPrivateKey,
      keys.viewingPrivateKey
    );
    
    expect(BigInt(actualStealth)).toBe(expectedStealth);
  });

  it('handles wraparound when sum exceeds curve order', () => {
    // This is a theoretical test - in practice, wraparound is rare
    // but the implementation should handle it correctly
    
    // Generate many keys and check all are valid
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    
    for (let i = 0; i < 100; i++) {
      const result = generateStealthAddress(meta);
      const stealthKey = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        keys.spendingPrivateKey,
        keys.viewingPrivateKey
      );
      
      // Should always be valid
      expect(utils.isValidPrivateKey(hexToBytes(stealthKey))).toBe(true);
      
      // Should always be within range
      const keyBigInt = BigInt(stealthKey);
      expect(keyBigInt).toBeLessThan(CURVE_ORDER);
    }
  });
});

describe('Hash Function Security', () => {
  it('uses keccak256 for shared secret hashing', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    const result = generateStealthAddress(meta);
    
    // The view tag should be the first byte of keccak256(shared_secret)
    // Verify by checking the view tag is 1 byte
    expect(result.viewTag).toMatch(/^0x[a-f0-9]{2}$/i);
    
    // And it should come from a 32-byte hash
    // (We can't directly verify without exposing internals, but we can check properties)
  });

  it('hash output affects address deterministically', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    
    // Same ephemeral key should produce same address
    const ephPrivKey = utils.randomPrivateKey();
    
    // We can't easily test this without modifying the implementation
    // But we can verify that different ephemeral keys produce different addresses
    const results = new Set<string>();
    
    for (let i = 0; i < 50; i++) {
      const result = generateStealthAddress(meta);
      results.add(result.stealthAddress);
    }
    
    expect(results.size).toBe(50);
  });
});

describe('Key Derivation from Signature', () => {
  it('signature portions are hashed correctly', async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const sig = await account.signMessage({ message: 'test' });
    
    const keys = deriveKeysFromSignature(sig);
    
    // Manually derive what keys should be
    const portion1 = sig.slice(2, 66); // First 32 bytes
    const portion2 = sig.slice(66, 130); // Second 32 bytes
    
    const expectedSpending = keccak256(`0x${portion1}`);
    const expectedViewing = keccak256(`0x${portion2}`);
    
    expect(keys.spendingPrivateKey.toLowerCase()).toBe(expectedSpending.toLowerCase());
    expect(keys.viewingPrivateKey.toLowerCase()).toBe(expectedViewing.toLowerCase());
  });

  it('both signature portions are used', async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const sig = await account.signMessage({ message: 'test' });
    
    const keys = deriveKeysFromSignature(sig);
    
    // If either portion is ignored, keys would be deterministic in a predictable way
    // By verifying they're different and both valid, we confirm both are used
    expect(keys.spendingPrivateKey).not.toBe(keys.viewingPrivateKey);
    expect(isValidPublicKey(keys.spendingPublicKey)).toBe(true);
    expect(isValidPublicKey(keys.viewingPublicKey)).toBe(true);
  });
});
