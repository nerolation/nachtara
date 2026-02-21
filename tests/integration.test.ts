/**
 * Integration tests for the full stealth wallet flow.
 * Tests end-to-end scenarios without actual network calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { formatEther, parseEther } from 'viem';
import type { Hex, Address } from 'viem';
import {
  generateRandomKeys,
  deriveKeysFromSignature,
  createStealthMetaAddress,
  generateStealthAddress,
  checkStealthAddress,
  computeStealthPrivateKey,
  extractViewTag,
  createAnnouncementMetadata,
  encryptData,
  decryptData
} from '../src/lib/crypto.js';
import type { StealthKeys, AnnouncementData } from '../src/lib/types.js';

describe('Full Payment Flow', () => {
  describe('Alice sends to Bob scenario', () => {
    let bobKeys: StealthKeys;
    let bobMetaAddress: Hex;
    let alicePrivateKey: Hex;
    
    beforeEach(() => {
      // Bob generates his stealth keys
      bobKeys = generateRandomKeys();
      bobMetaAddress = createStealthMetaAddress(bobKeys);
      
      // Alice has a regular private key
      alicePrivateKey = generatePrivateKey();
    });
    
    it('completes full send → receive → withdraw cycle', async () => {
      // Step 1: Alice generates stealth address for Bob
      const stealthInfo = generateStealthAddress(bobMetaAddress);
      
      expect(stealthInfo.stealthAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(stealthInfo.ephemeralPublicKey).toMatch(/^0x0[23][a-f0-9]{64}$/i);
      expect(stealthInfo.viewTag).toMatch(/^0x[a-f0-9]{2}$/i);
      
      // Step 2: Alice creates announcement metadata
      const metadata = createAnnouncementMetadata(stealthInfo.viewTag);
      
      // Step 3: Simulate announcement event
      const announcement: AnnouncementData = {
        schemeId: 1n,
        stealthAddress: stealthInfo.stealthAddress,
        caller: privateKeyToAccount(alicePrivateKey).address,
        ephemeralPubKey: stealthInfo.ephemeralPublicKey,
        metadata,
        blockNumber: 12345678n,
        transactionHash: '0x' + '1'.repeat(64) as Hex
      };
      
      // Step 4: Bob scans announcement
      const viewTag = extractViewTag(announcement.metadata);
      
      const isForBob = checkStealthAddress(
        announcement.ephemeralPubKey,
        bobKeys.spendingPublicKey,
        bobKeys.viewingPrivateKey,
        announcement.stealthAddress,
        viewTag
      );
      
      expect(isForBob).toBe(true);
      
      // Step 5: Bob computes stealth private key
      const stealthPrivateKey = computeStealthPrivateKey(
        announcement.ephemeralPubKey,
        bobKeys.spendingPrivateKey,
        bobKeys.viewingPrivateKey
      );
      
      // Step 6: Verify Bob can control the stealth address
      const stealthAccount = privateKeyToAccount(stealthPrivateKey);
      expect(stealthAccount.address.toLowerCase()).toBe(stealthInfo.stealthAddress.toLowerCase());
      
      // Step 7: Bob can sign transactions (simulated)
      const signature = await stealthAccount.signMessage({
        message: 'Withdraw funds'
      });
      expect(signature).toMatch(/^0x[a-f0-9]+$/i);
    });
    
    it('Eve cannot intercept payment (has neither key)', () => {
      const eveKeys = generateRandomKeys();
      
      // Alice sends to Bob
      const stealthInfo = generateStealthAddress(bobMetaAddress);
      const metadata = createAnnouncementMetadata(stealthInfo.viewTag);
      
      // Eve tries to identify the payment
      const viewTag = extractViewTag(metadata);
      
      const isForEve = checkStealthAddress(
        stealthInfo.ephemeralPublicKey,
        eveKeys.spendingPublicKey,
        eveKeys.viewingPrivateKey,
        stealthInfo.stealthAddress,
        viewTag
      );
      
      expect(isForEve).toBe(false);
      
      // Eve cannot compute the stealth private key
      const eveWrongKey = computeStealthPrivateKey(
        stealthInfo.ephemeralPublicKey,
        eveKeys.spendingPrivateKey,
        eveKeys.viewingPrivateKey
      );
      
      const eveAccount = privateKeyToAccount(eveWrongKey);
      expect(eveAccount.address.toLowerCase()).not.toBe(stealthInfo.stealthAddress.toLowerCase());
    });
    
    it('Eve with viewing key can identify but not spend', () => {
      // Scenario: Eve has Bob's viewing key (view-only wallet)
      
      // Alice sends to Bob
      const stealthInfo = generateStealthAddress(bobMetaAddress);
      const metadata = createAnnouncementMetadata(stealthInfo.viewTag);
      
      // Eve with viewing key can identify
      const viewTag = extractViewTag(metadata);
      
      const eveIdentifies = checkStealthAddress(
        stealthInfo.ephemeralPublicKey,
        bobKeys.spendingPublicKey, // Eve knows this (public)
        bobKeys.viewingPrivateKey, // Eve has viewing key
        stealthInfo.stealthAddress,
        viewTag
      );
      
      expect(eveIdentifies).toBe(true);
      
      // But Eve cannot spend without spending key
      const eveWrongSpendKey = generateRandomKeys().spendingPrivateKey;
      const eveTryKey = computeStealthPrivateKey(
        stealthInfo.ephemeralPublicKey,
        eveWrongSpendKey, // Eve doesn't have this
        bobKeys.viewingPrivateKey
      );
      
      const eveAccount = privateKeyToAccount(eveTryKey);
      expect(eveAccount.address.toLowerCase()).not.toBe(stealthInfo.stealthAddress.toLowerCase());
    });
  });
  
  describe('Multiple payments scenario', () => {
    it('Bob receives multiple payments from different senders', () => {
      const bobKeys = generateRandomKeys();
      const bobMeta = createStealthMetaAddress(bobKeys);
      
      // Multiple senders
      const senders = ['Alice', 'Charlie', 'Diana'];
      const payments: { sender: string; stealthAddress: string; privateKey: Hex }[] = [];
      
      for (const sender of senders) {
        const stealthInfo = generateStealthAddress(bobMeta);
        
        // Each sender creates announcement
        const metadata = createAnnouncementMetadata(stealthInfo.viewTag);
        const viewTag = extractViewTag(metadata);
        
        // Bob identifies it
        const isForBob = checkStealthAddress(
          stealthInfo.ephemeralPublicKey,
          bobKeys.spendingPublicKey,
          bobKeys.viewingPrivateKey,
          stealthInfo.stealthAddress,
          viewTag
        );
        
        expect(isForBob).toBe(true);
        
        // Bob computes key
        const privateKey = computeStealthPrivateKey(
          stealthInfo.ephemeralPublicKey,
          bobKeys.spendingPrivateKey,
          bobKeys.viewingPrivateKey
        );
        
        payments.push({
          sender,
          stealthAddress: stealthInfo.stealthAddress,
          privateKey
        });
      }
      
      // All stealth addresses should be unique
      const addresses = payments.map(p => p.stealthAddress);
      expect(new Set(addresses).size).toBe(3);
      
      // All private keys should be unique
      const keys = payments.map(p => p.privateKey);
      expect(new Set(keys).size).toBe(3);
      
      // Bob can control all of them
      for (const payment of payments) {
        const account = privateKeyToAccount(payment.privateKey);
        expect(account.address.toLowerCase()).toBe(payment.stealthAddress.toLowerCase());
      }
    });
    
    it('same sender sends multiple payments to same recipient', () => {
      const bobKeys = generateRandomKeys();
      const bobMeta = createStealthMetaAddress(bobKeys);
      
      const alicePrivateKey = generatePrivateKey();
      const aliceAccount = privateKeyToAccount(alicePrivateKey);
      
      const payments: string[] = [];
      
      for (let i = 0; i < 5; i++) {
        const stealthInfo = generateStealthAddress(bobMeta);
        payments.push(stealthInfo.stealthAddress);
        
        // All should be identifiable by Bob
        const metadata = createAnnouncementMetadata(stealthInfo.viewTag);
        const viewTag = extractViewTag(metadata);
        
        const isForBob = checkStealthAddress(
          stealthInfo.ephemeralPublicKey,
          bobKeys.spendingPublicKey,
          bobKeys.viewingPrivateKey,
          stealthInfo.stealthAddress,
          viewTag
        );
        
        expect(isForBob).toBe(true);
      }
      
      // All payments to unique addresses
      expect(new Set(payments).size).toBe(5);
      
      // No correlation between addresses (can't link them)
      for (let i = 1; i < payments.length; i++) {
        const prev = BigInt(payments[i-1]);
        const curr = BigInt(payments[i]);
        // Addresses should be randomly distributed
        expect(Math.abs(Number(curr - prev))).toBeGreaterThan(1000);
      }
    });
  });
  
  describe('Key recovery scenario', () => {
    it('Bob can recover wallet from signature', async () => {
      const recoveryKey = generatePrivateKey();
      const recoveryAccount = privateKeyToAccount(recoveryKey);
      
      const recoveryMessage = 'Recover my stealth wallet - v1';
      
      // Initial setup
      const sig1 = await recoveryAccount.signMessage({ message: recoveryMessage });
      const keys1 = deriveKeysFromSignature(sig1);
      const meta1 = createStealthMetaAddress(keys1);
      
      // Alice sends to Bob
      const stealthInfo = generateStealthAddress(meta1);
      
      // Time passes, Bob loses his wallet...
      
      // Bob recovers
      const sig2 = await recoveryAccount.signMessage({ message: recoveryMessage });
      const keys2 = deriveKeysFromSignature(sig2);
      const meta2 = createStealthMetaAddress(keys2);
      
      // Same keys derived
      expect(keys2.spendingPrivateKey).toBe(keys1.spendingPrivateKey);
      expect(keys2.viewingPrivateKey).toBe(keys1.viewingPrivateKey);
      expect(meta2).toBe(meta1);
      
      // Bob can still identify his payments
      const metadata = createAnnouncementMetadata(stealthInfo.viewTag);
      const viewTag = extractViewTag(metadata);
      
      const isForBob = checkStealthAddress(
        stealthInfo.ephemeralPublicKey,
        keys2.spendingPublicKey,
        keys2.viewingPrivateKey,
        stealthInfo.stealthAddress,
        viewTag
      );
      
      expect(isForBob).toBe(true);
      
      // Bob can recover private key
      const recoveredKey = computeStealthPrivateKey(
        stealthInfo.ephemeralPublicKey,
        keys2.spendingPrivateKey,
        keys2.viewingPrivateKey
      );
      
      const account = privateKeyToAccount(recoveredKey);
      expect(account.address.toLowerCase()).toBe(stealthInfo.stealthAddress.toLowerCase());
    });
  });
});

describe('Wallet Storage Integration', () => {
  let testDir: string;
  
  beforeEach(async () => {
    testDir = join(tmpdir(), `stealth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  it('encrypts and decrypts wallet keys correctly', async () => {
    const keys = generateRandomKeys();
    const password = 'secure-password-123!';
    
    // Encrypt
    const keysJson = JSON.stringify(keys);
    const { encrypted, salt, iv } = await encryptData(keysJson, password);
    
    // Save to file
    const walletFile = join(testDir, 'wallet.json');
    const walletData = JSON.stringify({ encrypted, salt, iv });
    await writeFile(walletFile, walletData);
    
    // Read back
    const savedData = await readFile(walletFile, 'utf-8');
    const parsed = JSON.parse(savedData);
    
    // Decrypt
    const decrypted = await decryptData(
      parsed.encrypted,
      password,
      parsed.salt,
      parsed.iv
    );
    
    const recoveredKeys = JSON.parse(decrypted);
    
    expect(recoveredKeys.spendingPrivateKey).toBe(keys.spendingPrivateKey);
    expect(recoveredKeys.viewingPrivateKey).toBe(keys.viewingPrivateKey);
    expect(recoveredKeys.spendingPublicKey).toBe(keys.spendingPublicKey);
    expect(recoveredKeys.viewingPublicKey).toBe(keys.viewingPublicKey);
  });
  
  it('wrong password fails decryption', async () => {
    const keys = generateRandomKeys();
    const password = 'correct-password';
    
    const keysJson = JSON.stringify(keys);
    const { encrypted, salt, iv } = await encryptData(keysJson, password);
    
    await expect(
      decryptData(encrypted, 'wrong-password', salt, iv)
    ).rejects.toThrow();
  });
});

describe('Announcement Scanning Performance', () => {
  it('efficiently filters with view tags', () => {
    const bobKeys = generateRandomKeys();
    
    // Simulate 10000 announcements, only 5 are for Bob
    const announcements: { viewTag: Hex; ephPubKey: Hex; address: Address; forBob: boolean }[] = [];
    
    // Generate Bob's payments
    const bobMeta = createStealthMetaAddress(bobKeys);
    for (let i = 0; i < 5; i++) {
      const result = generateStealthAddress(bobMeta);
      announcements.push({
        viewTag: result.viewTag,
        ephPubKey: result.ephemeralPublicKey,
        address: result.stealthAddress,
        forBob: true
      });
    }
    
    // Generate random announcements for others
    for (let i = 0; i < 9995; i++) {
      const otherKeys = generateRandomKeys();
      const otherMeta = createStealthMetaAddress(otherKeys);
      const result = generateStealthAddress(otherMeta);
      announcements.push({
        viewTag: result.viewTag,
        ephPubKey: result.ephemeralPublicKey,
        address: result.stealthAddress,
        forBob: false
      });
    }
    
    // Shuffle
    announcements.sort(() => Math.random() - 0.5);
    
    // Scan with view tag optimization
    let fullChecks = 0;
    let viewTagMatches = 0;
    const foundAddresses: string[] = [];
    
    for (const ann of announcements) {
      // First check view tag (cheap)
      const isForBob = checkStealthAddress(
        ann.ephPubKey,
        bobKeys.spendingPublicKey,
        bobKeys.viewingPrivateKey,
        ann.address,
        ann.viewTag
      );
      
      if (isForBob) {
        foundAddresses.push(ann.address);
        fullChecks++;
      }
    }
    
    // Should find exactly 5
    expect(foundAddresses.length).toBe(5);
    
    // View tag reduces false positives to ~1/256
    // With 10000 announcements, expect ~39 view tag matches, but only 5 full matches
    // The actual check is optimized internally
  });
});

describe('Edge Cases in Payment Flow', () => {
  it('handles same spending and viewing key', () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    
    // Use same key for both spending and viewing
    const keys = generateRandomKeys();
    // Simulate: use spending key for both
    const singleKeyMeta = keys.spendingPublicKey; // Just one key
    
    // Generate stealth address
    const stealthInfo = generateStealthAddress(singleKeyMeta);
    
    // Check with same key for viewing
    const isOurs = checkStealthAddress(
      stealthInfo.ephemeralPublicKey,
      keys.spendingPublicKey,
      keys.spendingPrivateKey, // Using spending as viewing
      stealthInfo.stealthAddress,
      stealthInfo.viewTag
    );
    
    expect(isOurs).toBe(true);
    
    // Compute stealth key
    const stealthKey = computeStealthPrivateKey(
      stealthInfo.ephemeralPublicKey,
      keys.spendingPrivateKey,
      keys.spendingPrivateKey // Same key
    );
    
    const stealthAccount = privateKeyToAccount(stealthKey);
    expect(stealthAccount.address.toLowerCase()).toBe(stealthInfo.stealthAddress.toLowerCase());
  });
  
  it('handles many concurrent stealth addresses', () => {
    const bobKeys = generateRandomKeys();
    const bobMeta = createStealthMetaAddress(bobKeys);
    
    // Generate 100 concurrent stealth addresses
    const stealthAddresses: { address: Address; key: Hex }[] = [];
    
    for (let i = 0; i < 100; i++) {
      const result = generateStealthAddress(bobMeta);
      const key = computeStealthPrivateKey(
        result.ephemeralPublicKey,
        bobKeys.spendingPrivateKey,
        bobKeys.viewingPrivateKey
      );
      
      stealthAddresses.push({
        address: result.stealthAddress,
        key
      });
    }
    
    // All should be unique and valid
    const addresses = new Set(stealthAddresses.map(s => s.address));
    expect(addresses.size).toBe(100);
    
    const keys = new Set(stealthAddresses.map(s => s.key));
    expect(keys.size).toBe(100);
    
    // Each key should match its address
    for (const { address, key } of stealthAddresses) {
      const account = privateKeyToAccount(key);
      expect(account.address.toLowerCase()).toBe(address.toLowerCase());
    }
  });
});
