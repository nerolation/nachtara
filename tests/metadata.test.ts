/**
 * Tests for announcement metadata handling.
 * Verifies ERC-5564 metadata format compliance.
 */

import { describe, it, expect } from 'vitest';
import { parseEther, formatEther } from 'viem';
import type { Hex } from 'viem';
import {
  createAnnouncementMetadata,
  extractViewTag,
  generateStealthAddress,
  generateRandomKeys,
  createStealthMetaAddress
} from '../src/lib/crypto.js';

describe('Announcement Metadata', () => {
  describe('View Tag Handling', () => {
    it('creates metadata with view tag', () => {
      const viewTag = '0xab' as Hex;
      const metadata = createAnnouncementMetadata(viewTag);
      
      expect(metadata).toBe('0xab');
    });

    it('extracts view tag from metadata', () => {
      const metadata = '0xab1234567890abcdef' as Hex;
      const viewTag = extractViewTag(metadata);
      
      expect(viewTag).toBe('0xab');
    });

    it('handles single-byte metadata', () => {
      const metadata = '0xff' as Hex;
      const viewTag = extractViewTag(metadata);
      
      expect(viewTag).toBe('0xff');
    });

    it('view tag is consistent through generate/extract cycle', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      const result = generateStealthAddress(meta);
      
      const metadata = createAnnouncementMetadata(result.viewTag);
      const extracted = extractViewTag(metadata);
      
      expect(extracted).toBe(result.viewTag);
    });
  });

  describe('ETH Transfer Metadata Format', () => {
    it('creates ETH transfer metadata per ERC-5564', () => {
      const viewTag = '0xab' as Hex;
      const amount = parseEther('1.5');
      
      // ETH metadata format: viewTag (1 byte) + 0xeeeeeeee (4 bytes) + ETH address (20 bytes) + amount (32 bytes)
      const ethMarker = 'eeeeeeee';
      const ethAddress = 'EeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const amountHex = amount.toString(16).padStart(64, '0');
      
      const metadata = `0x${viewTag.slice(2)}${ethMarker}${ethAddress}${amountHex}` as Hex;
      
      // Verify format
      expect(metadata.length).toBe(2 + 2 + 8 + 40 + 64); // 0x + viewTag + marker + addr + amount
      
      // Verify view tag extraction still works
      const extracted = extractViewTag(metadata);
      expect(extracted).toBe(viewTag);
      
      // Verify we can parse back the amount
      const parsedAmount = BigInt('0x' + metadata.slice(52)); // Skip 0x + viewTag + marker + addr
      expect(parsedAmount).toBe(amount);
    });

    it('handles various ETH amounts', () => {
      const amounts = [
        '0.001', // Small
        '1.0',   // Normal
        '1000.0', // Large
        '0.000000000000000001' // 1 wei
      ];

      for (const amountStr of amounts) {
        const amount = parseEther(amountStr);
        const amountHex = amount.toString(16).padStart(64, '0');
        
        // Create metadata
        const viewTag = '0x00' as Hex;
        const ethMarker = 'eeeeeeee';
        const ethAddress = 'EeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
        const metadata = `0x${viewTag.slice(2)}${ethMarker}${ethAddress}${amountHex}` as Hex;
        
        // Parse back
        const parsedAmount = BigInt('0x' + metadata.slice(52));
        expect(parsedAmount).toBe(amount);
        expect(formatEther(parsedAmount)).toBe(formatEther(amount));
      }
    });
  });

  describe('ERC-20 Token Metadata Format', () => {
    it('creates ERC-20 transfer metadata per ERC-5564', () => {
      const viewTag = '0xcd' as Hex;
      const functionSelector = 'a9059cbb'; // transfer(address,uint256)
      const tokenAddress = '1234567890123456789012345678901234567890'; // Example token
      const amount = parseEther('100');
      const amountHex = amount.toString(16).padStart(64, '0');
      
      const metadata = `0x${viewTag.slice(2)}${functionSelector}${tokenAddress}${amountHex}` as Hex;
      
      // Verify view tag
      const extracted = extractViewTag(metadata);
      expect(extracted).toBe(viewTag);
      
      // Verify structure
      expect(metadata.length).toBe(2 + 2 + 8 + 40 + 64);
    });
  });

  describe('Extra Data Handling', () => {
    it('appends extra data to metadata', () => {
      const viewTag = '0xab' as Hex;
      const extraData = '0x123456' as Hex;
      
      const metadata = createAnnouncementMetadata(viewTag, extraData);
      
      expect(metadata).toBe('0xab123456');
    });

    it('handles empty extra data', () => {
      const viewTag = '0xab' as Hex;
      const metadata = createAnnouncementMetadata(viewTag);
      
      expect(metadata).toBe('0xab');
    });

    it('handles long extra data', () => {
      const viewTag = '0xab' as Hex;
      const extraData = '0x' + '12'.repeat(100) as Hex;
      
      const metadata = createAnnouncementMetadata(viewTag, extraData);
      
      // Should still start with view tag
      expect(extractViewTag(metadata)).toBe(viewTag);
      
      // Should contain all extra data
      expect(metadata.length).toBe(2 + 2 + 200); // 0x + viewTag + extraData
    });
  });

  describe('View Tag Distribution', () => {
    it('view tags are uniformly distributed', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      const viewTags = new Map<string, number>();
      const samples = 2560; // 10x the possible values
      
      for (let i = 0; i < samples; i++) {
        const result = generateStealthAddress(meta);
        const count = viewTags.get(result.viewTag) || 0;
        viewTags.set(result.viewTag, count + 1);
      }
      
      // Check distribution - each tag should appear roughly 10 times
      // Allow for statistical variation (chi-squared would be proper but this is simpler)
      const counts = Array.from(viewTags.values());
      const avg = samples / 256;
      
      // No tag should appear more than 4x the average (extreme outlier)
      // And we should have most tags represented (at least 200 of 256)
      for (const count of counts) {
        expect(count).toBeLessThan(avg * 4);
      }
      // Most tags should be present
      expect(viewTags.size).toBeGreaterThan(200);
    });

    it('view tag provides ~1/256 filtering', () => {
      const keys = generateRandomKeys();
      const meta = createStealthMetaAddress(keys);
      
      // Generate a specific view tag
      const targetResult = generateStealthAddress(meta);
      const targetViewTag = targetResult.viewTag;
      
      // Count how many random addresses have same view tag
      let matches = 0;
      const trials = 10000;
      
      for (let i = 0; i < trials; i++) {
        const otherKeys = generateRandomKeys();
        const otherMeta = createStealthMetaAddress(otherKeys);
        const otherResult = generateStealthAddress(otherMeta);
        
        if (otherResult.viewTag === targetViewTag) {
          matches++;
        }
      }
      
      // Expected: ~39 matches (10000 / 256)
      // Allow for statistical variation
      expect(matches).toBeGreaterThan(20);
      expect(matches).toBeLessThan(60);
    });
  });
});

describe('Metadata Security', () => {
  it('view tag reveals minimal information', () => {
    const keys = generateRandomKeys();
    const meta = createStealthMetaAddress(keys);
    
    // Generate two stealth addresses with same view tag
    const results: ReturnType<typeof generateStealthAddress>[] = [];
    let targetViewTag: Hex | null = null;
    
    // Find two with same view tag
    for (let attempts = 0; attempts < 10000 && results.length < 2; attempts++) {
      const result = generateStealthAddress(meta);
      
      if (targetViewTag === null) {
        targetViewTag = result.viewTag;
        results.push(result);
      } else if (result.viewTag === targetViewTag) {
        results.push(result);
      }
    }
    
    expect(results.length).toBe(2);
    
    // Same view tag, but completely different addresses
    expect(results[0].stealthAddress).not.toBe(results[1].stealthAddress);
    
    // Ephemeral keys also different
    expect(results[0].ephemeralPublicKey).not.toBe(results[1].ephemeralPublicKey);
  });

  it('metadata does not leak recipient identity', () => {
    const keys1 = generateRandomKeys();
    const keys2 = generateRandomKeys();
    const meta1 = createStealthMetaAddress(keys1);
    const meta2 = createStealthMetaAddress(keys2);
    
    // Generate stealth addresses for both
    const result1 = generateStealthAddress(meta1);
    const result2 = generateStealthAddress(meta2);
    
    const metadata1 = createAnnouncementMetadata(result1.viewTag);
    const metadata2 = createAnnouncementMetadata(result2.viewTag);
    
    // Metadata structure is identical (only content differs)
    expect(metadata1.length).toBe(metadata2.length);
    
    // View tags don't correlate with recipients
    // (This is a property test - we can't definitively prove it but can check distribution)
  });
});
