/**
 * Tests for wallet storage functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateRandomKeys } from '../src/lib/crypto.js';

// Override wallet directory for tests
const TEST_DIR = join(tmpdir(), `stealth-wallet-test-${Date.now()}`);

// Mock the storage module to use test directory
const ORIGINAL_HOMEDIR = process.env.HOME;

describe('Wallet Storage', () => {
  beforeEach(async () => {
    // Create test directory
    await mkdir(TEST_DIR, { recursive: true });
    process.env.HOME = TEST_DIR;
  });

  afterEach(async () => {
    // Cleanup
    process.env.HOME = ORIGINAL_HOMEDIR;
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Note: Full storage tests would require dynamic imports to use the mocked HOME
  // For now, we test the crypto parts that don't depend on the file system

  it('encryption round-trip works', async () => {
    const { encryptData, decryptData } = await import('../src/lib/crypto.js');
    
    const keys = generateRandomKeys();
    const keysJson = JSON.stringify(keys);
    const password = 'strongPassword123!';
    
    const { encrypted, salt, iv } = await encryptData(keysJson, password);
    const decrypted = await decryptData(encrypted, password, salt, iv);
    
    expect(JSON.parse(decrypted)).toEqual(keys);
  });

  it('wrong password throws', async () => {
    const { encryptData, decryptData } = await import('../src/lib/crypto.js');
    
    const data = 'secret';
    const { encrypted, salt, iv } = await encryptData(data, 'correct');
    
    await expect(
      decryptData(encrypted, 'wrong', salt, iv)
    ).rejects.toThrow();
  });
});
