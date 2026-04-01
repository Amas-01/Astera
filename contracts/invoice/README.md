# Invoice Contract

## Overview

The Invoice Contract manages on-chain invoice tokens for SMEs (Small and Medium Enterprises). It tracks invoice lifecycle from creation through funding, payment, default, and dispute resolution. The contract works in conjunction with the Pool Contract to enable invoice financing.

## Contract Purpose

- Create and manage invoice tokens representing receivables
- Track invoice status (Pending, Funded, Paid, Defaulted, Disputed)
- Coordinate with the Pool Contract for invoice funding
- Provide an on-chain dispute resolution mechanism for defaulted invoices
- Provide transparency and immutability for invoice financing operations

## Data Structures

### InvoiceStatus

```rust
enum InvoiceStatus {
    Pending,    // Invoice created, awaiting funding
    Funded,     // Pool has funded the invoice
    Paid,       // Invoice has been repaid
    Defaulted,  // Invoice missed due date without repayment
    Disputed,   // Invoice default is being disputed by the owner
}
```

### DisputeRecord

```rust
struct DisputeRecord {
    invoice_id: u64,
    reason: String,
    filed_at: u64,           // Timestamp
    disputed_at_ledger: u32, // Ledger sequence
    resolved_at: u64,        // Timestamp (0 if pending)
    resolved_at_ledger: Option<u32>,
    resolution: Option<DisputeResolution>,
}
```

### Invoice

```rust
struct Invoice {
    id: u64,
    owner: Address,              // SME who created the invoice
    debtor: String,              // Name of the company that owes payment
    amount: i128,                // Invoice amount in USDC (7 decimals)
    due_date: u64,               // Unix timestamp when payment is due
    description: String,         // Invoice description
    status: InvoiceStatus,       // Current status
    created_at: u64,             // Unix timestamp of creation
    funded_at: u64,              // Unix timestamp when funded (0 if not funded)
    paid_at: u64,                // Unix timestamp when paid (0 if not paid)
    defaulted_at: u64,           // Unix timestamp when marked defaulted
    pool_contract: Address,      // Address of pool that funded this invoice
}
```

## Storage Keys

- `Invoice(u64)`: Maps invoice ID to Invoice struct (persistent storage)
- `InvoiceCount`: Total number of invoices created (instance storage)
- `Admin`: Contract administrator address (instance storage)
- `Pool`: Authorized pool contract address (instance storage)
- `Initialized`: Boolean flag indicating contract initialization (instance storage)
- `DisputeRecord(u64)`: Maps invoice ID to DisputeRecord struct (persistent storage)

## Events

All events are published with topic `INVOICE`.

### created
- **Data**: `(id: u64, owner: Address, amount: i128)`
- **Emitted**: When a new invoice is created

### funded
- **Data**: `id: u64`
- **Emitted**: When an invoice is marked as funded by the pool

### paid
- **Data**: `id: u64`
- **Emitted**: When an invoice is marked as paid

### default
- **Data**: `id: u64`
- **Emitted**: When an invoice is marked as defaulted

### disputed
- **Data**: `(id: u64, owner: Address, reason: String, timestamp: u64)`
- **Emitted**: When a dispute is filed

### resolved
- **Data**: `(id: u64, resolution: DisputeResolution, ledger: u32)`
- **Emitted**: When a dispute is resolved by the admin

---

## Public Functions

### initialize(admin: Address, pool: Address)
Initializes the contract with admin and pool addresses.

### create_invoice(owner: Address, debtor: String, amount: i128, due_date: u64, description: String) -> u64
SME creates a new invoice token on-chain.

### dispute_invoice(id: u64, owner: Address, reason: String)
Invoice owner disputes a default within the 7-day window.
**Auth:** `owner` must sign.
**Requirement:** Status must be `Defaulted`. Window is 604,800 seconds from `defaulted_at`.

### resolve_dispute(id: u64, admin: Address, resolution: DisputeResolution)
Admin resolves a dispute, either reinstating `Funded` or confirming `Defaulted`.
**Auth:** `admin` must sign.

### get_metadata(id: u64) -> InvoiceMetadata
Returns a structured [`InvoiceMetadata`](src/lib.rs) value derived from the stored invoice for wallet/explorer display.

---

## Integration Notes

- The Invoice Contract is designed to work with the Pool Contract.
- Dispute window is strictly enforced on-chain (7 days).
- `get_metadata` aligns with SEP-0041 for name, symbol, and decimals.
