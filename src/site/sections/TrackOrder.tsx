// Secure order tracking. Details are only ever loaded with a private, expiring token.
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, CircleDot, CreditCard, Download, FileText, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DOCUMENT_KIND_LABELS, ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_TYPE_LABELS, formatDate, type DocumentKind, type OrderStatus, type PaymentType } from '@shared/constants';
import { formatPHP } from '@shared/money';
import { api, ApiError, errorMessage } from '@/lib/api';
import { forgetOrder, loadSavedOrders } from '@/lib/savedOrders';
import { cx } from '@/lib/utils';
import { Badge, Btn, Field, Glass, Notice, Spinner } from '@/ui';
import { useSite } from '../SiteContext';
import { Turnstile } from '../Turnstile';

export interface TrackData {
  order: {
    reference: string; status: OrderStatus; status_label: string; status_description: string;
    payment_status: string; payment_status_label: string; project_name: string; service_name: string | null;
    customer_first_name: string; created_at: string; target_deadline: string | null; deadline: string | null;
    subtotal_centavos: number; discount_centavos: number; discount_label: string | null; estimate_centavos: number;
    quoted_total_centavos: number | null; deposit_due_centavos: number | null; amount_paid_centavos: number; balance_centavos: number;
  };
  items: { kind: string; name: string; quantity: number; total_centavos: number }[];
  history: { to_status: OrderStatus; created_at: string }[];
  project: { status: string; start_date: string | null; deadline: string | null } | null;
  milestones: { title: string; description: string; due_date: string | null; status: 'pending' | 'in_progress' | 'done' }[];
  updates: { body: string; created_at: string }[];
  payments: { id: string; method_name: string; payment_type: PaymentType; amount_claimed_centavos: number | null; verified_amount_centavos: number | null; transaction_reference: string; status: string; status_label: string; review_note: string; created_at: string }[];
  documents: { id: string; kind: DocumentKind; number: string; title: string; created_at: string }[];
  link_expires_at: string;
}

export function paymentTone(status: string): 'success' | 'danger' | 'warn' | 'info' | 'neutral' {
  return status === 'verified' ? 'success' : status === 'rejected' ? 'danger' : status === 'refunded' ? 'neutral' : status === 'awaiting_payment' ? 'warn' : 'info';
}
export function orderTone(status: string): 'success' | 'danger' | 'warn' | 'info' {
  return status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : ['pending_review', 'awaiting_deposit', 'awaiting_final_payment', 'awaiting_approval'].includes(status) ? 'warn' : 'info';
}
export function useTrackData(token: string | null) {
  return useQuery({
    queryKey: ['track', token], enabled: !!token, retry: false, staleTime: 15_000,
    queryFn: () => api<TrackData>('order-track', { action: 'view', token }),
  });
}

const FLOW = ORDER_STATUSES.filter((s) => s !== 'cancelled' && s !== 'revision');

function RequestLink() {
  const { site } = useSite();
  const started = useRef(Date.now());
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [captcha, setCaptcha] = useState('');
  const request = useMutation({
    mutationFn: () => api<{ message: string }>('order-track', { action: 'request_link', reference, email, antispam: { website: '', elapsed_ms: Date.now() - started.current, turnstile_token: captcha } }),
  });
  const fields = request.error instanceof ApiError ? request.error.fields ?? {} : {};
  return (
    <Glass className="p-6">
      <h2 className="text-xl font-semibold">Request a new tracking link</h2>
      <p className="mt-1.5 text-sm text-muted">{site.forms.track.requestHelp}</p>
      {request.isSuccess ? <Notice tone="info" className="mt-4">{request.data.message}</Notice> : (
        <form className="mt-5 grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
          <Field label="Order reference" required error={fields.reference}>{(p) => <input {...p} className="field font-mono uppercase" placeholder="DVM-2026-000001" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} maxLength={24} />}</Field>
          <Field label="Email used for the order" required error={fields.email}>{(p) => <input {...p} className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />}</Field>
          <Turnstile onToken={setCaptcha} />
          {request.isError && Object.keys(fields).length === 0 && <Notice tone="danger">{errorMessage(request.error)}</Notice>}
          <div><Btn type="submit" loading={request.isPending}>Send me a new link</Btn></div>
        </form>
      )}
    </Glass>
  );
}

export function TrackOrderSection() {
  const { site, editing } = useSite();
  const [params, setParams] = useSearchParams();
  const token = editing ? null : params.get('t');
  const [saved, setSaved] = useState(loadSavedOrders);
  const [paste, setPaste] = useState('');
  const track = useTrackData(token);
  const download = useMutation({
    mutationFn: (id: string) => api<{ url: string }>('order-track', { action: 'document', token, document_id: id }),
    onSuccess: ({ url }) => window.open(url, '_blank', 'noopener'),
  });

  if (!token) {
    const openPasted = () => {
      const m = /[?&]t=([A-Za-z0-9_-]{32,128})/.exec(paste) ?? /^([A-Za-z0-9_-]{32,128})$/.exec(paste.trim());
      if (m) setParams({ t: m[1] });
    };
    return (
      <div className="mx-auto grid max-w-4xl gap-6 text-left lg:grid-cols-2">
        <Glass className="p-6">
          <h2 className="text-xl font-semibold">Open your order</h2>
          <p className="mt-1.5 text-sm text-muted">{site.forms.track.intro}</p>
          <div className="mt-5 grid gap-3">
            <Field label="Paste your tracking link">{(p) => <input {...p} className="field" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://…/track-order?t=…" autoComplete="off" />}</Field>
            <div><Btn onClick={openPasted} disabled={!paste.trim()}>Open order</Btn></div>
          </div>
          {saved.length > 0 && (
            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="text-sm font-medium">Orders placed on this device</p>
              <ul className="mt-3 space-y-2">
                {saved.map((o) => (
                  <li key={o.reference} className="glass-soft flex items-center gap-3 p-3">
                    <a href={o.url} className="min-w-0 flex-1"><span className="block font-mono text-sm font-semibold">{o.reference}</span><span className="block truncate text-xs text-muted">{o.project} · {formatDate(o.created_at)}</span></a>
                    <button type="button" aria-label={`Remove ${o.reference} from this device`} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-ink" onClick={() => { forgetOrder(o.reference); setSaved(loadSavedOrders()); }}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Glass>
        <RequestLink />
      </div>
    );
  }

  if (track.isLoading) return <Spinner label="Loading your order" />;
  if (track.isError || !track.data) {
    return (
      <div className="mx-auto grid max-w-4xl gap-6 text-left lg:grid-cols-2">
        <Notice tone="danger" title="We could not open this order">{errorMessage(track.error)}<div className="mt-3"><Btn size="sm" variant="secondary" onClick={() => setParams({})}>Try another link</Btn></div></Notice>
        <RequestLink />
      </div>
    );
  }

  const { order, items, milestones, updates, payments, documents, history } = track.data;
  const reached = new Set(history.map((h) => h.to_status));
  const currentIndex = FLOW.indexOf(order.status as (typeof FLOW)[number]);
  const agreed = order.quoted_total_centavos ?? order.estimate_centavos;
  const canPay = order.status !== 'cancelled' && order.status !== 'completed';

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-left">
      <Glass className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">Hi {order.customer_first_name}, here is your order</p>
            <p className="font-mono text-2xl font-semibold tracking-wider">{order.reference}</p>
            <p className="mt-1 text-ink/85">{order.project_name}{order.service_name && <span className="text-muted"> · {order.service_name}</span>}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge tone={orderTone(order.status)} className="!px-3 !py-1 !text-sm">{order.status_label}</Badge>
            <Badge tone={paymentTone(order.payment_status)}>Payment: {order.payment_status_label}</Badge>
          </div>
        </div>
        <p className="mt-4 text-ink/85">{order.status_description}</p>
        {order.status === 'cancelled' ? null : (
          <ol className="scroll-thin mt-6 flex gap-2 overflow-x-auto pb-2" aria-label="Order progress">
            {FLOW.map((s, i) => {
              const done = i < currentIndex || (currentIndex === -1 && reached.has(s)) || order.status === 'completed';
              const current = s === order.status;
              return (
                <li key={s} className={cx('flex min-w-[8.5rem] flex-1 flex-col gap-2 rounded-2xl border p-3 text-xs', current ? 'border-accent bg-accent/15' : done ? 'border-white/15 bg-white/5' : 'border-white/10 opacity-55')} aria-current={current ? 'step' : undefined}>
                  <span className={cx('grid h-6 w-6 place-items-center rounded-full', done ? 'bg-accent text-white' : current ? 'bg-accent/30 text-ink' : 'bg-white/10')}>{done ? <Check className="h-3.5 w-3.5" aria-hidden /> : current ? <CircleDot className="h-3.5 w-3.5" aria-hidden /> : i + 1}</span>
                  <span className="font-medium leading-tight">{ORDER_STATUS_LABELS[s]}</span>
                </li>
              );
            })}
          </ol>
        )}
        {order.status === 'revision' && <Notice tone="info" className="mt-3">Your project is currently in revision.</Notice>}
        <p className="mt-4 text-xs text-muted">Ordered {formatDate(order.created_at, true)} · This private link expires {formatDate(track.data.link_expires_at)}</p>
      </Glass>

      <div className="grid gap-6 lg:grid-cols-2">
        <Glass className="p-6">
          <h2 className="text-lg font-semibold">Payment</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">{order.quoted_total_centavos !== null ? 'Quoted project total' : 'Estimated total'}</dt><dd className="font-semibold">{formatPHP(agreed)}</dd></div>
            {order.discount_centavos > 0 && <div className="flex justify-between gap-4"><dt className="text-muted">Discount applied{order.discount_label && ` (${order.discount_label})`}</dt><dd>− {formatPHP(order.discount_centavos)}</dd></div>}
            {order.deposit_due_centavos !== null && <div className="flex justify-between gap-4"><dt className="text-muted">Deposit to start</dt><dd>{formatPHP(order.deposit_due_centavos)}</dd></div>}
            <div className="flex justify-between gap-4"><dt className="text-muted">Verified payments</dt><dd className="text-emerald-300">{formatPHP(order.amount_paid_centavos)}</dd></div>
            <div className="flex justify-between gap-4 border-t border-white/10 pt-2 text-base"><dt>Remaining balance</dt><dd className="font-semibold">{formatPHP(order.balance_centavos)}</dd></div>
          </dl>
          {order.quoted_total_centavos === null && <p className="mt-3 text-xs text-muted">This is an estimate. Wait for your quotation before sending any payment.</p>}
          {canPay && <a href={`/payment?t=${token}`} className="btn btn-md btn-primary btn-style-gradient btn-hover-glow mt-5 w-full"><CreditCard className="h-4 w-4" aria-hidden />Pay / upload proof of payment</a>}
          {payments.length > 0 && (
            <ul className="mt-5 space-y-2.5">
              {payments.map((p) => (
                <li key={p.id} className="glass-soft p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{p.method_name} · {PAYMENT_TYPE_LABELS[p.payment_type]}</span><Badge tone={paymentTone(p.status)}>{p.status_label}</Badge></div>
                  <p className="mt-1 text-xs text-muted">Ref {p.transaction_reference} · {formatDate(p.created_at, true)}{p.verified_amount_centavos ? ` · Verified ${formatPHP(p.verified_amount_centavos)}` : p.amount_claimed_centavos ? ` · Declared ${formatPHP(p.amount_claimed_centavos)}` : ''}</p>
                  {p.review_note && <p className="mt-1.5 text-xs text-rose-200">Reason: {p.review_note}</p>}
                </li>
              ))}
            </ul>
          )}
        </Glass>

        <Glass className="p-6">
          <h2 className="text-lg font-semibold">Project milestones</h2>
          {milestones.length === 0 ? <p className="mt-4 text-sm text-muted">Milestones will appear here once development starts.</p> : (
            <ol className="mt-4 space-y-3">
              {milestones.map((m, i) => (
                <li key={i} className="flex gap-3">
                  <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs', m.status === 'done' ? 'bg-emerald-400/25 text-emerald-200' : m.status === 'in_progress' ? 'bg-accent/30 text-ink' : 'bg-white/10 text-muted')}>{m.status === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}</span>
                  <div className="min-w-0"><p className={cx('font-medium', m.status === 'done' && 'text-muted line-through')}>{m.title}</p>{m.description && <p className="text-sm text-muted">{m.description}</p>}<p className="text-xs text-muted">{m.status === 'in_progress' ? 'In progress' : m.status === 'done' ? 'Done' : 'Upcoming'}{m.due_date && ` · due ${formatDate(m.due_date)}`}</p></div>
                </li>
              ))}
            </ol>
          )}
          {(order.deadline || order.target_deadline) && <p className="mt-4 border-t border-white/10 pt-3 text-sm text-muted">{order.deadline ? `Agreed deadline: ${formatDate(order.deadline)}` : `Your target deadline: ${formatDate(order.target_deadline)}`}</p>}
        </Glass>

        <Glass className="p-6">
          <h2 className="text-lg font-semibold">Documents</h2>
          {documents.length === 0 ? <p className="mt-4 text-sm text-muted">No documents yet.</p> : (
            <ul className="mt-4 space-y-2">
              {documents.map((d) => (
                <li key={d.id} className="glass-soft flex items-center gap-3 p-3">
                  <FileText className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{DOCUMENT_KIND_LABELS[d.kind]}</p><p className="text-xs text-muted">{d.number} · {formatDate(d.created_at)}</p></div>
                  <Btn size="sm" variant="secondary" loading={download.isPending && download.variables === d.id} onClick={() => download.mutate(d.id)} aria-label={`Download ${d.title}`}><Download className="h-4 w-4" aria-hidden /></Btn>
                </li>
              ))}
            </ul>
          )}
          {download.isError && <Notice tone="danger" className="mt-3">{errorMessage(download.error)}</Notice>}
        </Glass>

        <Glass className="p-6">
          <h2 className="text-lg font-semibold">Updates</h2>
          {updates.length === 0 ? <p className="mt-4 text-sm text-muted">No updates yet. We will post progress here.</p> : (
            <ul className="mt-4 space-y-3">{updates.map((u, i) => <li key={i} className="glass-soft p-3"><p className="whitespace-pre-line text-sm">{u.body}</p><p className="mt-1.5 text-xs text-muted">{formatDate(u.created_at, true)}</p></li>)}</ul>
          )}
          <h3 className="mt-6 text-sm font-semibold">Order items</h3>
          <ul className="mt-2 space-y-1.5 text-sm">{items.map((it, i) => <li key={i} className="flex justify-between gap-3"><span className="min-w-0 text-ink/85">{it.name}</span><span className="shrink-0 text-muted">{formatPHP(it.total_centavos)}</span></li>)}</ul>
        </Glass>
      </div>
    </div>
  );
}
