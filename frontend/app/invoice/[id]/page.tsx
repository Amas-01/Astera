'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getInvoice,
  getInvoiceMetadata,
  getDisputeRecord,
  buildDisputeInvoiceTx,
  buildResolveDisputeTx,
  submitTx,
} from '@/lib/contracts';
import { formatUSDC, formatDate, daysUntil } from '@/lib/stellar';
import type { Invoice, InvoiceMetadata, DisputeRecord, DisputeResolution } from '@/lib/types';
import { useStore } from '@/lib/store';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { wallet } = useStore();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [metadata, setMetadata] = useState<InvoiceMetadata | null>(null);
  const [disputeRecord, setDisputeRecord] = useState<DisputeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dispute Modal State
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    try {
      const numId = parseInt(id, 10);
      const [inv, meta, dispute] = await Promise.all([
        getInvoice(numId),
        getInvoiceMetadata(numId),
        getDisputeRecord(numId),
      ]);
      setInvoice(inv);
      setMetadata(meta);
      setDisputeRecord(dispute);
    } catch (e) {
      setError('Invoice not found or contracts not deployed.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  async function handleDispute() {
    if (!disputeReason.trim()) return;
    setSubmitting(true);
    try {
      const xdr = await buildDisputeInvoiceTx({
        owner: wallet.address!,
        invoiceId: invoice!.id,
        reason: disputeReason,
      });
      await submitTx(xdr);
      setShowDisputeModal(false);
      await loadInvoice();
    } catch (e) {
      console.error(e);
      alert('Failed to file dispute.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(resolution: DisputeResolution) {
    setSubmitting(true);
    try {
      const xdr = await buildResolveDisputeTx({
        admin: wallet.address!,
        invoiceId: invoice!.id,
        resolution,
      });
      await submitTx(xdr);
      await loadInvoice();
    } catch (e) {
      console.error(e);
      alert('Failed to resolve dispute.');
    } finally {
      setSubmitting(false);
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

  if (error || !invoice || !metadata) {
    return (
      <div className="min-h-screen pt-24 px-6 flex flex-col items-center justify-center text-center">
        <p className="text-red-400 mb-4">{error ?? 'Invoice not found.'}</p>
        <Link href="/dashboard" className="text-brand-gold hover:underline text-sm">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const days = daysUntil(metadata.dueDate);
  const isOwner = wallet.address === invoice.owner;
  const isAdmin = wallet.address === 'GBAdmin...'; // Simplified or from store

  const timeline = [
    { label: 'Created', ts: invoice.createdAt, done: true },
    { label: 'Funded', ts: invoice.fundedAt, done: metadata.status !== 'Pending' },
    { label: 'Paid', ts: invoice.paidAt, done: metadata.status === 'Paid' },
  ];

  if (disputeRecord) {
    timeline.push({
      label: 'Dispute Filed',
      ts: disputeRecord.filedAt,
      done: true,
    });
    if (disputeRecord.resolution) {
      timeline.push({
        label: `Dispute ${disputeRecord.resolution}`,
        ts: disputeRecord.resolvedAt,
        done: true,
      });
    }
  }

  const isPendingDispute =
    metadata.status === 'Disputed' && disputeRecord && !disputeRecord.resolution;

  const isDisputeWindowOpen =
    metadata.status === 'Defaulted' &&
    invoice.defaultedAt > 0 &&
    Math.floor(Date.now() / 1000) < invoice.defaultedAt + 604800 &&
    !disputeRecord;

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
          {metadata.image ? (
            <div className="mb-6 rounded-xl overflow-hidden border border-brand-border bg-brand-dark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={metadata.image} alt="" className="w-full h-40 object-cover" />
            </div>
          ) : null}
          <div className="flex items-start justify-between mb-6 gap-4">
            <div className="min-w-0">
              <p className="text-xs text-brand-muted mb-1">
                {metadata.symbol} · Invoice #{invoice.id}
              </p>
              <h1 className="text-2xl font-bold">{metadata.name}</h1>
              <p className="text-brand-muted mt-1">{metadata.debtor}</p>
            </div>
            <span
              className={`text-sm font-medium px-3 py-1.5 rounded-full flex-shrink-0 badge-${metadata.status.toLowerCase()}`}
            >
              {metadata.status}
            </span>
          </div>

          <div className="text-4xl font-bold gradient-text mb-6">{formatUSDC(metadata.amount)}</div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-brand-muted mb-1">Due Date</p>
              <p className="font-medium">{formatDate(metadata.dueDate)}</p>
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
            {metadata.description && (
              <div className="col-span-2">
                <p className="text-brand-muted mb-1">Description</p>
                <p className="text-sm">{metadata.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Dispute Details if any */}
        {disputeRecord && (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl mb-6">
            <h3 className="text-red-400 font-semibold mb-2">
              {disputeRecord.resolution ? `Dispute ${disputeRecord.resolution}` : 'Dispute Filed'}
            </h3>
            <p className="text-sm text-brand-muted mb-4 italic">
              &quot;{disputeRecord.reason}&quot;
            </p>
            {isPendingDispute && isAdmin && (
              <div className="flex gap-3">
                <button
                  onClick={() => handleResolve('Upheld')}
                  disabled={submitting}
                  className="bg-brand-gold text-brand-dark px-4 py-2 rounded-lg text-sm font-bold hover:bg-white transition-colors"
                >
                  Uphold Dispute
                </button>
                <button
                  onClick={() => handleResolve('Rejected')}
                  disabled={submitting}
                  className="border border-brand-border px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand-border transition-colors text-white"
                >
                  Reject Dispute
                </button>
              </div>
            )}
            {isPendingDispute && !isAdmin && (
              <div className="text-xs font-bold text-yellow-500 bg-yellow-500/10 px-3 py-1.5 rounded-lg w-fit">
                Dispute Pending Resolution
              </div>
            )}
          </div>
        )}

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
        {isOwner && isDisputeWindowOpen && (
          <button
            onClick={() => setShowDisputeModal(true)}
            className="w-full py-4 bg-brand-dark border border-red-500/50 text-red-500 rounded-2xl font-bold hover:bg-red-500/10 transition-colors mb-6"
          >
            File Dispute
          </button>
        )}

        {isOwner && metadata.status === 'Pending' && (
          <div className="p-4 bg-brand-gold/10 border border-brand-gold/20 rounded-xl text-sm text-brand-muted">
            Your invoice is pending review. Once approved, the pool will fund it and USDC will be
            sent to your wallet.
          </div>
        )}
      </div>

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-brand-dark/80 backdrop-blur-sm">
          <div className="bg-brand-card border border-brand-border rounded-3xl p-8 max-w-lg w-full">
            <h2 className="text-2xl font-bold mb-2">File Dispute</h2>
            <p className="text-brand-muted text-sm mb-6">
              Explain why this default is incorrect (e.g., payment was sent off-chain).
            </p>

            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Enter dispute reason..."
              className="w-full h-32 bg-brand-dark border border-brand-border rounded-xl p-4 text-white focus:outline-none focus:border-brand-gold transition-colors mb-6"
            />

            <div className="flex gap-4">
              <button
                onClick={() => setShowDisputeModal(false)}
                className="flex-1 py-3 border border-brand-border rounded-xl font-bold hover:bg-brand-border transition-colors"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={handleDispute}
                disabled={submitting || !disputeReason.trim()}
                className="flex-1 py-3 bg-brand-gold text-brand-dark rounded-xl font-bold hover:bg-white transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
