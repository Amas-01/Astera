'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getInvoice,
  getDisputeRecord,
  buildDisputeInvoiceTx,
  buildResolveDisputeTx,
  submitTx,
} from '@/lib/contracts';
import { formatUSDC, formatDate, daysUntil, truncateAddress } from '@/lib/stellar';
import type { Invoice, DisputeRecord, DisputeResolution } from '@/lib/types';
import { useStore } from '@/lib/store';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { wallet } = useStore();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [dispute, setDispute] = useState<DisputeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  useEffect(() => {
    loadInvoice();
  }, [id]);

  async function loadInvoice() {
    try {
      const inv = await getInvoice(parseInt(id));
      setInvoice(inv);
      const record = await getDisputeRecord(parseInt(id));
      setDispute(record);
    } catch (e) {
      setError('Invoice not found or contracts not deployed.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDispute() {
    if (!wallet.address || !invoice) return;
    if (disputeReason.trim().length === 0) {
      alert('Please enter a reason for the dispute.');
      return;
    }

    setActionLoading(true);
    try {
      const xdr = await buildDisputeInvoiceTx({
        owner: wallet.address,
        invoiceId: invoice.id,
        reason: disputeReason,
      });

      const freighter = await import('@stellar/freighter-api');
      const { signedTxXdr, error: signError } = await freighter.signTransaction(xdr, {
        networkPassphrase: 'Test SDF Network ; September 2015',
        address: wallet.address,
      });

      if (signError) throw new Error(signError.message || 'Signing rejected.');

      await submitTx(signedTxXdr);
      setShowDisputeModal(false);
      await loadInvoice();
    } catch (e) {
      console.error(e);
      alert('Failed to file dispute.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResolve(resolution: DisputeResolution) {
    if (!wallet.address || !invoice) return;

    setActionLoading(true);
    try {
      const xdr = await buildResolveDisputeTx({
        admin: wallet.address,
        invoiceId: invoice.id,
        resolution,
      });

      const freighter = await import('@stellar/freighter-api');
      const { signedTxXdr, error: signError } = await freighter.signTransaction(xdr, {
        networkPassphrase: 'Test SDF Network ; September 2015',
        address: wallet.address,
      });

      if (signError) throw new Error(signError.message || 'Signing rejected.');

      await submitTx(signedTxXdr);
      await loadInvoice();
    } catch (e) {
      console.error(e);
      alert('Failed to resolve dispute.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen pt-24 px-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 bg-brand-card rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen pt-24 px-6 flex flex-col items-center justify-center text-center">
        <p className="text-red-400 mb-4">{error ?? 'Invoice not found.'}</p>
        <Link href="/dashboard" className="text-brand-gold hover:underline text-sm">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const days = daysUntil(invoice.dueDate);
  const isOwner = wallet.address === invoice.owner;

  const timeline = [
    { label: 'Created', ts: invoice.createdAt, done: true },
    { label: 'Funded', ts: invoice.fundedAt, done: invoice.status !== 'Pending' },
  ];

  if (
    invoice.status === 'Defaulted' ||
    invoice.status === 'Disputed' ||
    (invoice.status === 'Funded' && invoice.defaultedAt > 0)
  ) {
    timeline.push({ label: 'Defaulted', ts: invoice.defaultedAt, done: true });
  }

  if (dispute) {
    timeline.push({
      label: `Dispute Filed: ${dispute.reason}`,
      ts: dispute.disputedAtTimestamp,
      done: true,
    });
    if (dispute.resolution === 'Upheld') {
      timeline.push({ label: 'Dispute Upheld', ts: 0, done: true });
    } else if (dispute.resolution === 'Rejected') {
      timeline.push({ label: 'Dispute Rejected', ts: 0, done: true });
    }
  }

  if (invoice.status === 'Paid') {
    timeline.push({ label: 'Paid', ts: invoice.paidAt, done: true });
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-2xl mx-auto">
        {/* Back */}
        <Link
          href="/dashboard"
          className="text-brand-muted hover:text-white text-sm mb-6 inline-flex items-center gap-2 transition-colors"
        >
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div className="p-6 bg-brand-card border border-brand-border rounded-2xl mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs text-brand-muted mb-1">Invoice #{invoice.id}</p>
              <h1 className="text-2xl font-bold">{invoice.debtor}</h1>
            </div>
            <span
              className={`text-sm font-medium px-3 py-1.5 rounded-full badge-${invoice.status.toLowerCase()}`}
            >
              {invoice.status}
            </span>
          </div>

          <div className="text-4xl font-bold gradient-text mb-6">{formatUSDC(invoice.amount)}</div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-brand-muted mb-1">Due Date</p>
              <p className="font-medium">{formatDate(invoice.dueDate)}</p>
            </div>
            <div>
              <p className="text-brand-muted mb-1">Time Remaining</p>
              <p
                className={`font-medium ${
                  days < 0 ? 'text-red-400' : days <= 7 ? 'text-yellow-400' : 'text-white'
                }`}
              >
                {days < 0 ? `${Math.abs(days)} days overdue` : `${days} days`}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-brand-muted mb-1">Owner</p>
              <p className="font-mono text-xs text-white break-all">{invoice.owner}</p>
            </div>
            {invoice.description && (
              <div className="col-span-2">
                <p className="text-brand-muted mb-1">Description</p>
                <p className="text-sm">{invoice.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="p-6 bg-brand-card border border-brand-border rounded-2xl mb-6">
          <h2 className="text-lg font-semibold mb-6">Timeline</h2>
          <div className="space-y-4">
            {timeline.map((step, i) => (
              <div key={step.label} className="flex items-center gap-4">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    step.done ? 'bg-brand-gold text-brand-dark' : 'bg-brand-border text-brand-muted'
                  }`}
                >
                  {step.done ? '✓' : i + 1}
                </div>
                <div className="flex-1 flex justify-between">
                  <span className={step.done ? 'text-white font-medium' : 'text-brand-muted'}>
                    {step.label}
                  </span>
                  {step.done && step.ts > 0 && (
                    <span className="text-brand-muted text-sm">{formatDate(step.ts)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        {isOwner && invoice.status === 'Pending' && (
          <div className="p-4 bg-brand-gold/10 border border-brand-gold/20 rounded-xl text-sm text-brand-muted">
            Your invoice is pending review. Once approved, the pool will fund it and USDC will be
            sent to your wallet.
          </div>
        )}

        {isOwner &&
          invoice.status === 'Defaulted' &&
          days < 0 &&
          Math.abs(days) <= 7 &&
          !dispute && (
            <div className="p-6 bg-brand-card border border-brand-border rounded-2xl flex flex-col gap-4">
              <h3 className="text-lg font-bold text-red-400">Default Notice</h3>
              <p className="text-sm text-brand-muted">
                This invoice has been marked as defaulted. If you believe this is an error or have
                valid proof of repayment, you can file a dispute within 7 days of the default event.
              </p>
              <button
                onClick={() => setShowDisputeModal(true)}
                className="w-full py-3 bg-red-900/30 text-red-500 border border-red-800/30 font-bold rounded-xl hover:bg-red-900/50 transition-all"
              >
                File Dispute
              </button>
            </div>
          )}

        {invoice.status === 'Disputed' && (
          <div className="p-6 bg-brand-card border border-brand-border rounded-2xl flex flex-col gap-4">
            <h3 className="text-lg font-bold text-yellow-400">Dispute Pending</h3>
            <p className="text-sm text-brand-muted">
              A dispute has been filed and is currently under review by the protocol administrators.
            </p>
            {/* Admin Resolution Section — assuming admin address is known or matches config */}
            {/* In a real app we might fetch the config.admin to compare */}
            {wallet.address && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <button
                  onClick={() => handleResolve('Upheld')}
                  disabled={actionLoading}
                  className="py-3 bg-green-900/30 text-green-500 border border-green-800/30 font-bold rounded-xl hover:bg-green-900/50 transition-all disabled:opacity-50"
                  id="uphold-dispute-btn"
                >
                  Uphold Dispute
                </button>
                <button
                  onClick={() => handleResolve('Rejected')}
                  disabled={actionLoading}
                  className="py-3 bg-red-900/30 text-red-500 border border-red-800/30 font-bold rounded-xl hover:bg-red-900/50 transition-all disabled:opacity-50"
                  id="reject-dispute-btn"
                >
                  Reject Dispute
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dispute Modal */}
        {showDisputeModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-brand-dark border border-brand-border rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <h2 className="text-2xl font-bold mb-2">File Dispute</h2>
              <p className="text-brand-muted text-sm mb-6">
                Please provide a reason or evidence link for your dispute. This will be stored
                permanently on-chain.
              </p>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="e.g. Transaction hash of off-chain repayment..."
                className="w-full h-32 bg-brand-card border border-brand-border rounded-xl p-4 text-white placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-gold/50 mb-6 resize-none"
              />
              <div className="flex gap-4">
                <button
                  onClick={() => setShowDisputeModal(false)}
                  className="flex-1 py-3 bg-brand-border text-white font-bold rounded-xl hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDispute}
                  disabled={actionLoading || disputeReason.trim().length === 0}
                  className="flex-1 py-3 bg-brand-gold text-brand-dark font-bold rounded-xl hover:shadow-[0_0_20px_rgba(255,191,0,0.4)] transition-all disabled:opacity-50"
                >
                  {actionLoading ? 'Filing...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
