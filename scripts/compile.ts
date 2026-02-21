/**
 * Compile StealthForwarder contract.
 */

import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(__dirname, '..', 'contracts');
const artifactsDir = join(__dirname, '..', 'artifacts');

// Read source
const source = readFileSync(join(contractsDir, 'StealthForwarder.sol'), 'utf8');

// Compile
const input = {
  language: 'Solidity',
  sources: {
    'StealthForwarder.sol': { content: source }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object']
      }
    }
  }
};

console.log('Compiling StealthForwarder.sol...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Check for errors
if (output.errors) {
  for (const error of output.errors) {
    if (error.severity === 'error') {
      console.error('Compilation error:', error.formattedMessage);
      process.exit(1);
    } else {
      console.warn('Warning:', error.formattedMessage);
    }
  }
}

const contract = output.contracts['StealthForwarder.sol']['StealthForwarder'];

if (!contract) {
  console.error('Contract not found in output');
  process.exit(1);
}

// Save artifacts
mkdirSync(artifactsDir, { recursive: true });

const artifact = {
  abi: contract.abi,
  bytecode: '0x' + contract.evm.bytecode.object
};

writeFileSync(
  join(artifactsDir, 'StealthForwarder.json'),
  JSON.stringify(artifact, null, 2)
);

console.log('✓ Compiled successfully');
console.log('  Bytecode size:', artifact.bytecode.length / 2 - 1, 'bytes');
console.log('  Artifact saved to artifacts/StealthForwarder.json');
