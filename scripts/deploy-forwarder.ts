/**
 * Deploy StealthForwarder contract to Sepolia.
 * 
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/deploy-forwarder.ts
 */

import { createPublicClient, createWalletClient, http, formatEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Load artifact
  const artifact = JSON.parse(
    readFileSync(join(__dirname, '..', 'artifacts', 'StealthForwarder.json'), 'utf8')
  );

  // Get private key
  let privateKey = process.env.PRIVATE_KEY as Hex;
  if (!privateKey) {
    // Try reading from file
    try {
      privateKey = ('0x' + readFileSync(join(__dirname, '..', '..', 'archive', 'misc', 'pk.txt'), 'utf8').trim()) as Hex;
    } catch {
      console.error('Set PRIVATE_KEY env var or ensure archive/misc/pk.txt exists');
      process.exit(1);
    }
  }

  const account = privateKeyToAccount(privateKey);
  console.log('Deployer:', account.address);

  // Use multiple RPC endpoints for reliability
  const rpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com';
  
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl)
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl)
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Balance:', formatEther(balance), 'ETH');

  if (balance === 0n) {
    console.error('No balance. Get Sepolia ETH from a faucet.');
    process.exit(1);
  }

  console.log('Deploying StealthForwarder...');
  console.log('Bytecode size:', (artifact.bytecode.length - 2) / 2, 'bytes');

  // Estimate gas
  const gasEstimate = await publicClient.estimateGas({
    account: account.address,
    data: artifact.bytecode as Hex
  });
  console.log('Gas estimate:', gasEstimate.toString());

  // Deploy
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
  });

  console.log('Transaction:', hash);
  console.log('Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status === 'success') {
    console.log('');
    console.log('✓ StealthForwarder deployed!');
    console.log('  Address:', receipt.contractAddress);
    console.log('  Block:', receipt.blockNumber.toString());
    console.log('  Gas used:', receipt.gasUsed.toString());
    console.log('');
    console.log('Add this to src/lib/types.ts:');
    console.log(`  export const STEALTH_FORWARDER_SEPOLIA = '${receipt.contractAddress}' as const;`);
  } else {
    console.error('Deployment failed');
    process.exit(1);
  }
}

main().catch(console.error);
