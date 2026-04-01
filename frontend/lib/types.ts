export type InvoiceStatus = 'Pending' | 'Funded' | 'Paid' | 'Defaulted' | 'Disputed';

export type DisputeResolution = 'Upheld' | 'Rejected';

export interface DisputeRecord {
  invoiceId: number;
  reason: string;
  filedAt: number;
  disputedAtLedger: number;
  resolvedAt: number;
  resolvedAtLedger: number | null;
  resolution: DisputeResolution | null;
}

/** On-chain view from `get_metadata` (SEP-oriented display fields). */
export interface InvoiceMetadata {
  name: string;
  description: string;
  image: string;
  amount: bigint;
  debtor: string;
  dueDate: number;
  status: InvoiceStatus;
  symbol: string;
  decimals: number;
}

export interface Invoice {
  id: number;
  owner: string;
  debtor: string;
  amount: bigint;
  dueDate: number;
  description: string;
  status: InvoiceStatus;
  createdAt: number;
  fundedAt: number;
  paidAt: number;
  defaultedAt: number;
  poolContract: string;
}

export interface InvestorPosition {
  deposited: bigint;
  available: bigint;
  deployed: bigint;
  earned: bigint;
  depositCount: number;
}

export interface PoolConfig {
  invoiceContract: string;
  admin: string;
  yieldBps: number;
  totalDeposited: bigint;
  totalDeployed: bigint;
  totalPaidOut: bigint;
  usdcToken: string;
}

export interface PoolTokenTotals {
  totalDeposited: bigint;
  totalDeployed: bigint;
  totalPaidOut: bigint;
}

export interface FundedInvoice {
  invoiceId: number;
  sme: string;
  /** Stablecoin contract used for this invoice */
  token: string;
  principal: bigint;
  committed: bigint;
  fundedAt: number;
  dueDate: number;
  repaid: boolean;
}

export type WalletState = {
  address: string | null;
  connected: boolean;
  network: string;
};
