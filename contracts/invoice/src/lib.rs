#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol,
};

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum InvoiceStatus {
    Pending,
    Funded,
    Paid,
    Defaulted,
    Disputed,
}

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum DisputeResolution {
    Upheld,
    Rejected,
}

#[derive(Clone)]
#[contracttype]
pub struct DisputeRecord {
    pub invoice_id: u64,
    pub reason: String,
    pub filed_at: u64,
    pub disputed_at_ledger: u32,
    pub resolved_at: u64,
    pub resolved_at_ledger: Option<u32>,
    pub resolution: Option<DisputeResolution>,
}

#[derive(Clone)]
#[contracttype]
pub struct Invoice {
    pub id: u64,
    pub owner: Address,
    pub debtor: String,
    pub amount: i128,
    pub due_date: u64,
    pub description: String,
    pub status: InvoiceStatus,
    pub created_at: u64,
    pub funded_at: u64,
    pub paid_at: u64,
    pub defaulted_at: u64,
    pub pool_contract: Address,
}

/// Wallet / explorer–oriented view derived from [`Invoice`] (no extra storage).
/// Field names align with common JSON token metadata (`name`, `description`, `image`)
/// plus invoice-specific attributes; see `contracts/invoice/README.md` for SEP notes.
#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub struct InvoiceMetadata {
    pub name: String,
    pub description: String,
    /// Placeholder asset URI until per-invoice art exists.
    pub image: String,
    pub amount: i128,
    pub debtor: String,
    pub due_date: u64,
    pub status: InvoiceStatus,
    /// Short ticker, SEP-0041–style (e.g. `INV-1`).
    pub symbol: String,
    /// Smallest units per whole token for `amount` (USDC on Stellar uses 7).
    pub decimals: u32,
}

#[contracttype]
pub enum DataKey {
    Invoice(u64),
    InvoiceCount,
    Admin,
    Pool,
    Initialized,
    DisputeRecord(u64),
}

const EVT: Symbol = symbol_short!("INVOICE");

/// Writes decimal digits of `n` into `buf` (left-aligned), returns digit count.
fn write_u64_decimal(buf: &mut [u8], mut n: u64) -> usize {
    if n == 0 {
        if buf.is_empty() {
            return 0;
        }
        buf[0] = b'0';
        return 1;
    }
    let mut i = 0usize;
    while n > 0 {
        if i >= buf.len() {
            break;
        }
        buf[i] = b'0' + (n % 10) as u8;
        n /= 10;
        i += 1;
    }
    let mut lo = 0usize;
    let mut hi = i - 1;
    while lo < hi {
        buf.swap(lo, hi);
        lo += 1;
        hi -= 1;
    }
    i
}

fn concat_prefix_u64(env: &Env, prefix: &[u8], id: u64) -> String {
    let mut buf = [0u8; 40];
    let plen = prefix.len();
    buf[..plen].copy_from_slice(prefix);
    let dlen = write_u64_decimal(&mut buf[plen..], id);
    String::from_bytes(env, &buf[..plen + dlen])
}

#[contract]
pub struct InvoiceContract;

#[contractimpl]
impl InvoiceContract {
    pub fn initialize(env: Env, admin: Address, pool: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Pool, &pool);
        env.storage().instance().set(&DataKey::InvoiceCount, &0u64);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// SME creates a new invoice token on-chain
    pub fn create_invoice(
        env: Env,
        owner: Address,
        debtor: String,
        amount: i128,
        due_date: u64,
        description: String,
    ) -> u64 {
        owner.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        if due_date <= env.ledger().timestamp() {
            panic!("due date must be in the future");
        }

        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::InvoiceCount)
            .unwrap_or(0);
        let id = count + 1;

        // Placeholder address — real pool address set on fund_invoice
        let placeholder: Address = env.storage().instance().get(&DataKey::Admin).unwrap();

        let invoice = Invoice {
            id,
            owner: owner.clone(),
            debtor,
            amount,
            due_date,
            description,
            status: InvoiceStatus::Pending,
            created_at: env.ledger().timestamp(),
            funded_at: 0,
            paid_at: 0,
            defaulted_at: 0,
            pool_contract: placeholder,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.storage().instance().set(&DataKey::InvoiceCount, &id);
        env.events()
            .publish((EVT, symbol_short!("created")), (id, owner, amount));

        id
    }

    /// Called by the pool contract when it funds an invoice
    pub fn mark_funded(env: Env, id: u64, pool: Address) {
        pool.require_auth();

        let authorized_pool: Address = env
            .storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized");
        if pool != authorized_pool {
            panic!("unauthorized pool");
        }

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found");

        if invoice.status != InvoiceStatus::Pending {
            panic!("invoice is not pending");
        }

        invoice.status = InvoiceStatus::Funded;
        invoice.funded_at = env.ledger().timestamp();
        invoice.pool_contract = pool;

        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.events().publish((EVT, symbol_short!("funded")), id);
    }

    /// Called by the pool when repayment is confirmed
    pub fn mark_paid(env: Env, id: u64, caller: Address) {
        caller.require_auth();

        let pool: Address = env
            .storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized");
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found");

        if caller != invoice.owner && caller != pool && caller != admin {
            panic!("unauthorized");
        }
        if invoice.status != InvoiceStatus::Funded {
            panic!("invoice is not funded");
        }

        invoice.status = InvoiceStatus::Paid;
        invoice.paid_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.events().publish((EVT, symbol_short!("paid")), id);
    }

    /// Mark invoice as defaulted (missed due date, no repayment)
    pub fn mark_defaulted(env: Env, id: u64, pool: Address) {
        pool.require_auth();

        let authorized_pool: Address = env
            .storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized");
        if pool != authorized_pool {
            panic!("unauthorized pool");
        }

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found");

        if invoice.status != InvoiceStatus::Funded {
            panic!("invoice is not funded");
        }

        invoice.status = InvoiceStatus::Defaulted;
        invoice.defaulted_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.events().publish((EVT, symbol_short!("default")), id);
    }

    /// Invoice owner disputes a default within the 7-day window.
    pub fn dispute_invoice(env: Env, id: u64, owner: Address, reason: String) {
        owner.require_auth();

        if reason.len() == 0 {
            panic!("dispute reason cannot be empty");
        }

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found");

        if env.storage().persistent().has(&DataKey::DisputeRecord(id)) {
            panic!("dispute already exists");
        }
        if invoice.owner != owner {
            panic!("unauthorized");
        }
        if invoice.status != InvoiceStatus::Defaulted {
            panic!("invalid invoice status");
        }

        let now = env.ledger().timestamp();
        // 7 days = 604,800 seconds
        if now > invoice.defaulted_at + 604_800 {
            panic!("dispute window expired");
        }

        invoice.status = InvoiceStatus::Disputed;

        let record = DisputeRecord {
            invoice_id: id,
            reason: reason.clone(),
            filed_at: now,
            disputed_at_ledger: env.ledger().sequence(),
            resolved_at: 0,
            resolved_at_ledger: None,
            resolution: None,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.storage()
            .persistent()
            .set(&DataKey::DisputeRecord(id), &record);

        env.events().publish(
            (EVT, symbol_short!("disputed")),
            (id, owner, reason, now),
        );
    }

    /// Admin resolves a dispute, either reinstating Funded or confirming Defaulted.
    pub fn resolve_dispute(env: Env, id: u64, admin: Address, resolution: DisputeResolution) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        if admin != stored_admin {
            panic!("unauthorized");
        }

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found");

        if invoice.status != InvoiceStatus::Disputed {
            panic!("invalid invoice status");
        }

        let mut record: DisputeRecord = env
            .storage()
            .persistent()
            .get(&DataKey::DisputeRecord(id))
            .expect("dispute not found");

        match resolution {
            DisputeResolution::Upheld => {
                invoice.status = InvoiceStatus::Funded;
            }
            DisputeResolution::Rejected => {
                invoice.status = InvoiceStatus::Defaulted;
            }
        }

        let now = env.ledger().timestamp();
        let ledger = env.ledger().sequence();
        record.resolved_at = now;
        record.resolved_at_ledger = Some(ledger);
        record.resolution = Some(resolution.clone());

        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.storage()
            .persistent()
            .set(&DataKey::DisputeRecord(id), &record);

        env.events().publish(
            (EVT, symbol_short!("resolved")),
            (id, resolution, ledger),
        );
    }

    pub fn get_invoice(env: Env, id: u64) -> Invoice {
        env.storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found")
    }

    /// SEP-oriented metadata for invoice id `id` (same ledger fields as `get_invoice`).
    pub fn get_metadata(env: Env, id: u64) -> InvoiceMetadata {
        let inv: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found");

        let name = concat_prefix_u64(&env, b"Astera Invoice #", inv.id);
        let symbol = concat_prefix_u64(&env, b"INV-", inv.id);
        let image = String::from_str(&env, "https://astera.io/metadata/invoice/placeholder.svg");

        InvoiceMetadata {
            name,
            description: inv.description.clone(),
            image,
            amount: inv.amount,
            debtor: inv.debtor.clone(),
            due_date: inv.due_date,
            status: inv.status.clone(),
            symbol,
            decimals: 7,
        }
    }

    pub fn get_dispute_record(env: Env, id: u64) -> DisputeRecord {
        env.storage()
            .persistent()
            .get(&DataKey::DisputeRecord(id))
            .expect("dispute record not found")
    }

    pub fn get_invoice_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::InvoiceCount)
            .unwrap_or(0)
    }

    /// Update authorized pool address (admin only)
    pub fn set_pool(env: Env, admin: Address, pool: Address) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        if admin != stored_admin {
            panic!("unauthorized");
        }
        env.storage().instance().set(&DataKey::Pool, &pool);
    }
}
