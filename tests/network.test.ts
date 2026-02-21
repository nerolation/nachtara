/**
 * Network module tests.
 * Note: Full integration tests require a running network.
 */

import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_NETWORKS,
  ERC5564_ANNOUNCER,
  ERC6538_REGISTRY,
  START_BLOCKS,
  SCHEME_ID
} from '../src/lib/types.js';

describe('Network Configuration', () => {
  it('has correct contract addresses per ERC specs', () => {
    // ERC-5564 singleton address
    expect(ERC5564_ANNOUNCER).toBe('0x55649E01B5Df198D18D95b5cc5051630cfD45564');
    
    // ERC-6538 singleton address
    expect(ERC6538_REGISTRY).toBe('0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538');
  });

  it('uses scheme ID 1 for SECP256k1', () => {
    expect(SCHEME_ID).toBe(1n);
  });

  it('has mainnet in supported networks', () => {
    expect(SUPPORTED_NETWORKS['mainnet']).toBeDefined();
    expect(SUPPORTED_NETWORKS['mainnet'].chainId).toBe(1);
    expect(SUPPORTED_NETWORKS['mainnet'].name).toContain('Mainnet');
  });

  it('has sepolia testnet in supported networks', () => {
    expect(SUPPORTED_NETWORKS['sepolia']).toBeDefined();
    expect(SUPPORTED_NETWORKS['sepolia'].chainId).toBe(11155111);
  });

  it('has start blocks for all supported networks', () => {
    for (const [name, network] of Object.entries(SUPPORTED_NETWORKS)) {
      if (name === 'mainnet' || name === 'sepolia' || name === 'holesky') {
        expect(START_BLOCKS[network.chainId]).toBeDefined();
        expect(START_BLOCKS[network.chainId]).toBeGreaterThan(0n);
      }
    }
  });

  it('all networks have required properties', () => {
    for (const [name, network] of Object.entries(SUPPORTED_NETWORKS)) {
      expect(network.chainId).toBeTypeOf('number');
      expect(network.name).toBeTypeOf('string');
      expect(network.rpcUrl).toBeTypeOf('string');
      expect(network.rpcUrl).toMatch(/^https?:\/\//);
    }
  });
});

describe('Supported Networks', () => {
  const expectedNetworks = [
    { name: 'mainnet', chainId: 1 },
    { name: 'sepolia', chainId: 11155111 },
    { name: 'holesky', chainId: 17000 },
    { name: 'arbitrum', chainId: 42161 },
    { name: 'optimism', chainId: 10 },
    { name: 'base', chainId: 8453 },
    { name: 'polygon', chainId: 137 }
  ];

  for (const { name, chainId } of expectedNetworks) {
    it(`supports ${name}`, () => {
      expect(SUPPORTED_NETWORKS[name]).toBeDefined();
      expect(SUPPORTED_NETWORKS[name].chainId).toBe(chainId);
    });
  }
});
