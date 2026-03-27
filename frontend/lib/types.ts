export type InvoiceStatus = 'Pending' | 'Funded' | 'Paid' | 'Defaulted' | 'Disputed';

export type DisputeResolution = 'Upheld' | 'Rejected';

export interface DisputeRecord {
  reason: string;
  disputedAtLedger: number;
  disputedAtTimestamp: number;
  resolution?: DisputeResolution;
  resolvedAtLedger?: number;
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
  usdcToken: string;
  invoiceContract: string;
  admin: string;
  yieldBps: number;
  totalDeposited: bigint;
  totalDeployed: bigint;
  totalPaidOut: bigint;
}

export interface FundedInvoice {
  invoiceId: number;
  sme: string;
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
