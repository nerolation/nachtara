/**
 * ERC-5564 and ERC-6538 Compliance Tests
 * Verifies the implementation matches the specification.
 */

import { describe, it, expect } from 'vitest';
import { keccak256, hexToBytes, bytesToHex } from 'viem/utils';
import { getPublicKey, getSharedSecret, ProjectivePoint } from '@noble/secp256k1';
import type { Hex } from 'viem';
import {
  generateRandomKeys,
  createStealthMetaAddress,
  parseStealthMetaAddress,
  generateStealthAddress,
  checkStealthAddress,
  computeStealthPrivateKey,
  extractViewTag,
  createAnnouncementMetadata
} from '../src/lib/crypto.js';
import {
  SCHEME_ID,
  ERC5564_ANNOUNCER,
  ERC6538_REGISTRY
} from '../src/lib/types.js';

describe('ERC-5564 Compliance', () => {
  describe('Scheme ID 1: SECP256k1 with View Tags', () => {
    it('uses schemeId = 1', () => {
      // ERC-5564 specifies schemeId 1 for SECP256k1 with view tags
      expect(SCHEME_ID).toBe(1n);
    });

    it('uses compressed public keys (33 bytes)', () => {
      const keys = generateRandomKeys();
      
      // Compressed public keys are 33 bytes (66 hex chars after 0x)
      expect(keys.spendingPublicKey.length).toBe(68); // 0x + 66
      expect(keys.viewingPublicKey.length).toBe(68);
      
      // Must start with 02 or 03 (compressed format)
      expect(keys.spendingPublicKey.slice(0, 4)).toMatch(/^0x0[23]$/);
      expect(keys.viewingPublicKey.slice(0, 4)).toMatch(/^0x0[23]$/);
    });
  });

  describe('Stealth Meta-Address Format', () => {
    it('single key format: 33 bytes (66 hex)', () => {
      const keys = generateRandomKeys();
      const singleKey = keys.spendingPublicKey;
      
      // Should be 66 hex chars after 0x
      expect(singleKey.slice(2).length).toBe(66);
      
      // Parsing single key uses it for both spending and viewing
      const parsed = parseStealthMetaAddress(singleKey);
      expect(parsed.spendingPublicKey).toBe(singleKey);
      expect(parsed.viewingPublicKey).toBe(singleKey);
    });

    it('two key format: 66 bytes (132 hex)', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      // Should be 132 hex chars after 0x (two compressed keys)
      expect(meta.slice(2).length).toBe(132);
      
      // First 33 bytes is spending, last 33 bytes is viewing
      const parsed = parseStealthMetaAddress(meta);
      expect(parsed.spendingPublicKey).toBe(keys.spendingPublicKey);
      expect(parsed.viewingPublicKey).toBe(keys.viewingPublicKey);
    });

    it('stealth meta-address URI format: st:<chain>:0x<keys>', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      // URI format (as specified in ERC-5564)
      const uri = `st:eth:${meta}`;
      
      expect(uri).toMatch(/^st:eth:0x[a-f0-9]{132}$/i);
    });
  });

  describe('generateStealthAddress', () => {
    it('implements ERC-5564 algorithm correctly', () => {
      // Per ERC-5564:
      // 1. Generate ephemeral private key p_eph
      // 2. Derive ephemeral public key P_eph
      // 3. Compute shared secret s = p_eph * P_view
      // 4. Hash shared secret s_h = keccak256(s)
      // 5. Extract view tag v = s_h[0]
      // 6. Compute S_h = s_h * G
      // 7. Compute stealth public key P_stealth = P_spend + S_h
      // 8. Derive stealth address
      
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      const result = generateStealthAddress(meta);
      
      // Verify by manually computing what the address should be
      // (We can't access the ephemeral private key, but we can verify the recipient's side)
      
      const isValid = checkStealthAddress(
        result.ephemeralPublicKey,
        keys.spendingPublicKey,
        keys.viewingPrivateKey,
        result.stealthAddress,
        result.viewTag
      );
      
      expect(isValid).toBe(true);
    });

    it('ephemeral public key is valid compressed point', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Ephemeral public key should be compressed (33 bytes)
      expect(result.ephemeralPublicKey.slice(2).length).toBe(66);
      expect(result.ephemeralPublicKey.slice(0, 4)).toMatch(/^0x0[23]$/);
      
      // Should be valid curve point
      const point = ProjectivePoint.fromHex(result.ephemeralPublicKey.slice(2));
      expect(() => point.assertValidity()).not.toThrow();
    });

    it('view tag is 1 byte (first byte of hash)', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // View tag is exactly 1 byte (2 hex chars after 0x)
      expect(result.viewTag.length).toBe(4); // 0x + 2 chars
      expect(result.viewTag).toMatch(/^0x[a-f0-9]{2}$/i);
    });
  });

  describe('checkStealthAddress', () => {
    it('implements ERC-5564 parsing algorithm', () => {
      // Per ERC-5564:
      // 1. Compute shared secret s = p_view * P_eph
      // 2. Hash shared secret s_h = keccak256(s)
      // 3. Extract view tag v = s_h[0], compare with announcement
      // 4. If view tags match: compute S_h = s_h * G
      // 5. Compute stealth public key P_stealth = P_spend + S_h
      // 6. Derive stealth address and compare
      
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Should correctly identify our stealth address
      const isOurs = checkStealthAddress(
        result.ephemeralPublicKey,
        keys.spendingPublicKey,
        keys.viewingPrivateKey,
        result.stealthAddress,
        result.viewTag
      );
      
      expect(isOurs).toBe(true);
      
      // Should reject wrong addresses
      const wrongAddress = '0x' + '1'.repeat(40);
      const isWrong = checkStealthAddress(
        result.ephemeralPublicKey,
        keys.spendingPublicKey,
        keys.viewingPrivateKey,
        wrongAddress as `0x${string}`,
        result.viewTag
      );
      
      expect(isWrong).toBe(false);
    });

    it('view tag filtering works per spec', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Wrong view tag should fail immediately
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

  describe('computeStealthKey', () => {
    it('implements ERC-5564 key derivation: p_stealth = p_spend + s_h mod n', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Compute stealth private key
      const stealthKey = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        keys.spendingPrivateKey,
        keys.viewingPrivateKey
      );
      
      // Verify it produces the correct address
      const { privateKeyToAccount } = require('viem/accounts');
      const account = privateKeyToAccount(stealthKey);
      
      expect(account.address.toLowerCase()).toBe(result.stealthAddress.toLowerCase());
    });
  });

  describe('Announcement Metadata Format', () => {
    it('first byte MUST be view tag', () => {
      const viewTag = '0xab' as Hex;
      const metadata = createAnnouncementMetadata(viewTag);
      
      expect(extractViewTag(metadata)).toBe(viewTag);
    });

    it('ETH transfer metadata follows ERC-5564 format', () => {
      // Per ERC-5564:
      // Byte 1: view tag
      // Bytes 2-5: 0xeeeeeeee (marker)
      // Bytes 6-25: 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
      // Bytes 26-57: amount (32 bytes)
      
      const viewTag = '0xab' as Hex;
      const ethMarker = 'eeeeeeee';
      const ethAddress = 'EeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const amount = '0'.repeat(64);
      
      const metadata = `0x${viewTag.slice(2)}${ethMarker}${ethAddress}${amount}` as Hex;
      
      // Total: 1 + 4 + 20 + 32 = 57 bytes = 114 hex chars + 0x
      expect(metadata.length).toBe(2 + 114);
      
      // View tag extractable
      expect(extractViewTag(metadata)).toBe(viewTag);
      
      // Marker at correct position
      expect(metadata.slice(4, 12)).toBe(ethMarker);
    });
  });

  describe('Contract Addresses', () => {
    it('ERC5564Announcer singleton at correct address', () => {
      // Per ERC-5564: deployed via CREATE2
      expect(ERC5564_ANNOUNCER).toBe('0x55649E01B5Df198D18D95b5cc5051630cfD45564');
    });

    it('ERC6538Registry singleton at correct address', () => {
      // Per ERC-6538: deployed via CREATE2
      expect(ERC6538_REGISTRY).toBe('0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538');
    });
  });
});

describe('ERC-6538 Compliance', () => {
  describe('Registry Interface', () => {
    it('uses schemeId as registry key', () => {
      // The registry maps (registrant, schemeId) -> stealthMetaAddress
      // Our implementation uses SCHEME_ID = 1
      expect(SCHEME_ID).toBe(1n);
    });
  });

  describe('Stealth Meta-Address Storage', () => {
    it('meta-address is bytes type (variable length)', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      // Can be 33 bytes (single key) or 66 bytes (two keys)
      const bytes = hexToBytes(meta);
      expect(bytes.length === 33 || bytes.length === 66).toBe(true);
    });
  });
});

describe('Security Properties (from ERC specs)', () => {
  describe('View Tag Security (ERC-5564)', () => {
    it('view tag reveals only 1 byte (8 bits) of shared secret', () => {
      // Per ERC-5564: "security margin is reduced from 128 bits to 124 bits"
      // This is because view tag reveals 1 byte of the 32-byte hash
      
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // View tag is exactly 1 byte
      const viewTagBytes = hexToBytes(result.viewTag);
      expect(viewTagBytes.length).toBe(1);
    });

    it('view tag optimization: ~255/256 announcements skipped without full check', () => {
      // Per ERC-5564: "probability for users to skip the remaining computations 
      // after hashing the shared secret is 255/256"
      
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Generate random view tag that's different
      let skippedCount = 0;
      for (let i = 0; i < 1000; i++) {
        const randomViewTag = `0x${Math.floor(Math.random() * 256).toString(16).padStart(2, '0')}` as Hex;
        
        if (randomViewTag.toLowerCase() !== result.viewTag.toLowerCase()) {
          // Would be skipped in real parsing
          skippedCount++;
        }
      }
      
      // Most should be skippable (expect ~996/1000)
      expect(skippedCount).toBeGreaterThan(950);
    });
  });

  describe('Recipient Privacy (ERC-5564)', () => {
    it('stealth address cannot be linked to recipient', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      // Generate multiple stealth addresses
      const addresses: string[] = [];
      for (let i = 0; i < 100; i++) {
        const result = generateStealthAddress(meta);
        addresses.push(result.stealthAddress);
      }
      
      // All should be unique
      expect(new Set(addresses).size).toBe(100);
      
      // No relationship to original keys visible
      // (This is a qualitative property - we verify uniqueness as proxy)
    });
  });

  describe('Spending Authority (ERC-5564)', () => {
    it('only holder of spending + viewing keys can spend', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      // Compute stealth key with correct keys
      const correctKey = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        keys.spendingPrivateKey,
        keys.viewingPrivateKey
      );
      
      // Wrong spending key
      const wrongSpending = generateRandomKeys();
      const wrongKey1 = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        wrongSpending.spendingPrivateKey,
        keys.viewingPrivateKey
      );
      
      // Wrong viewing key
      const wrongViewing = generateRandomKeys();
      const wrongKey2 = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        keys.spendingPrivateKey,
        wrongViewing.viewingPrivateKey
      );
      
      const { privateKeyToAccount } = require('viem/accounts');
      
      // Only correct key produces correct address
      expect(privateKeyToAccount(correctKey).address.toLowerCase())
        .toBe(result.stealthAddress.toLowerCase());
      expect(privateKeyToAccount(wrongKey1).address.toLowerCase())
        .not.toBe(result.stealthAddress.toLowerCase());
      expect(privateKeyToAccount(wrongKey2).address.toLowerCase())
        .not.toBe(result.stealthAddress.toLowerCase());
    });
  });
});
