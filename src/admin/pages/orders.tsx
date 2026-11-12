import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, Link2, Mail, Phone, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, formatDate, type OrderStatus, type PaymentStatus } from '@shared/constants';
import { centavosToInput, formatPHP, parsePesos } from '@shared/money';
import { safeHref } from '@shared/site/schema';
import { api, errorMessage } from '@/lib/api';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { copyText } from '@/lib/utils';
import { orderTone, paymentTone } from '@/site/sections/TrackOrder';
import { Badge, Btn, EmptyState, Field, Glass, Notice, Spinner, useConfirm, useToast } from '@/ui';
import { DataTable, ExportButton, PageHeader, SearchBox, useInvalidate, useRows, type Row } from '../kit';
import { DocumentRow, PaymentSubmissionCard, useGenerateDocument } from './parts';

export const StatusBadge = ({ status }: { status: string }) => <Badge tone={orderTone(status)}>{ORDER_STATUS_LABELS[status as OrderStatus] ?? status}</Badge>;
export const PayBadge = ({ status }: { status: string }) => <Badge tone={paymentTone(status)}>{PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? status}</Badge>;

export function OrdersPage() {
  const navigate = useNavigate();
  const orders = useRows('orders', { order: ['created_at', false], select: '*, services(name)' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders.data ?? []).filter((o) =>
      (!status || o.status === status) && (!payment || o.payment_status === payment) &&
      (!q || [o.reference, o.customer_name, o.customer_email, o.customer_phone, o.project_name].some((v) => String(v).toLowerCase().includes(q))));
  }, [orders.data, search, status, payment]);
  return (
    <div>
      <PageHeader title="Orders" description="Every customer request, from first inquiry to completed project."
        actions={<ExportButton filename="orders.csv" rows={rows.map((o) => ({
          reference: o.reference, created: o.created_at, status: ORDER_STATUS_LABELS[o.status as OrderStatus], payment_status: PAYMENT_STATUS_LABELS[o.payment_status as PaymentStatus],
          customer: o.customer_name, email: o.customer_email, phone: o.customer_phone, facebook: o.customer_facebook, service: o.services?.name, project: o.project_name,
          subtotal_php: centavosToInput(o.subtotal_centavos), discount_php: centavosToInput(o.discount_centavos), estimate_php: centavosToInput(o.total_centavos),
          quoted_php: o.quoted_total_centavos === null ? '' : centavosToInput(o.quoted_total_centavos), paid_php: centavosToInput(o.amount_paid_centavos), deadline: o.deadline ?? '',
        }))} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search reference, name, email…" />
        <select className="field field-sm !w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}</select>
        <select className="field field-sm !w-auto" aria-label="Filter by payment status" value={payment} onChange={(e) => setPayment(e.target.value)}><option value="">All payments</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>)}</select>
      </div>
      {orders.isLoading ? <Spinner /> : orders.isError ? <Notice tone="danger">{errorMessage(orders.error)}</Notice> : (
        <DataTable rows={rows} onRowClick={(o) => navigate(`/admin/orders/${o.id}`)}
          empty={<EmptyState title="No orders found" text="Orders appear here as soon as customers submit the Start a Project form." />}
          columns={[
            { key: 'reference', label: 'Reference', render: (o) => <span className="font-mono text-xs font-semibold">{o.reference}</span> },
            { key: 'customer_name', label: 'Customer', render: (o) => <span><span className="block font-medium">{o.customer_name}</span><span className="block max-w-[14rem] truncate text-xs text-muted">{o.project_name}</span></span> },
            { key: 'service', label: 'Service', hideOnMobile: true, render: (o) => o.services?.name ?? '—' },
            { key: 'total', label: 'Total', render: (o) => formatPHP(o.quoted_total_centavos ?? o.total_centavos) },
            { key: 'status', label: 'Status', render: (o) => <StatusBadge status={o.status} /> },
            { key: 'payment_status', label: 'Payment', hideOnMobile: true, render: (o) => <PayBadge status={o.payment_status} /> },
            { key: 'created_at', label: 'Created', hideOnMobile: true, render: (o) => formatDate(o.created_at) },
          ]} />
      )}
    </div>
  );
}

const Info = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0"><dt className="text-xs uppercase tracking-wider text-muted">{label}</dt><dd className="mt-0.5 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{children || '—'}</dd></div>
);

export function OrderDetailPage() {
  const { id } = useParams();
  const supabase = requireSupabase();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();

  const order = useQuery({
    queryKey: ['admin', 'orders', 'detail', id],
    queryFn: async () => unwrap(await supabase.from('orders').select('*, services(name), customers(referral_code)').eq('id', id).maybeSingle()) as Row | null,
  });
  const byOrder = { filter: (q: any) => q.eq('order_id', id), key: [id] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const items = useRows('order_items', { ...byOrder, order: ['created_at', true] });
  const history = useRows('order_status_history', { ...byOrder, order: ['created_at', false] });
  const updates = useRows('order_updates', { ...byOrder, order: ['created_at', false] });
  const submissions = useRows('payment_submissions', { ...byOrder, order: ['created_at', false] });
  const transactions = useRows('payment_transactions', { ...byOrder, order: ['created_at', false] });
  const documents = useRows('documents', { ...byOrder, order: ['created_at', false] });

  const o = order.data;
  const [status, setStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [quote, setQuote] = useState({ total: '', deposit: '', deadline: '' });
  const [note, setNote] = useState('');
  const [notePublic, setNotePublic] = useState(false);
  const [link, setLink] = useState<{ url: string; expires_at: string; email_sent: boolean } | null>(null);

  useEffect(() => {
    if (!o) return;
    setStatus(o.status);
    setQuote({
      total: o.quoted_total_centavos === null ? '' : centavosToInput(o.quoted_total_centavos),
      deposit: o.deposit_due_centavos === null ? '' : centavosToInput(o.deposit_due_centavos),
      deadline: o.deadline ?? '',
    });
  }, [o]);

  const refresh = () => invalidate('orders', 'order_status_history', 'order_updates', 'projects', 'notifications');
  const onError = (e: unknown) => toast(errorMessage(e), 'danger');

  const saveStatus = useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('admin_set_order_status', { p_order_id: id, p_status: status, p_note: statusNote })),
    onSuccess: async () => { await refresh(); setStatusNote(''); toast('Status updated'); }, onError,
  });
  const saveQuote = useMutation({
    mutationFn: async () => {
      const total = quote.total.trim() === '' ? null : parsePesos(quote.total);
      const deposit = quote.deposit.trim() === '' ? null : parsePesos(quote.deposit);
      if ((quote.total.trim() !== '' && total === null) || (quote.deposit.trim() !== '' && deposit === null)) throw new Error('Enter valid peso amounts.');
      if (total !== null && deposit !== null && deposit > total) throw new Error('The deposit cannot be larger than the quoted total.');
      unwrap(await supabase.from('orders').update({ quoted_total_centavos: total, deposit_due_centavos: deposit, deadline: quote.deadline || null }).eq('id', id).select('id').single());
    },
    onSuccess: async () => { await refresh(); toast('Quotation details saved'); }, onError,
  });
  const addNote = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      unwrap(await supabase.from('order_updates').insert({ order_id: id, body: note.trim(), is_public: notePublic, created_by: data.user?.id }).select('id').single());
    },
    onSuccess: async () => { await invalidate('order_updates'); setNote(''); toast(notePublic ? 'Update posted to the customer' : 'Internal note added'); }, onError,
  });
  const tracking = useMutation({
    mutationFn: (send: boolean) => api<{ url: string; expires_at: string; email_sent: boolean; email_configured: boolean }>('admin-action', { action: 'tracking_link', order_id: id, send_email: send }, { auth: true }),
    onSuccess: (data, send) => { setLink(data); toast(send ? (data.email_sent ? 'Tracking link emailed to the customer' : 'Link created — email is not configured, copy it instead') : 'New tracking link created', send && !data.email_sent ? 'info' : 'success'); },
    onError,
  });
  const revoke = useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('admin_revoke_tracking_tokens', { p_order_id: id })),
    onSuccess: (n) => { setLink(null); toast(`${n} tracking link(s) revoked`); }, onError,
  });
  const remove = useMutation({
    mutationFn: async () => unwrap(await supabase.from('orders').delete().eq('id', id).select('id')),
    onSuccess: async () => { await refresh(); toast('Order deleted'); navigate('/admin/orders'); },
    onError: () => toast('Orders with verified payments cannot be deleted. Cancel the order instead.', 'danger'),
  });
  const generate = useGenerateDocument();

  if (order.isLoading) return <Spinner />;
  if (!o) return <EmptyState title="Order not found" action={<Link className="btn btn-sm btn-secondary" to="/admin/orders">Back to orders</Link>} />;

  const agreed = o.quoted_total_centavos ?? o.total_centavos;
  const balance = Math.max(agreed - o.amount_paid_centavos, 0);
  const fb = /^https?:\/\//i.test(o.customer_facebook) ? safeHref(o.customer_facebook) : null;

  return (
    <div>
      <Link to="/admin/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden />All orders</Link>
      <PageHeader title={o.reference} description={`${o.project_name} · created ${formatDate(o.created_at, true)}`}
        actions={<><StatusBadge status={o.status} /><PayBadge status={o.payment_status} /></>} />

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-5">
          <Glass className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Update status</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
              <Field label="Status">{(p) => <select {...p} className="field" value={status} onChange={(e) => setStatus(e.target.value)}>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}</select>}</Field>
              <Field label="Note for the history (optional)">{(p) => <input {...p} className="field" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} maxLength={500} />}</Field>
              <Btn loading={saveStatus.isPending} disabled={status === o.status} onClick={() => saveStatus.mutate()}>Update</Btn>
            </div>
            {['payment_verified'].includes(status) && status !== o.status && o.amount_paid_centavos === 0 && <Notice tone="warn" className="mt-3">No payment has been verified for this order yet. Verify payments from the payment proofs below instead of changing the status by hand.</Notice>}
          </Glass>

          <Glass className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Project requirements</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Service">{o.services?.name}</Info>
              <Info label="Budget range">{o.budget_range}</Info>
              <div className="sm:col-span-2"><Info label="Description">{o.project_description}</Info></div>
              <div className="sm:col-span-2"><Info label="Requested features">{o.requested_features}</Info></div>
              <Info label="Preferred design">{o.preferred_design}</Info>
              <Info label="Reference websites">{o.reference_websites}</Info>
              <Info label="Customer's target deadline">{o.target_deadline ? formatDate(o.target_deadline) : ''}</Info>
              <Info label="Additional notes">{o.additional_notes}</Info>
            </dl>
          </Glass>

          <Glass className="p-5">
            <h2 className="mb-1 text-lg font-semibold">Quotation &amp; deadline</h2>
            <p className="mb-4 text-sm text-muted">The original estimate is locked. Set the agreed price here after talking to the customer.</p>
            <ul className="mb-4 divide-y divide-white/10 text-sm">
              {(items.data ?? []).map((i) => <li key={i.id} className="flex justify-between gap-3 py-2"><span className="min-w-0">{i.name}{i.quantity > 1 && ` × ${i.quantity}`}</span><span>{formatPHP(i.total_centavos)}</span></li>)}
              <li className="flex justify-between gap-3 py-2 text-muted"><span>Subtotal</span><span>{formatPHP(o.subtotal_centavos)}</span></li>
              {o.discount_centavos > 0 && <li className="flex justify-between gap-3 py-2 text-muted"><span>Discount — {o.discount_label}</span><span>− {formatPHP(o.discount_centavos)}</span></li>}
              <li className="flex justify-between gap-3 py-2 font-semibold"><span>Estimate at order</span><span>{formatPHP(o.total_centavos)}</span></li>
            </ul>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Quoted total (₱)">{(p) => <input {...p} className="field" inputMode="decimal" value={quote.total} onChange={(e) => setQuote({ ...quote, total: e.target.value })} placeholder={centavosToInput(o.total_centavos)} />}</Field>
              <Field label="Deposit to start (₱)">{(p) => <input {...p} className="field" inputMode="decimal" value={quote.deposit} onChange={(e) => setQuote({ ...quote, deposit: e.target.value })} />}</Field>
              <Field label="Project deadline">{(p) => <input {...p} className="field" type="date" value={quote.deadline} onChange={(e) => setQuote({ ...quote, deadline: e.target.value })} />}</Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn loading={saveQuote.isPending} onClick={() => saveQuote.mutate()}>Save</Btn>
              <Btn variant="secondary" loading={generate.isPending && generate.variables?.kind === 'quotation'} onClick={() => generate.mutate({ order_id: id, kind: 'quotation' })}>Create quotation PDF</Btn>
              <Btn variant="secondary" loading={generate.isPending && generate.variables?.kind === 'invoice'} onClick={() => generate.mutate({ order_id: id, kind: 'invoice' })}>Create invoice PDF</Btn>
            </div>
            <p className="mt-2 text-xs text-muted">Save first — PDFs use the saved values. Contracts are created under Contracts.</p>
          </Glass>

          <Glass className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Payments</h2>
              <p className="text-sm text-muted">Verified {formatPHP(o.amount_paid_centavos)} of {formatPHP(agreed)} · balance <span className="font-semibold text-ink">{formatPHP(balance)}</span></p>
            </div>
            {(submissions.data ?? []).length === 0 ? <p className="text-sm text-muted">No payment proofs submitted yet.</p> : <div className="space-y-3">{submissions.data!.map((s) => <PaymentSubmissionCard key={`${s.id}:${s.status}`} submission={s} />)}</div>}
            {(transactions.data ?? []).length > 0 && (
              <>
                <h3 className="mb-2 mt-5 text-sm font-semibold">Verified ledger</h3>
                <ul className="divide-y divide-white/10 text-sm">
                  {transactions.data!.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{t.kind === 'refund' ? 'Refund' : 'Payment'} · {t.method_name} · <span className="font-mono text-xs">{t.transaction_reference}</span> · {formatDate(t.created_at, true)}</span>
                      <span className="flex items-center gap-2"><span className={t.kind === 'refund' ? 'text-rose-300' : 'text-emerald-300'}>{t.kind === 'refund' ? '− ' : '+ '}{formatPHP(t.amount_centavos)}</span>
                        {t.kind === 'payment' && !(documents.data ?? []).some((d) => d.payment_transaction_id === t.id) && <Btn size="sm" variant="secondary" loading={generate.isPending && generate.variables?.transaction_id === t.id} onClick={() => generate.mutate({ order_id: id, kind: 'receipt', transaction_id: t.id })}>Issue receipt</Btn>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Glass>

          <Glass className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Notes &amp; customer updates</h2>
            <Field label={notePublic ? 'Update for the customer (visible on their tracking page)' : 'Internal note (never shown to the customer)'}>{(p) => <textarea {...p} className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} />}</Field>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--dm-accent)]" checked={notePublic} onChange={(e) => setNotePublic(e.target.checked)} />Show this to the customer</label>
              <Btn size="sm" loading={addNote.isPending} disabled={!note.trim()} onClick={() => addNote.mutate()}>{notePublic ? 'Post update' : 'Add note'}</Btn>
            </div>
            <ul className="mt-4 space-y-2.5">
              {(updates.data ?? []).map((u) => (
                <li key={u.id} className="glass-soft p-3"><div className="mb-1 flex items-center gap-2"><Badge tone={u.is_public ? 'info' : 'neutral'}>{u.is_public ? 'Customer update' : 'Internal'}</Badge><span className="text-xs text-muted">{formatDate(u.created_at, true)}</span></div><p className="whitespace-pre-line text-sm">{u.body}</p></li>
              ))}
            </ul>
          </Glass>
        </div>

        <div className="min-w-0 space-y-5">
          <Glass className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Customer</h2>
            <p className="font-medium">{o.customer_name}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a className="flex items-center gap-2 hover:text-accent [overflow-wrap:anywhere]" href={`mailto:${o.customer_email}`}><Mail className="h-4 w-4 shrink-0 text-accent" aria-hidden />{o.customer_email}</a></li>
              <li><a className="flex items-center gap-2 hover:text-accent" href={`tel:${o.customer_phone}`}><Phone className="h-4 w-4 shrink-0 text-accent" aria-hidden />{o.customer_phone}</a></li>
              <li className="flex items-start gap-2 [overflow-wrap:anywhere]"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center text-xs font-bold text-accent" aria-hidden>f</span>{fb ? <a className="hover:text-accent" href={fb} target="_blank" rel="noopener noreferrer">{o.customer_facebook}</a> : o.customer_facebook}</li>
            </ul>
            <Link to={`/admin/customers?c=${o.customer_id}`} className="btn btn-sm btn-secondary mt-4">View customer record</Link>
          </Glass>

          <Glass className="p-5">
            <h2 className="mb-1 text-lg font-semibold">Tracking link</h2>
            <p className="mb-3 text-sm text-muted">Customers can only open their order with a private, expiring link. Create a new one if they lost it.</p>
            <div className="flex flex-wrap gap-2">
              <Btn size="sm" variant="secondary" loading={tracking.isPending && tracking.variables === false} onClick={() => tracking.mutate(false)}><Link2 className="h-4 w-4" aria-hidden />Create link</Btn>
              <Btn size="sm" variant="secondary" loading={tracking.isPending && tracking.variables === true} onClick={() => tracking.mutate(true)}><Mail className="h-4 w-4" aria-hidden />Create &amp; email</Btn>
              <Btn size="sm" variant="ghost" loading={revoke.isPending} onClick={async () => { if (await confirm('Revoke every tracking link for this order? The customer will need a new link.')) revoke.mutate(); }}>Revoke all</Btn>
            </div>
            {link && (
              <div className="mt-3"><p className="break-all rounded-xl bg-black/40 p-3 font-mono text-xs">{link.url}</p>
                <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-muted">Expires {formatDate(link.expires_at)}</span><Btn size="sm" variant="secondary" onClick={async () => toast((await copyText(link.url)) ? 'Link copied' : 'Copy failed', 'success')}><Copy className="h-4 w-4" aria-hidden />Copy</Btn></div>
              </div>
            )}
          </Glass>

          <Glass className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Documents</h2>
              <Btn size="sm" variant="ghost" loading={generate.isPending && generate.variables?.kind === 'order_summary'} onClick={() => generate.mutate({ order_id: id, kind: 'order_summary' })}>+ Order summary</Btn></div>
            {(documents.data ?? []).length === 0 ? <p className="text-sm text-muted">No documents yet.</p> : <ul className="space-y-2">{documents.data!.map((d) => <DocumentRow key={d.id} doc={d} />)}</ul>}
          </Glass>

          <Glass className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Status history</h2>
            <ol className="space-y-3">
              {(history.data ?? []).map((h) => (
                <li key={h.id} className="border-l-2 border-accent/50 pl-3 text-sm">
                  <p className="font-medium">{ORDER_STATUS_LABELS[h.to_status as OrderStatus] ?? h.to_status}</p>
                  <p className="text-xs text-muted">{formatDate(h.created_at, true)}{h.from_status && ` · from ${ORDER_STATUS_LABELS[h.from_status as OrderStatus]}`}</p>
                  {h.note && <p className="mt-0.5 text-xs text-ink/80">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Glass>

          <Btn variant="ghost" size="sm" className="text-rose-300" onClick={async () => { if (await confirm(`Delete order ${o.reference} permanently? This cannot be undone.`)) remove.mutate(); }}><Trash2 className="h-4 w-4" aria-hidden />Delete order</Btn>
        </div>
      </div>
      {confirmNode}
    </div>
  );
}
