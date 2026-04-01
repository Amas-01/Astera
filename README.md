# Astera

**Real World Assets on Stellar. Invoice financing for emerging markets.**

Astera lets SMEs tokenize unpaid invoices as Soroban-based RWA tokens. Community investors
fund a USDC liquidity pool. Smart contracts handle escrow, repayment, and yield distribution.
Every paid invoice builds an on-chain credit history.

---

## Architecture

```
contracts/
  invoice/   — RWA invoice token contract (Soroban/Rust)
  pool/      — Liquidity pool + yield distribution (Soroban/Rust)
frontend/    — Next.js 14 app (Freighter wallet, Stellar SDK)
```

## Contracts

### Invoice Contract
- `create_invoice` — SME mints an invoice token with amount, debtor, due date
- `mark_funded` — Called by pool when invoice is funded
- `mark_paid` — SME or pool marks invoice as repaid
- `mark_defaulted` — Pool flags missed repayment

### Pool Contract
- `deposit` — Investor deposits USDC into the liquidity pool
- `fund_invoice` — Admin deploys pool liquidity to fund a specific invoice
- `repay_invoice` — SME repays principal + simple interest (8% APY default)
- `withdraw` — Investor withdraws available (undeployed) balance

---

## Setup

### Prerequisites
- [Rust + Cargo](https://rustup.rs/)
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli)
- [Node.js 20+](https://nodejs.org/)
- [Freighter wallet](https://www.freighter.app/) browser extension

### 1. Build contracts

```bash
cd astera
cargo build --target wasm32-unknown-unknown --release
```

### 2. Deploy to Testnet

```bash
# Fund a testnet account
stellar keys generate --global deployer --network testnet
stellar keys fund deployer --network testnet

# Deploy invoice contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/invoice.wasm \
  --source deployer \
  --network testnet

# Deploy pool contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/pool.wasm \
  --source deployer \
  --network testnet
```

### 3. Initialize contracts

```bash
# Initialize invoice contract
stellar contract invoke \
  --id <INVOICE_CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin <YOUR_ADDRESS> \
  --pool <POOL_CONTRACT_ID>

# Initialize pool contract
stellar contract invoke \
  --id <POOL_CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin <YOUR_ADDRESS> \
  --usdc_token <USDC_TOKEN_ID> \
  --invoice_contract <INVOICE_CONTRACT_ID>
```

### 4. Run frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in contract IDs in .env.local

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## User Flows

### SME Flow
1. Connect Freighter wallet
2. Go to **New Invoice** — fill debtor, amount, due date
3. Sign transaction — invoice minted on Stellar
4. Monitor status on **Dashboard** — see funding, credit score
5. When customer pays, call `repay_invoice` to settle

### Investor Flow
1. Connect Freighter wallet
2. Go to **Invest** — deposit USDC into pool
3. Pool admin deploys liquidity to approved invoices
4. When invoices are repaid, yield accumulates in the pool
5. Withdraw available balance anytime

---

## Testnet USDC

Use the Stellar testnet USDC asset or deploy a mock token:

```bash
stellar contract invoke \
  --id <TOKEN_ID> \
  --source deployer \
  --network testnet \
  -- mint \
  --to <YOUR_ADDRESS> \
  --amount 1000000000000
```

---

## Network

- **Network:** Stellar Testnet
- **RPC:** https://soroban-testnet.stellar.org
- **Explorer:** https://stellar.expert/explorer/testnet
