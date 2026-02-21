# AGENTS.md — AI Agent Reference

This file provides structured command specifications for AI agents operating the stealth wallet CLI.

## Quick Reference

```
COMMANDS:
  init      → Create wallet (first step, requires password)
  config    → Set network/RPC
  status    → Check wallet state
  register  → Put meta-address on-chain (costs gas)
  lookup    → Find someone's meta-address (read-only)
  send      → Pay to stealth address (costs ETH + gas)
  receive   → Scan for incoming payments (read-only)
  balance   → List discovered stealth addresses
  withdraw  → Move funds from stealth address (costs gas)
```

## State Machine

```
[No Wallet] 
    │
    ▼ init
[Wallet Exists] 
    │
    ├─▶ config (anytime)
    ├─▶ status (anytime)
    ├─▶ lookup (anytime, read-only)
    │
    ▼ register (optional, costs gas)
[Registered]
    │
    ├─▶ send (costs ETH + gas)
    │
    ▼ receive (after someone sends to you)
[Has Stealth Addresses]
    │
    ├─▶ balance
    ▼ withdraw (costs gas)
[Funds Withdrawn]
```

## Command Specifications

### init

```yaml
command: init
purpose: Create new wallet with spending/viewing keypair
prerequisites: []
state_change: Creates ~/.stealth-wallet/wallet.json
interactive: true (prompts for password)
flags:
  --force: Overwrite existing wallet
  --import <path>: Restore from backup
success_indicators:
  - "Wallet created successfully"
  - Outputs address and stealth meta-address
failure_modes:
  - "Wallet already exists" → use --force
```

### config

```yaml
command: config <action> [value]
purpose: Network and RPC configuration
prerequisites: [wallet_exists]
state_change: Updates config, no on-chain effect
interactive: false
actions:
  show: Display current config (default)
  network <name>: Switch network
  rpc <url>: Set custom RPC endpoint
  rpc-clear: Remove custom RPC
  test: Verify RPC connectivity
valid_networks: [mainnet, sepolia, holesky, arbitrum, optimism, base, polygon]
examples:
  - config network sepolia
  - config rpc https://eth.llamarpc.com
  - config test
```

### status

```yaml
command: status
purpose: Display wallet state and balances
prerequisites: [wallet_exists]
state_change: none (read-only)
interactive: false (prompts for password)
outputs:
  - address: Wallet's main Ethereum address
  - stealth_meta_address: st:eth:0x... format
  - network: Current network name
  - balance: ETH balance
  - registered: Yes/No
```

### register

```yaml
command: register
purpose: Publish stealth meta-address to on-chain registry
prerequisites: [wallet_exists, has_eth_for_gas]
state_change: Writes to ERC-6538 registry contract
interactive: false (prompts for password)
cost: ~50,000 gas
flags:
  --force: Update existing registration
success_indicators:
  - "Registration successful"
  - Transaction hash
failure_modes:
  - "Insufficient funds" → add ETH
  - "Already registered" → use --force
```

### lookup

```yaml
command: lookup <address>
purpose: Query registry for stealth meta-address
prerequisites: []
state_change: none (read-only)
interactive: false
arguments:
  address: 0x-prefixed Ethereum address (40 hex chars)
outputs:
  - stealth_meta_address: st:eth:0x... or "not registered"
example: lookup 0x742d35Cc6634C0532925a3b844Bc9e7595f12345
```

### send

```yaml
command: send
purpose: Send ETH to recipient's stealth address
prerequisites: [wallet_exists, has_eth]
state_change: 
  - Sends ETH to derived stealth address
  - Emits Announcement event on ERC-5564 contract
interactive: true if flags omitted
cost: amount + ~100,000 gas
flags:
  --to <address>: Recipient address (triggers registry lookup)
  --meta <meta>: Direct stealth meta-address (skips lookup)
  --amount <eth>: Amount in ETH (decimal string)
mutual_exclusion: Use --to OR --meta, not both
success_indicators:
  - "Payment sent"
  - Stealth address
  - Transaction hash
failure_modes:
  - "Insufficient funds"
  - "No stealth meta-address registered" → use --meta instead
examples:
  - send --to 0xRecipient... --amount 0.1
  - send --meta st:eth:0x02abc... --amount 0.5
```

### receive

```yaml
command: receive
purpose: Scan blockchain for payments sent to your stealth addresses
prerequisites: [wallet_exists]
state_change: Updates local cache of discovered stealth addresses
interactive: false (prompts for password)
flags:
  --full: Scan from contract deployment (slow, thorough)
  --from-block <n>: Start from specific block
outputs:
  - List of stealth addresses with balances
  - Block numbers where payments were found
note: Uses view tag optimization (~256x faster than brute force)
```

### balance

```yaml
command: balance
purpose: Display balances of all discovered stealth addresses
prerequisites: [wallet_exists, ran_receive]
state_change: none (read-only)
interactive: false (prompts for password)
outputs:
  - Indexed list: address, balance
  - Total balance
note: Run 'receive' first to discover addresses
```

### withdraw

```yaml
command: withdraw
purpose: Transfer funds from stealth address to destination
prerequisites: [wallet_exists, has_stealth_addresses]
state_change: Sends transaction from stealth address
interactive: true if flags omitted
cost: ~21,000 gas per withdrawal
flags:
  --index <n>: Which stealth address (from balance output)
  --to <address>: Destination address
  --amount <eth>: Specific amount (omit for max minus gas)
  --all: Withdraw from all stealth addresses
success_indicators:
  - "Withdrawal successful"
  - Transaction hash
examples:
  - withdraw --index 0 --to 0xMyWallet...
  - withdraw --all --to 0xMyWallet...
```

## Data Format Reference

```yaml
ethereum_address:
  format: "0x[0-9a-fA-F]{40}"
  example: "0x742d35Cc6634C0532925a3b844Bc9e7595f12345"

stealth_meta_address:
  format: "st:eth:0x[0-9a-fA-F]{132}"
  components:
    - prefix: "st:eth:"
    - spending_public_key: 33 bytes (compressed)
    - viewing_public_key: 33 bytes (compressed)
  example: "st:eth:0x02abc123...def456"

private_key:
  format: "[0-9a-fA-F]{64}"
  bytes: 32

transaction_hash:
  format: "0x[0-9a-fA-F]{64}"

eth_amount:
  format: Decimal string
  examples: ["0.1", "1.5", "0.001"]
```

## Contract Addresses (Same on all networks)

```yaml
erc5564_announcer: "0x55649E01B5Df198D18D95b5cc5051630cfD45564"
erc6538_registry: "0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538"
```

## Common Workflows

### Workflow: First-time setup
```bash
stealth-wallet init
# Enter password when prompted
stealth-wallet config network sepolia  # or mainnet
stealth-wallet register  # optional: publish to registry
```

### Workflow: Receive payment (registered)
```bash
# Sender runs: send --to <your_address> --amount 0.1
stealth-wallet receive
stealth-wallet balance
stealth-wallet withdraw --index 0 --to <destination>
```

### Workflow: Receive payment (not registered)
```bash
stealth-wallet status  # copy your stealth meta-address
# Share meta-address with sender out-of-band
# Sender runs: send --meta <your_meta_address> --amount 0.1
stealth-wallet receive
stealth-wallet withdraw --all --to <destination>
```

### Workflow: Check if address is registered
```bash
stealth-wallet lookup 0x742d35Cc6634C0532925a3b844Bc9e7595f12345
```

## Error Recovery

| Symptom | Diagnosis | Action |
|---------|-----------|--------|
| "Wallet not found" | No init run | `stealth-wallet init` |
| "Incorrect password" | Wrong password | Re-enter correctly |
| "Insufficient funds" | No ETH | Transfer ETH to wallet address |
| "No stealth addresses found" | Haven't scanned | `stealth-wallet receive` |
| "Not registered" on lookup | Recipient not in registry | Ask for meta-address directly, use `--meta` |
| Transaction pending long | Network congestion | Wait or check explorer |

## Execution Notes

- All commands that modify wallet state prompt for password
- Password is never stored; wallet is encrypted at rest
- Use `--help` on any command for built-in docs
- Exit codes: 0 = success, non-zero = error
