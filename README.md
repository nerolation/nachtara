# Stealth Wallet CLI

CLI wallet for ERC-5564/ERC-6538 stealth address transactions on Ethereum.

## What It Does

Stealth addresses let you receive funds without linking payments to your public address. Each payment goes to a unique one-time address that only you can spend from.

**Core flow:**
1. Sender looks up recipient's stealth meta-address (from registry or direct)
2. Sender generates ephemeral keypair → derives one-time stealth address
3. Sender sends ETH to stealth address + emits announcement
4. Recipient scans announcements → finds payments → withdraws

## Installation

```bash
git clone https://github.com/nerolation/nachtara.git
cd nachtara
npm install
npm run build
```

Run commands via: `node dist/cli.js <command>` or `npm run dev -- <command>`

---

## Command Reference

### `init` — Create Wallet

**Prerequisites:** None

**Usage:**
```bash
stealth-wallet init [--force] [--import <path>]
```

**Flags:**
| Flag | Type | Description |
|------|------|-------------|
| `--force`, `-f` | boolean | Overwrite existing wallet |
| `--import`, `-i` | string | Path to backup file to restore |

**Behavior:**
- Interactive: prompts for password and key generation method
- Creates `~/.stealth-wallet/wallet.json` (AES-256-GCM encrypted)
- Generates spending key + viewing key pair
- Outputs stealth meta-address

**Output on success:**
```
✔ Wallet created successfully!
  Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f...
  Stealth Meta-Address: st:eth:0x02abc...def
```

**Errors:**
- `Wallet already exists` → use `--force` to overwrite

---

### `config` — Network Configuration

**Prerequisites:** Wallet initialized

**Usage:**
```bash
stealth-wallet config [action] [value]
```

**Actions:**
| Action | Args | Description |
|--------|------|-------------|
| `show` | — | Display current config (default) |
| `network` | `<name>` | Switch network |
| `rpc` | `<url>` | Set custom RPC URL |
| `rpc-clear` | — | Remove custom RPC |
| `test` | — | Test RPC connection |

**Valid networks:** `mainnet`, `sepolia`, `holesky`, `arbitrum`, `optimism`, `base`, `polygon`

**Examples:**
```bash
# Switch to Sepolia testnet
stealth-wallet config network sepolia

# Set custom RPC
stealth-wallet config rpc https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# Verify connection
stealth-wallet config test
```

**Output (`config show`):**
```
Network: sepolia (Chain ID: 11155111)
RPC URL: https://rpc.sepolia.org
Block Explorer: https://sepolia.etherscan.io
```

---

### `status` — Wallet Status

**Prerequisites:** Wallet initialized

**Usage:**
```bash
stealth-wallet status
```

**Output:**
```
Wallet Status
─────────────
Address:              0x742d35Cc6634C0532925a3b844Bc9e7595f...
Stealth Meta-Address: st:eth:0x02abc...def
Network:              sepolia
Balance:              0.5 ETH
Registered:           Yes
```

---

### `register` — Register Meta-Address On-Chain

**Prerequisites:** 
- Wallet initialized
- Wallet has ETH for gas

**Usage:**
```bash
stealth-wallet register [--force]
```

**Flags:**
| Flag | Type | Description |
|------|------|-------------|
| `--force`, `-f` | boolean | Update existing registration |

**Behavior:**
- Submits transaction to ERC-6538 Registry (`0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538`)
- Associates your address with your stealth meta-address
- Anyone can then look up your meta-address by your regular address

**Output on success:**
```
✔ Registration successful!
  Transaction: 0xabc...def
  Your address 0x742d... is now linked to your stealth meta-address
```

**Errors:**
- `Insufficient funds` → need ETH for gas
- `Already registered` → use `--force` to update

---

### `lookup` — Find Stealth Meta-Address

**Prerequisites:** None (read-only)

**Usage:**
```bash
stealth-wallet lookup <address>
```

**Arguments:**
| Arg | Type | Description |
|-----|------|-------------|
| `address` | `0x...` (40 hex chars) | Ethereum address to look up |

**Output on success:**
```
Stealth Meta-Address for 0x742d35Cc6634C0532925a3b844Bc9e7595f...:
st:eth:0x02abc123...def456
```

**Output if not registered:**
```
No stealth meta-address registered for 0x742d35Cc6634C0532925a3b844Bc9e7595f...
```

---

### `send` — Send ETH to Stealth Address

**Prerequisites:**
- Wallet initialized
- Wallet has ETH (amount + gas)

**Usage:**
```bash
stealth-wallet send [--to <address>] [--meta <metaAddress>] [--amount <eth>]
```

**Flags:**
| Flag | Type | Description |
|------|------|-------------|
| `--to`, `-t` | `0x...` | Recipient address (looks up meta-address from registry) |
| `--meta`, `-m` | `st:eth:0x...` | Direct stealth meta-address (skip registry lookup) |
| `--amount`, `-a` | decimal string | Amount in ETH (e.g., `0.1`, `1.5`) |

**Behavior:**
1. Resolves recipient's stealth meta-address (via `--meta` or registry lookup from `--to`)
2. Generates ephemeral keypair
3. Computes stealth address via ECDH
4. Sends ETH to stealth address
5. Emits `Announcement` event on ERC-5564 contract

**Output on success:**
```
✔ Payment sent!
  Amount:          0.1 ETH
  Stealth Address: 0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e
  Transaction:     0xabc123...
  
  The recipient can discover this payment by scanning announcements.
```

**Examples:**
```bash
# Send to registered address
stealth-wallet send --to 0x742d35Cc6634C0532925a3b844Bc9e7595f... --amount 0.1

# Send to direct meta-address (recipient not registered)
stealth-wallet send --meta st:eth:0x02abc...def --amount 0.5

# Interactive mode (prompts for all values)
stealth-wallet send
```

---

### `receive` — Scan for Incoming Payments

**Prerequisites:** Wallet initialized

**Usage:**
```bash
stealth-wallet receive [--full] [--from-block <number>]
```

**Flags:**
| Flag | Type | Description |
|------|------|-------------|
| `--full` | boolean | Scan from contract deployment block |
| `--from-block` | integer | Start scanning from specific block |

**Behavior:**
1. Fetches `Announcement` events from ERC-5564 contract
2. Filters by view tag (first byte of shared secret hash) — ~256x faster
3. Attempts to derive stealth private key for each matching announcement
4. Returns list of stealth addresses you control

**Output:**
```
Scanning for stealth payments...
✔ Found 2 payments

#  Address                                      Balance      Block
─────────────────────────────────────────────────────────────────────
0  0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e  0.1 ETH      18500000
1  0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b  0.5 ETH      18600000
```

---

### `balance` — Show Stealth Address Balances

**Prerequisites:** 
- Wallet initialized
- Run `receive` first to discover addresses

**Usage:**
```bash
stealth-wallet balance
```

**Output:**
```
Stealth Address Balances
────────────────────────────────────────────────────────
#  Address                                      Balance
0  0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e  0.1 ETH
1  0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b  0.5 ETH
────────────────────────────────────────────────────────
   Total                                        0.6 ETH
```

---

### `withdraw` — Withdraw from Stealth Address

**Prerequisites:**
- Wallet initialized
- Discovered stealth addresses via `receive`
- Stealth address has ETH

**Usage:**
```bash
stealth-wallet withdraw [--index <n>] [--to <address>] [--amount <eth>] [--all]
```

**Flags:**
| Flag | Type | Description |
|------|------|-------------|
| `--index`, `-i` | integer | Index of stealth address (from `balance` output) |
| `--to`, `-t` | `0x...` | Destination address |
| `--amount`, `-a` | decimal string | Amount to withdraw (omit for max minus gas) |
| `--all` | boolean | Withdraw from all stealth addresses |

**Examples:**
```bash
# Withdraw from specific address to destination
stealth-wallet withdraw --index 0 --to 0xMyOtherWallet...

# Withdraw specific amount
stealth-wallet withdraw --index 0 --to 0xMyOtherWallet... --amount 0.05

# Withdraw all discovered balances
stealth-wallet withdraw --all --to 0xMyOtherWallet...
```

**Output:**
```
✔ Withdrawal successful!
  From:        0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e
  To:          0xMyOtherWallet...
  Amount:      0.099 ETH (0.001 ETH gas)
  Transaction: 0xdef456...
```

---

## Data Formats

### Ethereum Address
```
0x followed by 40 hex characters
Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f12345
```

### Stealth Meta-Address
```
st:eth:0x followed by 132 hex characters (66 bytes = spending pubkey + viewing pubkey)
Example: st:eth:0x02abc123...def456 (full length: 136 chars total)
```

### Private Key
```
64 hex characters (32 bytes)
Example: 6704aaba82aa9cfea059182da7fec742e6ab162ea797d933846ba2ceb72ca5e9
```

---

## Workflow Examples

### Example 1: Alice pays Bob (Bob is registered)

```bash
# Bob: Initialize and register
stealth-wallet init
# → Enter password, generates meta-address

stealth-wallet config network sepolia
stealth-wallet register
# → Bob's address is now linked to his meta-address on-chain

# Alice: Send to Bob's address
stealth-wallet send --to 0xBobsAddress... --amount 0.1
# → Looks up Bob's meta-address, sends to stealth address

# Bob: Discover and withdraw
stealth-wallet receive
# → Shows payment from Alice

stealth-wallet withdraw --index 0 --to 0xBobsMainWallet...
# → Moves funds out of stealth address
```

### Example 2: Alice pays Bob (Bob shares meta-address directly)

```bash
# Bob: Share meta-address out-of-band
stealth-wallet status
# → Copy stealth meta-address: st:eth:0x02abc...

# Alice: Send using direct meta-address
stealth-wallet send --meta st:eth:0x02abc... --amount 0.5
```

### Example 3: Batch withdraw all

```bash
stealth-wallet receive --full
stealth-wallet withdraw --all --to 0xMyMainWallet...
```

---

## Contract Addresses (All Networks)

| Contract | Address | Purpose |
|----------|---------|---------|
| ERC-5564 Announcer | `0x55649E01B5Df198D18D95b5cc5051630cfD45564` | Announcement events |
| ERC-6538 Registry | `0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538` | Meta-address registry |

These are singleton contracts deployed at the same address on all supported networks.

---

## Network Configuration

| Network | Chain ID | Default RPC |
|---------|----------|-------------|
| `mainnet` | 1 | `https://eth.llamarpc.com` |
| `sepolia` | 11155111 | `https://rpc.sepolia.org` |
| `holesky` | 17000 | `https://ethereum-holesky-rpc.publicnode.com` |
| `arbitrum` | 42161 | `https://arb1.arbitrum.io/rpc` |
| `optimism` | 10 | `https://mainnet.optimism.io` |
| `base` | 8453 | `https://mainnet.base.org` |
| `polygon` | 137 | `https://polygon-rpc.com` |

---

## File Locations

| File | Path | Purpose |
|------|------|---------|
| Wallet | `~/.stealth-wallet/wallet.json` | Encrypted keys + config |
| Config | `~/.stealth-wallet/config.json` | Network settings |

---

## Cryptographic Details

### Key Generation
- Curve: secp256k1
- Spending key: Random 32 bytes or derived from signature
- Viewing key: Random 32 bytes or derived from signature

### Stealth Address Derivation
```
ephemeralPrivate = random()
ephemeralPublic = ephemeralPrivate × G
sharedSecret = ephemeralPrivate × viewingPublic
stealthPrivate = spendingPrivate + keccak256(sharedSecret)
stealthAddress = pubkeyToAddress(stealthPrivate × G)
viewTag = keccak256(sharedSecret)[0]  # First byte
```

### Encryption
- Algorithm: AES-256-GCM
- Key derivation: PBKDF2 with 100,000 iterations
- Salt: Random 32 bytes per wallet

---

## Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| `Wallet not found` | No wallet initialized | Run `stealth-wallet init` |
| `Incorrect password` | Wrong decryption password | Re-enter correct password |
| `Insufficient funds` | Not enough ETH for tx | Add ETH to wallet |
| `No stealth meta-address registered` | Recipient not in registry | Use `--meta` with direct address |
| `Already registered` | Meta-address already on-chain | Use `--force` to update |
| `No stealth addresses found` | Haven't received or scanned | Run `stealth-wallet receive` |

---

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript
npm test           # Run 164 tests
npm run typecheck  # Type check without emit
npm run dev -- <cmd>  # Run in development mode
```

---

## References

- [ERC-5564: Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564)
- [ERC-6538: Stealth Meta-Address Registry](https://eips.ethereum.org/EIPS/eip-6538)
