// Pieces shared by several admin pages: payment review, document list, signed downloads.
import { useMutation } from '@tanstack/react-query';
import { Download, Eye, FileText } from 'lucide-react';
import { useState } from 'react';
import { DOCUMENT_KIND_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_TYPE_LABELS, formatDate, type DocumentKind, type PaymentStatus, type PaymentType } from '@shared/constants';
import { centavosToInput, formatPHP } from '@shared/money';
import { api, errorMessage } from '@/lib/api';
import { requireSupabase } from '@/lib/supabase';
import { paymentTone } from '@/site/sections/TrackOrder';
import { Badge, Btn, Field, Modal, Notice, useToast } from '@/ui';
import { useInvalidate, type Row } from '../kit';

/** Short-lived signed URL for a private file. Works only for admins (storage RLS). */
export async function openPrivateFile(bucket: 'payment-proofs' | 'documents', path: string, downloadName?: string): Promise<void> {
  const { data, error } = await requireSupabase().storage.from(bucket).createSignedUrl(path, 120, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error('The file could not be opened.');
  window.open(data.signedUrl, '_blank', 'noopener');
}

export function PaymentSubmissionCard({ submission, order }: { submission: Row; order?: Row | null }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [dialog, setDialog] = useState<'verified' | 'rejected' | 'refunded' | null>(null);
  const [amount, setAmount] = useState(submission.amount_claimed_centavos ? centavosToInput(submission.amount_claimed_centavos) : '');
  const [note, setNote] = useState('');

  const view = useMutation({ mutationFn: () => openPrivateFile('payment-proofs', submission.proof_path), onError: (e) => toast(errorMessage(e), 'danger') });
  const review = useMutation({
    mutationFn: (decision: string) => api<{ receipt: { number: string } | null; email_sent: boolean }>('admin-action', { action: 'review_payment', submission_id: submission.id, decision, amount, note }, { auth: true }),
    onSuccess: async (data, decision) => {
      await invalidate('payment_submissions', 'orders', 'payment_transactions', 'documents', 'notifications', 'order_status_history');
      toast(decision === 'verified' ? `Payment verified${data.receipt ? ` · receipt ${data.receipt.number} issued` : ''}` : decision === 'rejected' ? 'Payment proof rejected' : decision === 'refunded' ? 'Payment marked as refunded' : 'Marked as under review');
      setDialog(null);
      setNote('');
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });
  const s = submission.status as PaymentStatus;
  const open = s === 'proof_submitted' || s === 'under_review';

  return (
    <div className="glass-soft p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {order && <p className="font-mono text-xs text-muted">{order.reference} · {order.customer_name}</p>}
          <p className="font-medium">{submission.method_name} · {PAYMENT_TYPE_LABELS[submission.payment_type as PaymentType]}</p>
          <p className="mt-0.5 text-sm text-muted [overflow-wrap:anywhere]">Ref <span className="font-mono text-ink">{submission.transaction_reference}</span> · {formatDate(submission.created_at, true)}</p>
          <p className="mt-0.5 text-sm text-muted">Declared: {submission.amount_claimed_centavos ? formatPHP(submission.amount_claimed_centavos) : 'not stated'}{submission.verified_amount_centavos ? ` · Verified: ${formatPHP(submission.verified_amount_centavos)}` : ''}</p>
          {submission.review_note && <p className="mt-1 text-sm text-ink/80">Note: {submission.review_note}</p>}
        </div>
        <Badge tone={paymentTone(s)}>{PAYMENT_STATUS_LABELS[s]}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn size="sm" variant="secondary" loading={view.isPending} onClick={() => view.mutate()}><Eye className="h-4 w-4" aria-hidden />View proof</Btn>
        {s === 'proof_submitted' && <Btn size="sm" variant="secondary" loading={review.isPending && review.variables === 'under_review'} onClick={() => review.mutate('under_review')}>Mark under review</Btn>}
        {open && <Btn size="sm" onClick={() => setDialog('verified')}>Approve…</Btn>}
        {open && <Btn size="sm" variant="danger" onClick={() => setDialog('rejected')}>Reject…</Btn>}
        {s === 'verified' && <Btn size="sm" variant="secondary" onClick={() => setDialog('refunded')}>Mark refunded…</Btn>}
      </div>

      <Modal open={dialog !== null} onClose={() => setDialog(null)} title={dialog === 'verified' ? 'Approve payment' : dialog === 'rejected' ? 'Reject payment proof' : 'Mark as refunded'}
        footer={<><Btn variant="secondary" onClick={() => setDialog(null)}>Cancel</Btn><Btn variant={dialog === 'verified' ? 'primary' : 'danger'} loading={review.isPending} disabled={dialog === 'verified' && !amount.trim()} onClick={() => review.mutate(dialog!)}>{dialog === 'verified' ? 'Verify payment' : dialog === 'rejected' ? 'Reject proof' : 'Confirm refund'}</Btn></>}>
        <div className="grid gap-4">
          {dialog === 'verified' && (
            <>
              <Notice tone="warn">Only approve after you have confirmed the money in your GCash, Maya or bank account. A screenshot alone is not proof.</Notice>
              <Field label="Amount actually received (₱)" required>{(p) => <input {...p} className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />}</Field>
            </>
          )}
          {dialog === 'refunded' && <Notice tone="warn">This records a refund of {formatPHP(submission.verified_amount_centavos ?? 0)} and reduces the order’s paid amount. Send the money back to the customer yourself first.</Notice>}
          <Field label={dialog === 'rejected' ? 'Reason (shown to the customer)' : 'Internal note (optional)'}>{(p) => <textarea {...p} className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />}</Field>
        </div>
      </Modal>
    </div>
  );
}

export function DocumentRow({ doc, showOrder }: { doc: Row; showOrder?: boolean }) {
  const toast = useToast();
  const open = useMutation({ mutationFn: () => openPrivateFile('documents', doc.storage_path, `${doc.number}.pdf`), onError: (e) => toast(errorMessage(e), 'danger') });
  return (
    <li className="glass-soft flex items-center gap-3 p-3">
      <FileText className="h-5 w-5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{DOCUMENT_KIND_LABELS[doc.kind as DocumentKind]} <span className="font-mono text-xs text-muted">{doc.number}</span></p>
        <p className="truncate text-xs text-muted">{showOrder && doc.orders ? `${doc.orders.reference} · ${doc.orders.customer_name} · ` : ''}{formatDate(doc.created_at, true)}{doc.amount_centavos !== null ? ` · ${formatPHP(doc.amount_centavos)}` : ''}{!doc.is_customer_visible && ' · internal only'}</p>
      </div>
      <Btn size="sm" variant="secondary" loading={open.isPending} onClick={() => open.mutate()} aria-label={`Download ${doc.number}`}><Download className="h-4 w-4" aria-hidden /></Btn>
    </li>
  );
}

export function useGenerateDocument(onDone?: () => void) {
  const invalidate = useInvalidate();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: Row) => api<{ document: { number: string; url: string } }>('admin-action', { action: 'generate_document', ...body }, { auth: true }),
    onSuccess: async ({ document }) => {
      await invalidate('documents');
      toast(`${document.number} created`);
      window.open(document.url, '_blank', 'noopener');
      onDone?.();
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });
}
