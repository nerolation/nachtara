/**
 * Tests for type definitions and constants.
 */

import { describe, it, expect } from 'vitest';
import {
  SCHEME_ID,
  SUPPORTED_NETWORKS,
  ERC5564_ANNOUNCER,
  ERC6538_REGISTRY,
  START_BLOCKS
} from '../src/lib/types.js';

describe('Contract Constants', () => {
  describe('ERC-5564 Announcer', () => {
    it('has correct singleton address', () => {
      expect(ERC5564_ANNOUNCER).toBe('0x55649E01B5Df198D18D95b5cc5051630cfD45564');
    });

    it('address is checksummed', () => {
      // Verify checksum by checking mixed case
      expect(ERC5564_ANNOUNCER).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('ERC-6538 Registry', () => {
    it('has correct singleton address', () => {
      expect(ERC6538_REGISTRY).toBe('0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538');
    });

    it('address is checksummed', () => {
      expect(ERC6538_REGISTRY).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('Scheme ID', () => {
    it('is 1 for SECP256k1', () => {
      expect(SCHEME_ID).toBe(1n);
    });

    it('is a bigint', () => {
      expect(typeof SCHEME_ID).toBe('bigint');
    });
  });
});

describe('Network Configuration', () => {
  describe('Mainnet', () => {
    it('has correct chain ID', () => {
      expect(SUPPORTED_NETWORKS['mainnet'].chainId).toBe(1);
    });

    it('has valid RPC URL', () => {
      expect(SUPPORTED_NETWORKS['mainnet'].rpcUrl).toMatch(/^https?:\/\//);
    });

    it('has block explorer', () => {
      expect(SUPPORTED_NETWORKS['mainnet'].blockExplorer).toContain('etherscan');
    });

    it('has start block', () => {
      expect(START_BLOCKS[1]).toBeGreaterThan(0n);
    });
  });

  describe('Sepolia', () => {
    it('has correct chain ID', () => {
      expect(SUPPORTED_NETWORKS['sepolia'].chainId).toBe(11155111);
    });

    it('has valid RPC URL', () => {
      expect(SUPPORTED_NETWORKS['sepolia'].rpcUrl).toMatch(/^https?:\/\//);
    });

    it('has start block', () => {
      expect(START_BLOCKS[11155111]).toBeGreaterThan(0n);
    });
  });

  describe('Holesky', () => {
    it('has correct chain ID', () => {
      expect(SUPPORTED_NETWORKS['holesky'].chainId).toBe(17000);
    });

    it('has start block', () => {
      expect(START_BLOCKS[17000]).toBeGreaterThan(0n);
    });
  });

  describe('L2 Networks', () => {
    const l2Networks = [
      { name: 'arbitrum', chainId: 42161 },
      { name: 'optimism', chainId: 10 },
      { name: 'base', chainId: 8453 },
      { name: 'polygon', chainId: 137 }
    ];

    for (const { name, chainId } of l2Networks) {
      it(`${name} has correct config`, () => {
        expect(SUPPORTED_NETWORKS[name]).toBeDefined();
        expect(SUPPORTED_NETWORKS[name].chainId).toBe(chainId);
        expect(SUPPORTED_NETWORKS[name].rpcUrl).toMatch(/^https?:\/\//);
      });
    }
  });

  describe('All Networks', () => {
    it('all have required properties', () => {
      for (const [name, network] of Object.entries(SUPPORTED_NETWORKS)) {
        expect(network.chainId).toBeTypeOf('number');
        expect(network.name).toBeTypeOf('string');
        expect(network.rpcUrl).toBeTypeOf('string');
        expect(network.name.length).toBeGreaterThan(0);
      }
    });

    it('all have unique chain IDs', () => {
      const chainIds = Object.values(SUPPORTED_NETWORKS).map(n => n.chainId);
      expect(new Set(chainIds).size).toBe(chainIds.length);
    });

    it('all RPC URLs are valid URLs', () => {
      for (const network of Object.values(SUPPORTED_NETWORKS)) {
        expect(() => new URL(network.rpcUrl)).not.toThrow();
      }
    });
  });
});

describe('Start Blocks', () => {
  it('all are positive', () => {
    for (const [chainId, block] of Object.entries(START_BLOCKS)) {
      expect(block).toBeGreaterThan(0n);
    }
  });

  it('mainnet start block is reasonable', () => {
    // Contract was deployed after merge, so should be > 15M
    expect(START_BLOCKS[1]).toBeGreaterThan(15000000n);
  });

  it('testnets have lower block numbers', () => {
    // Testnets typically have lower block numbers
    expect(START_BLOCKS[11155111]).toBeLessThan(START_BLOCKS[1]);
  });
});
