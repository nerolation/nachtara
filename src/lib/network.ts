/**
 * Network and RPC handling.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
  type Address,
  type Hex,
  parseEther,
  formatEther
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  mainnet,
  sepolia,
  holesky,
  arbitrum,
  optimism,
  base,
  polygon
} from 'viem/chains';
import {
  SUPPORTED_NETWORKS,
  ERC5564_ANNOUNCER,
  ERC6538_REGISTRY,
  STEALTH_FORWARDER,
  START_BLOCKS,
  SCHEME_ID,
  type NetworkConfig,
  type AnnouncementData
} from './types.js';
import { loadConfig, saveConfig, getLastScanBlock, updateLastScanBlock } from './storage.js';

// ABI for ERC-5564 Announcer
const ANNOUNCER_ABI = [
  {
    type: 'function',
    name: 'announce',
    inputs: [
      { name: 'schemeId', type: 'uint256' },
      { name: 'stealthAddress', type: 'address' },
      { name: 'ephemeralPubKey', type: 'bytes' },
      { name: 'metadata', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'event',
    name: 'Announcement',
    inputs: [
      { name: 'schemeId', type: 'uint256', indexed: true },
      { name: 'stealthAddress', type: 'address', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'ephemeralPubKey', type: 'bytes', indexed: false },
      { name: 'metadata', type: 'bytes', indexed: false }
    ]
  }
] as const;

// ABI for ERC-6538 Registry
const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'registerKeys',
    inputs: [
      { name: 'schemeId', type: 'uint256' },
      { name: 'stealthMetaAddress', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'stealthMetaAddressOf',
    inputs: [
      { name: 'registrant', type: 'address' },
      { name: 'schemeId', type: 'uint256' }
    ],
    outputs: [{ type: 'bytes' }],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'StealthMetaAddressSet',
    inputs: [
      { name: 'registrant', type: 'address', indexed: true },
      { name: 'schemeId', type: 'uint256', indexed: true },
      { name: 'stealthMetaAddress', type: 'bytes', indexed: false }
    ]
  }
] as const;

// ABI for StealthForwarder (atomic send + announce)
const FORWARDER_ABI = [
  {
    type: 'function',
    name: 'forward',
    inputs: [
      { name: 'stealthAddress', type: 'address' },
      { name: 'ephemeralPubKey', type: 'bytes' },
      { name: 'viewTag', type: 'bytes1' }
    ],
    outputs: [],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'forwardWithMetadata',
    inputs: [
      { name: 'stealthAddress', type: 'address' },
      { name: 'ephemeralPubKey', type: 'bytes' },
      { name: 'metadata', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'payable'
  },
  {
    type: 'event',
    name: 'StealthPayment',
    inputs: [
      { name: 'stealthAddress', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false }
    ]
  }
] as const;

const CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  17000: holesky,
  42161: arbitrum,
  10: optimism,
  8453: base,
  137: polygon
};

/**
 * Get current network configuration.
 */
export async function getCurrentNetwork(): Promise<NetworkConfig> {
  const config = await loadConfig();
  
  // Check for custom RPC first
  if (config.customRpcUrl) {
    const network = SUPPORTED_NETWORKS[config.activeNetwork] || SUPPORTED_NETWORKS['mainnet'];
    return {
      ...network,
      rpcUrl: config.customRpcUrl
    };
  }

  return SUPPORTED_NETWORKS[config.activeNetwork] || SUPPORTED_NETWORKS['mainnet'];
}

/**
 * Set active network.
 */
export async function setNetwork(networkName: string): Promise<NetworkConfig> {
  const network = SUPPORTED_NETWORKS[networkName];
  if (!network) {
    throw new Error(`Unknown network: ${networkName}. Available: ${Object.keys(SUPPORTED_NETWORKS).join(', ')}`);
  }

  const config = await loadConfig();
  config.activeNetwork = networkName;
  await saveConfig(config);
  
  return network;
}

/**
 * Set custom RPC URL.
 */
export async function setCustomRpc(rpcUrl: string): Promise<void> {
  const config = await loadConfig();
  config.customRpcUrl = rpcUrl;
  await saveConfig(config);
}

/**
 * Clear custom RPC URL.
 */
export async function clearCustomRpc(): Promise<void> {
  const config = await loadConfig();
  delete config.customRpcUrl;
  await saveConfig(config);
}

/**
 * Create a public client for the current network.
 */
export async function createPublicClientForNetwork(): Promise<PublicClient> {
  const network = await getCurrentNetwork();
  const chain = CHAINS[network.chainId];
  
  if (!chain) {
    // Custom chain
    return createPublicClient({
      transport: http(network.rpcUrl),
      chain: {
        id: network.chainId,
        name: network.name,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [network.rpcUrl] } }
      } as Chain
    });
  }

  return createPublicClient({
    chain,
    transport: http(network.rpcUrl)
  });
}

/**
 * Create a wallet client for signing transactions.
 */
export async function createWalletClientForNetwork(
  privateKey: Hex
): Promise<WalletClient<Transport, Chain, Account>> {
  const network = await getCurrentNetwork();
  const chain = CHAINS[network.chainId] || ({
    id: network.chainId,
    name: network.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [network.rpcUrl] } }
  } as Chain);

  const account = privateKeyToAccount(privateKey);

  return createWalletClient({
    account,
    chain,
    transport: http(network.rpcUrl)
  });
}

/**
 * Get the stealth meta-address registered for an address.
 */
export async function getRegisteredMetaAddress(
  registrant: Address
): Promise<Hex | null> {
  const client = await createPublicClientForNetwork();

  const result = await client.readContract({
    address: ERC6538_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'stealthMetaAddressOf',
    args: [registrant, SCHEME_ID]
  });

  if (!result || result === '0x' || result.length <= 2) {
    return null;
  }

  return result as Hex;
}

/**
 * Register a stealth meta-address on-chain.
 */
export async function registerMetaAddress(
  stealthMetaAddress: Hex,
  privateKey: Hex
): Promise<Hex> {
  const walletClient = await createWalletClientForNetwork(privateKey);
  const publicClient = await createPublicClientForNetwork();

  // Simulate first
  const { request } = await publicClient.simulateContract({
    address: ERC6538_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'registerKeys',
    args: [SCHEME_ID, stealthMetaAddress],
    account: walletClient.account
  });

  // Execute
  const hash = await walletClient.writeContract(request);
  
  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

/**
 * Send ETH to a stealth address and announce.
 * Uses StealthForwarder for atomic single-tx when available,
 * falls back to two-tx approach otherwise.
 */
export async function sendToStealthAddress(params: {
  stealthAddress: Address;
  ephemeralPublicKey: Hex;
  viewTag: Hex;
  amount: string; // in ETH
  privateKey: Hex;
}): Promise<{ txHash: Hex; usedForwarder: boolean }> {
  const { stealthAddress, ephemeralPublicKey, viewTag, amount, privateKey } = params;
  const walletClient = await createWalletClientForNetwork(privateKey);
  const publicClient = await createPublicClientForNetwork();
  const network = await getCurrentNetwork();

  const amountWei = parseEther(amount);
  const forwarderAddress = STEALTH_FORWARDER[network.chainId];

  // Use forwarder if available (single atomic transaction)
  if (forwarderAddress) {
    const { request } = await publicClient.simulateContract({
      address: forwarderAddress,
      abi: FORWARDER_ABI,
      functionName: 'forward',
      args: [stealthAddress, ephemeralPublicKey, viewTag as `0x${string}`],
      value: amountWei,
      account: walletClient.account
    });

    const txHash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return { txHash, usedForwarder: true };
  }

  // Fallback: two separate transactions
  // 1. Send ETH to stealth address
  const sendTxHash = await walletClient.sendTransaction({
    to: stealthAddress,
    value: amountWei
  });

  await publicClient.waitForTransactionReceipt({ hash: sendTxHash });

  // 2. Announce the transfer
  const metadata = viewTag as Hex;

  const { request } = await publicClient.simulateContract({
    address: ERC5564_ANNOUNCER,
    abi: ANNOUNCER_ABI,
    functionName: 'announce',
    args: [SCHEME_ID, stealthAddress, ephemeralPublicKey, metadata],
    account: walletClient.account
  });

  const announceTxHash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash: announceTxHash });

  // Return the announce tx hash (last tx) for compatibility
  return { txHash: announceTxHash, usedForwarder: false };
}

/**
 * Fetch announcements from the chain.
 */
export async function fetchAnnouncements(params?: {
  fromBlock?: bigint;
  toBlock?: bigint | 'latest';
}): Promise<AnnouncementData[]> {
  const client = await createPublicClientForNetwork();
  const network = await getCurrentNetwork();

  // Determine start block
  let fromBlock = params?.fromBlock;
  if (!fromBlock) {
    // Try to get last scanned block
    const lastScanned = await getLastScanBlock(network.chainId);
    if (lastScanned) {
      fromBlock = lastScanned + 1n;
    } else {
      // Use contract deployment block
      fromBlock = START_BLOCKS[network.chainId] || 0n;
    }
  }

  const toBlock = params?.toBlock || 'latest';

  // Fetch logs in chunks to avoid RPC limits
  const CHUNK_SIZE = 10000n;
  const currentBlock = await client.getBlockNumber();
  const endBlock = toBlock === 'latest' ? currentBlock : toBlock;

  const announcements: AnnouncementData[] = [];

  for (let start = fromBlock; start <= endBlock; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > endBlock ? endBlock : start + CHUNK_SIZE - 1n;

    const logs = await client.getLogs({
      address: ERC5564_ANNOUNCER,
      event: {
        type: 'event',
        name: 'Announcement',
        inputs: [
          { name: 'schemeId', type: 'uint256', indexed: true },
          { name: 'stealthAddress', type: 'address', indexed: true },
          { name: 'caller', type: 'address', indexed: true },
          { name: 'ephemeralPubKey', type: 'bytes', indexed: false },
          { name: 'metadata', type: 'bytes', indexed: false }
        ]
      },
      args: {
        schemeId: SCHEME_ID
      },
      fromBlock: start,
      toBlock: end
    });

    for (const log of logs) {
      announcements.push({
        schemeId: log.args.schemeId!,
        stealthAddress: log.args.stealthAddress!,
        caller: log.args.caller!,
        ephemeralPubKey: log.args.ephemeralPubKey!,
        metadata: log.args.metadata!,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash
      });
    }
  }

  // Update last scanned block
  if (endBlock > fromBlock) {
    await updateLastScanBlock(network.chainId, endBlock);
  }

  return announcements;
}

/**
 * Get balance of an address.
 */
export async function getBalance(address: Address): Promise<bigint> {
  const client = await createPublicClientForNetwork();
  return client.getBalance({ address });
}

/**
 * Send ETH from a stealth address (withdraw).
 */
export async function withdrawFromStealthAddress(params: {
  stealthPrivateKey: Hex;
  toAddress: Address;
  amount?: string; // If not provided, sends all minus gas
}): Promise<Hex> {
  const { stealthPrivateKey, toAddress, amount } = params;
  const walletClient = await createWalletClientForNetwork(stealthPrivateKey);
  const publicClient = await createPublicClientForNetwork();

  const stealthAccount = privateKeyToAccount(stealthPrivateKey);
  const balance = await publicClient.getBalance({ address: stealthAccount.address });

  let amountToSend: bigint;

  if (amount) {
    amountToSend = parseEther(amount);
    if (amountToSend > balance) {
      throw new Error(`Insufficient balance. Have ${formatEther(balance)} ETH`);
    }
  } else {
    // Estimate gas and send max
    const gasPrice = await publicClient.getGasPrice();
    const gasLimit = 21000n; // Simple ETH transfer
    const maxGasCost = gasPrice * gasLimit * 2n; // 2x buffer for safety
    
    if (balance <= maxGasCost) {
      throw new Error(`Balance too low to cover gas. Have ${formatEther(balance)} ETH`);
    }
    
    amountToSend = balance - maxGasCost;
  }

  const hash = await walletClient.sendTransaction({
    to: toAddress,
    value: amountToSend
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

/**
 * Get current gas price.
 */
export async function getGasPrice(): Promise<bigint> {
  const client = await createPublicClientForNetwork();
  return client.getGasPrice();
}

/**
 * Get current block number.
 */
export async function getBlockNumber(): Promise<bigint> {
  const client = await createPublicClientForNetwork();
  return client.getBlockNumber();
}
