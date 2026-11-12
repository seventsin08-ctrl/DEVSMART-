// Customers, projects, payments, receipts, contracts and the media library.
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Download, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DOCUMENT_KIND_LABELS, formatDate, type DocumentKind } from '@shared/constants';
import { centavosToInput, formatPHP } from '@shared/money';
import { DEFAULT_CONTRACT_TERMS } from '@shared/contract';
import { errorMessage } from '@/lib/api';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { copyText, cx } from '@/lib/utils';
import { Badge, Btn, EmptyState, Field, Glass, Modal, Notice, Spinner, Tabs, useConfirm, useToast } from '@/ui';
import { DataTable, ExportButton, PageHeader, ResourceList, SearchBox, uploadMedia, useInvalidate, useRows, type MediaKind, type ResourceConfig, type Row } from '../kit';
import { StatusBadge } from './orders';
import { DocumentRow, PaymentSubmissionCard, useGenerateDocument } from './parts';

// ───────── Customers ─────────
function CustomerDrawer({ customer, onClose }: { customer: Row; onClose: () => void }) {
  const supabase = requireSupabase();
  const invalidate = useInvalidate();
  const toast = useToast();
  const byCustomer = { filter: (q: any) => q.eq('customer_id', customer.id), key: [customer.id] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const orders = useRows('orders', { ...byCustomer, order: ['created_at', false] });
  const projects = useRows('projects', { ...byCustomer, order: ['created_at', false] });
  const loyalty = useRows('loyalty_accounts', byCustomer);
  const account = loyalty.data?.[0];
  const ledger = useRows('loyalty_transactions', { filter: (q) => q.eq('account_id', account?.id), key: [account?.id], enabled: !!account, order: ['created_at', false] });
  const orderIds = (orders.data ?? []).map((o) => o.id);
  const payments = useRows('payment_transactions', { filter: (q) => q.in('order_id', orderIds), key: [orderIds.join(',')], enabled: orderIds.length > 0, order: ['created_at', false] });
  const [notes, setNotes] = useState<string>(customer.notes ?? '');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');

  const saveNotes = useMutation({
    mutationFn: async () => unwrap(await supabase.from('customers').update({ notes }).eq('id', customer.id).select('id').single()),
    onSuccess: async () => { await invalidate('customers'); toast('Notes saved'); },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });
  const adjust = useMutation({
    mutationFn: async () => {
      if (!/^-?\d{1,7}$/.test(points.trim()) || Number(points) === 0) throw new Error('Enter a whole number of points, e.g. 50 or -20.');
      unwrap(await supabase.rpc('admin_adjust_loyalty', { p_customer_id: customer.id, p_points: Number(points), p_reason: reason }));
    },
    onSuccess: async () => { await invalidate('loyalty_accounts', 'loyalty_transactions'); setPoints(''); setReason(''); toast('Loyalty points updated'); },
    onError: (e) => toast(/points_balance/.test(errorMessage(e)) ? 'The balance cannot go below zero.' : errorMessage(e), 'danger'),
  });
  const verifiedTotal = (payments.data ?? []).reduce((s, t) => s + (t.kind === 'payment' ? t.amount_centavos : -t.amount_centavos), 0);

  return (
    <Modal open onClose={onClose} title={customer.full_name} side>
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 [overflow-wrap:anywhere]"><dt className="text-xs uppercase tracking-wider text-muted">Email</dt><dd><a className="hover:text-accent" href={`mailto:${customer.email}`}>{customer.email}</a></dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted">Phone</dt><dd><a className="hover:text-accent" href={`tel:${customer.phone}`}>{customer.phone || '—'}</a></dd></div>
          <div className="[overflow-wrap:anywhere]"><dt className="text-xs uppercase tracking-wider text-muted">Facebook</dt><dd>{customer.facebook_contact || '—'}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted">Customer since</dt><dd>{formatDate(customer.created_at)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted">Referral code</dt><dd className="flex items-center gap-2 font-mono">{customer.referral_code}<button type="button" aria-label="Copy referral code" className="text-muted hover:text-ink" onClick={async () => toast((await copyText(customer.referral_code)) ? 'Copied' : 'Copy failed')}><Copy className="h-3.5 w-3.5" /></button></dd></div>
        </dl>

        <div>
          <h3 className="mb-2 font-semibold">Customer notes</h3>
          <textarea className="field" aria-label="Customer notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
          <Btn size="sm" className="mt-2" loading={saveNotes.isPending} disabled={notes === (customer.notes ?? '')} onClick={() => saveNotes.mutate()}>Save notes</Btn>
        </div>

        <div>
          <h3 className="mb-2 font-semibold">Order history ({orders.data?.length ?? 0})</h3>
          {orders.isLoading ? <Spinner /> : (
            <ul className="space-y-2">
              {(orders.data ?? []).map((o) => (
                <li key={o.id}><Link to={`/admin/orders/${o.id}`} onClick={onClose} className="glass-soft flex flex-wrap items-center justify-between gap-2 p-3 hover:!border-accent/60">
                  <span className="min-w-0"><span className="block font-mono text-xs font-semibold">{o.reference}</span><span className="block truncate text-sm">{o.project_name}</span></span>
                  <span className="flex items-center gap-2"><span className="text-sm">{formatPHP(o.quoted_total_centavos ?? o.total_centavos)}</span><StatusBadge status={o.status} /></span>
                </Link></li>
              ))}
            </ul>
          )}
        </div>

        {(projects.data ?? []).length > 0 && (
          <div>
            <h3 className="mb-2 font-semibold">Project history</h3>
            <ul className="space-y-1.5 text-sm">{projects.data!.map((p) => <li key={p.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{p.name}</span><span className="shrink-0 capitalize text-muted">{String(p.status).replace('_', ' ')}{p.deadline && ` · due ${formatDate(p.deadline)}`}</span></li>)}</ul>
          </div>
        )}

        <div>
          <h3 className="mb-2 font-semibold">Verified payments <span className="font-normal text-muted">· {formatPHP(verifiedTotal)} total</span></h3>
          {(payments.data ?? []).length === 0 ? <p className="text-sm text-muted">No verified payments yet.</p> : (
            <ul className="divide-y divide-white/10 text-sm">{payments.data!.map((t) => <li key={t.id} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{formatDate(t.created_at)} · {t.method_name} · <span className="font-mono text-xs">{t.transaction_reference}</span></span><span className={t.kind === 'refund' ? 'text-rose-300' : 'text-emerald-300'}>{t.kind === 'refund' ? '− ' : '+ '}{formatPHP(t.amount_centavos)}</span></li>)}</ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 font-semibold">Loyalty <span className="font-normal text-muted">· {account?.points_balance ?? 0} points (lifetime {account?.lifetime_points ?? 0})</span></h3>
          <div className="grid grid-cols-[6rem_1fr_auto] items-end gap-2">
            <Field label="Points">{(p) => <input {...p} className="field field-sm" inputMode="numeric" placeholder="+50" value={points} onChange={(e) => setPoints(e.target.value)} />}</Field>
            <Field label="Reason">{(p) => <input {...p} className="field field-sm" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}</Field>
            <Btn size="sm" loading={adjust.isPending} disabled={!points.trim()} onClick={() => adjust.mutate()}>Apply</Btn>
          </div>
          <ul className="mt-3 space-y-1 text-sm">{(ledger.data ?? []).slice(0, 12).map((l) => <li key={l.id} className="flex justify-between gap-3"><span className="min-w-0 truncate text-muted">{formatDate(l.created_at)} · {l.reason}</span><span className={l.points < 0 ? 'text-rose-300' : 'text-emerald-300'}>{l.points > 0 ? '+' : ''}{l.points}</span></li>)}</ul>
        </div>
      </div>
    </Modal>
  );
}

export function CustomersPage() {
  const customers = useRows('customers', { order: ['created_at', false], select: '*, orders(id, status, amount_paid_centavos), loyalty_accounts(points_balance)' });
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'paying' | 'repeat' | 'new'>('all');
  const enriched = useMemo<Row[]>(() => (customers.data ?? []).map((c) => {
    const orders = (c.orders ?? []) as Row[];
    const acct = Array.isArray(c.loyalty_accounts) ? c.loyalty_accounts[0] : c.loyalty_accounts;
    return { ...c, order_count: orders.length, paid: orders.reduce((s, o) => s + o.amount_paid_centavos, 0), points: acct?.points_balance ?? 0 };
  }), [customers.data]);
  const rows = enriched.filter((c) => {
    const q = search.trim().toLowerCase();
    if (q && ![c.full_name, c.email, c.phone, c.facebook_contact, c.referral_code].some((v) => String(v).toLowerCase().includes(q))) return false;
    return filter === 'all' || (filter === 'paying' && c.paid > 0) || (filter === 'repeat' && c.order_count > 1) || (filter === 'new' && c.order_count <= 1);
  });
  const selected = enriched.find((c) => c.id === params.get('c'));
  return (
    <div>
      <PageHeader title="Customers" description="Contact details and history for everyone who has placed an order. Handle this personal data with care."
        actions={<ExportButton filename="customers.csv" rows={rows.map((c) => ({ name: c.full_name, email: c.email, phone: c.phone, facebook: c.facebook_contact, orders: c.order_count, verified_paid_php: centavosToInput(c.paid), loyalty_points: c.points, referral_code: c.referral_code, customer_since: c.created_at, notes: c.notes }))} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, email, phone…" />
        <select className="field field-sm !w-auto" aria-label="Filter customers" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All customers</option><option value="paying">With verified payments</option><option value="repeat">Repeat customers</option><option value="new">Single order</option>
        </select>
      </div>
      {customers.isLoading ? <Spinner /> : customers.isError ? <Notice tone="danger">{errorMessage(customers.error)}</Notice> : (
        <DataTable rows={rows} onRowClick={(c) => setParams({ c: c.id })} empty={<EmptyState title="No customers yet" text="Customers are created automatically when an order is submitted." />}
          columns={[
            { key: 'full_name', label: 'Customer', render: (c) => <span><span className="block font-medium">{c.full_name}</span><span className="block text-xs text-muted">{c.email}</span></span> },
            { key: 'phone', label: 'Phone', hideOnMobile: true },
            { key: 'order_count', label: 'Orders' },
            { key: 'paid', label: 'Verified paid', render: (c) => formatPHP(c.paid) },
            { key: 'points', label: 'Points', hideOnMobile: true },
            { key: 'created_at', label: 'Since', hideOnMobile: true, render: (c) => formatDate(c.created_at) },
          ]} />
      )}
      {selected && <CustomerDrawer key={selected.id} customer={selected} onClose={() => setParams({})} />}
    </div>
  );
}

// ───────── Projects ─────────
const PROJECT_STATUSES = ['planning', 'in_progress', 'review', 'on_hold', 'completed', 'cancelled'];
const label = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function ProjectCard({ project }: { project: Row }) {
  const supabase = requireSupabase();
  const invalidate = useInvalidate();
  const toast = useToast();
  const milestones = useRows('project_milestones', { filter: (q) => q.eq('project_id', project.id), key: [project.id], order: ['sort_order', true] });
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const onError = (e: unknown) => toast(errorMessage(e), 'danger');
  const done = () => invalidate('project_milestones', 'projects');

  const update = useMutation({ mutationFn: async (patch: Row) => unwrap(await supabase.from('projects').update(patch).eq('id', project.id).select('id').single()), onSuccess: done, onError });
  const patchMilestone = useMutation({ mutationFn: async ({ id, patch }: { id: string; patch: Row }) => unwrap(await supabase.from('project_milestones').update(patch).eq('id', id).select('id').single()), onSuccess: done, onError });
  const addMilestone = useMutation({
    mutationFn: async () => unwrap(await supabase.from('project_milestones').insert({ project_id: project.id, title: title.trim(), due_date: due || null, sort_order: (milestones.data?.length ?? 0) + 1 }).select('id').single()),
    onSuccess: async () => { await done(); setTitle(''); setDue(''); }, onError,
  });
  const removeMilestone = useMutation({ mutationFn: async (id: string) => unwrap(await supabase.from('project_milestones').delete().eq('id', id).select('id')), onSuccess: done, onError });

  const list = milestones.data ?? [];
  const completed = list.filter((m) => m.status === 'done').length;
  const overdue = project.deadline && !['completed', 'cancelled'].includes(project.status) && new Date(`${project.deadline}T23:59:59+08:00`) < new Date();
  return (
    <Glass className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{project.name}</h2>
          <p className="text-sm text-muted"><Link className="font-mono hover:text-accent" to={`/admin/orders/${project.order_id}`}>{project.orders?.reference}</Link> · {project.orders?.customer_name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {overdue && <Badge tone="danger">Overdue</Badge>}
          <select className="field field-sm !w-auto" aria-label="Project status" value={project.status} onChange={(e) => update.mutate({ status: e.target.value, completed_at: e.target.value === 'completed' ? new Date().toISOString() : null })}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          <input className="field field-sm !w-auto" type="date" aria-label="Project deadline" value={project.deadline ?? ''} onChange={(e) => update.mutate({ deadline: e.target.value || null })} />
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={completed} aria-label="Milestones completed"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${list.length ? (completed / list.length) * 100 : 0}%` }} /></div>
      <p className="mt-1.5 text-xs text-muted">{completed} of {list.length} milestones done</p>
      <ul className="mt-3 space-y-2">
        {list.map((m) => (
          <li key={m.id} className="glass-soft flex flex-wrap items-center gap-2 p-2.5">
            <button type="button" aria-label={m.status === 'done' ? 'Mark as not done' : 'Mark as done'} onClick={() => patchMilestone.mutate({ id: m.id, patch: { status: m.status === 'done' ? 'pending' : 'done', completed_at: m.status === 'done' ? null : new Date().toISOString() } })}
              className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full border', m.status === 'done' ? 'border-emerald-400 bg-emerald-400/30 text-emerald-200' : 'border-white/30')}>{m.status === 'done' && <Check className="h-3.5 w-3.5" />}</button>
            <span className={cx('min-w-0 flex-1 text-sm', m.status === 'done' && 'text-muted line-through')}>{m.title}</span>
            <select className="field field-sm !min-h-8 !w-auto !py-1 text-xs" aria-label={`Status of ${m.title}`} value={m.status} onChange={(e) => patchMilestone.mutate({ id: m.id, patch: { status: e.target.value, completed_at: e.target.value === 'done' ? new Date().toISOString() : null } })}><option value="pending">Upcoming</option><option value="in_progress">In progress</option><option value="done">Done</option></select>
            <input className="field field-sm !min-h-8 !w-auto !py-1 text-xs" type="date" aria-label={`Due date of ${m.title}`} value={m.due_date ?? ''} onChange={(e) => patchMilestone.mutate({ id: m.id, patch: { due_date: e.target.value || null } })} />
            <label className="flex items-center gap-1 text-xs text-muted" title="Show on the customer's tracking page"><input type="checkbox" className="accent-[var(--dm-accent)]" checked={m.is_public} onChange={(e) => patchMilestone.mutate({ id: m.id, patch: { is_public: e.target.checked } })} />Public</label>
            <button type="button" aria-label={`Delete ${m.title}`} className="grid h-7 w-7 place-items-center rounded-full text-rose-300 hover:bg-rose-400/15" onClick={() => removeMilestone.mutate(m.id)}><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) addMilestone.mutate(); }}>
        <input className="field field-sm min-w-0 flex-1" aria-label="New milestone title" placeholder="Add a milestone…" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <input className="field field-sm !w-auto" type="date" aria-label="New milestone due date" value={due} onChange={(e) => setDue(e.target.value)} />
        <Btn size="sm" type="submit" variant="secondary" loading={addMilestone.isPending} disabled={!title.trim()}><Plus className="h-4 w-4" aria-hidden />Add</Btn>
      </form>
    </Glass>
  );
}

export function ProjectsPage() {
  const projects = useRows('projects', { select: '*, orders(reference, customer_name)', order: ['created_at', false] });
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const list = (projects.data ?? []).filter((p) => (tab === 'active') !== ['completed', 'cancelled'].includes(p.status));
  return (
    <div>
      <PageHeader title="Projects" description="A project is created automatically when an order moves to In Development. Public milestones appear on the customer's tracking page." />
      <Tabs className="mb-5 w-fit" value={tab} onChange={setTab} tabs={[{ id: 'active', label: 'Active' }, { id: 'done', label: 'Completed & cancelled' }]} />
      {projects.isLoading ? <Spinner /> : list.length === 0 ? <EmptyState title={tab === 'active' ? 'No active projects' : 'Nothing here yet'} text="Set an order's status to In Development to start its project." /> : <div className="grid gap-5 2xl:grid-cols-2">{list.map((p) => <ProjectCard key={p.id} project={p} />)}</div>}
    </div>
  );
}

// ───────── Payments ─────────
export function PaymentsPage() {
  const [tab, setTab] = useState<'review' | 'history' | 'methods'>('review');
  const submissions = useRows('payment_submissions', { select: '*, orders(reference, customer_name)', order: ['created_at', false] });
  const pending = (submissions.data ?? []).filter((s) => ['proof_submitted', 'under_review'].includes(s.status));
  const reviewed = (submissions.data ?? []).filter((s) => !['proof_submitted', 'under_review'].includes(s.status));
  const methods: ResourceConfig = {
    table: 'payment_methods', singular: 'Payment method', reorderable: true,
    columns: [
      { key: 'name', label: 'Method', render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'account_holder', label: 'Account name', hideOnMobile: true, render: (r) => r.account_holder || <span className="text-amber-300">Not set</span> },
      { key: 'account_number', label: 'Account number', render: (r) => (r.account_number ? <span className="font-mono text-xs">{r.account_number}</span> : <span className="text-amber-300">Not set</span>) },
      { key: 'qr', label: 'QR', hideOnMobile: true, render: (r) => (r.qr_image_url ? <img src={r.qr_image_url} alt="" className="h-9 w-9 rounded bg-white object-contain" /> : '—') },
      { key: 'is_active', label: 'Status', render: (r) => (r.is_active ? <Badge tone="success">Available</Badge> : <Badge tone="warn">Hidden</Badge>) },
    ],
    fields: [
      { key: 'name', label: 'Payment method name', type: 'text', required: true, half: true },
      { key: 'kind', label: 'Type', type: 'select', half: true, options: [{ value: 'gcash', label: 'GCash' }, { value: 'maya', label: 'Maya' }, { value: 'bank', label: 'Bank transfer' }, { value: 'custom', label: 'Custom / other' }] },
      { key: 'account_holder', label: 'Account holder', type: 'text', half: true },
      { key: 'account_number', label: 'Account / mobile number', type: 'text', half: true },
      { key: 'qr_image_url', label: 'QR code image', type: 'image', nullable: true, mediaKind: 'qr' },
      { key: 'instructions', label: 'Payment instructions', type: 'textarea' },
      { key: 'is_active', label: 'Available to customers', type: 'bool', hint: 'Only enable once the account details are correct.' },
    ],
    defaults: { name: '', kind: 'custom', account_holder: '', account_number: '', qr_image_url: null, instructions: '', is_active: false },
    transform: (p) => {
      if (p.is_active && !p.account_number && !p.qr_image_url) throw new Error('Add an account number or a QR code before making this method available.');
      return p;
    },
  };
  return (
    <div>
      <PageHeader title="Payments" description="Review payment proofs and manage the payment methods shown to customers. Payments are never verified automatically." />
      <Tabs className="mb-5 w-fit" value={tab} onChange={setTab} tabs={[{ id: 'review', label: 'To review', count: pending.length }, { id: 'history', label: 'Reviewed' }, { id: 'methods', label: 'Payment methods' }]} />
      {tab === 'methods' ? <ResourceList config={methods} /> : submissions.isLoading ? <Spinner /> : (
        (tab === 'review' ? pending : reviewed).length === 0
          ? <EmptyState title={tab === 'review' ? 'No payments waiting for review' : 'No reviewed payments yet'} />
          : <div className="grid gap-3 xl:grid-cols-2">{(tab === 'review' ? pending : reviewed).map((s) => <PaymentSubmissionCard key={`${s.id}:${s.status}`} submission={s} order={s.orders} />)}</div>
      )}
    </div>
  );
}

// ───────── Receipts & contracts ─────────
function DocumentsList({ kinds }: { kinds: DocumentKind[] }) {
  const docs = useRows('documents', { select: '*, orders(reference, customer_name)', order: ['created_at', false], filter: (q) => q.in('kind', kinds), key: [kinds.join()] });
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const rows = (docs.data ?? []).filter((d) => (!kind || d.kind === kind) && (!search.trim() || [d.number, d.orders?.reference, d.orders?.customer_name].some((v) => String(v ?? '').toLowerCase().includes(search.trim().toLowerCase()))));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search number, order, customer…" />
        <select className="field field-sm !w-auto" aria-label="Filter by document type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option>{kinds.map((k) => <option key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</option>)}</select>
        <ExportButton filename="documents.csv" rows={rows.map((d) => ({ number: d.number, type: DOCUMENT_KIND_LABELS[d.kind as DocumentKind], order: d.orders?.reference, customer: d.orders?.customer_name, amount_php: d.amount_centavos === null ? '' : centavosToInput(d.amount_centavos), created: d.created_at }))} />
      </div>
      {docs.isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No documents yet" /> : <ul className="grid gap-2 xl:grid-cols-2">{rows.map((d) => <DocumentRow key={d.id} doc={d} showOrder />)}</ul>}
    </div>
  );
}

export function ReceiptsPage() {
  const transactions = useRows('payment_transactions', { select: '*, orders(reference, customer_name)', order: ['created_at', false], filter: (q) => q.eq('kind', 'payment'), key: ['payments'] });
  const receipts = useRows('documents', { filter: (q) => q.eq('kind', 'receipt'), key: ['receipts-only'], select: 'payment_transaction_id' });
  const generate = useGenerateDocument();
  const issued = new Set((receipts.data ?? []).map((r) => r.payment_transaction_id));
  const missing = (transactions.data ?? []).filter((t) => !issued.has(t.id));
  return (
    <div>
      <PageHeader title="Receipts" description="Official receipts exist only for verified payments. Acknowledgments confirm a proof was received and are clearly marked as not being receipts." />
      {missing.length > 0 && (
        <Glass className="mb-6 p-5">
          <h2 className="mb-3 font-semibold">Verified payments without a receipt</h2>
          <ul className="divide-y divide-white/10 text-sm">
            {missing.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-mono text-xs">{t.orders?.reference}</span> · {t.orders?.customer_name} · {formatPHP(t.amount_centavos)} · {formatDate(t.created_at)}</span>
                <Btn size="sm" variant="secondary" loading={generate.isPending && generate.variables?.transaction_id === t.id} onClick={() => generate.mutate({ order_id: t.order_id, kind: 'receipt', transaction_id: t.id })}>Issue receipt</Btn>
              </li>
            ))}
          </ul>
        </Glass>
      )}
      <DocumentsList kinds={['receipt', 'payment_acknowledgment', 'invoice', 'order_summary']} />
    </div>
  );
}

export function ContractsPage() {
  const orders = useRows('orders', { order: ['created_at', false], select: 'id, reference, customer_name, project_name, status' });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ order_id: '', kind: 'contract', terms: DEFAULT_CONTRACT_TERMS, notes: '', valid_days: '15', customer_visible: true });
  const generate = useGenerateDocument(() => setOpen(false));
  const active = (orders.data ?? []).filter((o) => o.status !== 'cancelled');
  return (
    <div>
      <PageHeader title="Contracts" description="Create quotations and service agreements as branded PDFs. Copies are stored privately and can be shared on the customer's tracking page."
        actions={<Btn size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />New document</Btn>} />
      <DocumentsList kinds={['contract', 'quotation']} />
      <Modal open={open} onClose={() => setOpen(false)} title="New quotation or contract" wide
        footer={<><Btn variant="secondary" onClick={() => setOpen(false)}>Cancel</Btn><Btn loading={generate.isPending} disabled={!form.order_id} onClick={() => generate.mutate({ order_id: form.order_id, kind: form.kind, terms: form.kind === 'contract' ? form.terms : '', notes: form.notes, valid_days: Number(form.valid_days) || 15, customer_visible: form.customer_visible })}>Generate PDF</Btn></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Order" required className="sm:col-span-2">{(p) => <select {...p} className="field" value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}><option value="">Choose an order</option>{active.map((o) => <option key={o.id} value={o.id}>{o.reference} — {o.customer_name} — {o.project_name}</option>)}</select>}</Field>
          <Field label="Document type">{(p) => <select {...p} className="field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="contract">Service agreement (contract)</option><option value="quotation">Quotation</option></select>}</Field>
          {form.kind === 'quotation' && <Field label="Valid for (days)">{(p) => <input {...p} className="field" inputMode="numeric" value={form.valid_days} onChange={(e) => setForm({ ...form, valid_days: e.target.value.replace(/\D/g, '').slice(0, 3) })} />}</Field>}
          {form.kind === 'contract' && <Field label="Terms and conditions" className="sm:col-span-2" hint="Edit freely. Have a lawyer review your standard terms.">{(p) => <textarea {...p} className="field !min-h-[220px] text-sm" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} maxLength={12000} />}</Field>}
          <Field label="Notes (optional)" className="sm:col-span-2">{(p) => <textarea {...p} className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={4000} />}</Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[var(--dm-accent)]" checked={form.customer_visible} onChange={(e) => setForm({ ...form, customer_visible: e.target.checked })} />Show on the customer's tracking page</label>
        </div>
        <Notice tone="info" className="mt-4">Prices come from the order: set the quoted total, deposit and deadline on the order page first.</Notice>
      </Modal>
    </div>
  );
}

// ───────── Media library ─────────
export function MediaPage() {
  const supabase = requireSupabase();
  const media = useRows('media_assets', { order: ['created_at', false] });
  const invalidate = useInvalidate();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [kind, setKind] = useState<MediaKind>('image');
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<Row | null>(null);
  const [alt, setAlt] = useState('');
  useEffect(() => setAlt(preview?.alt_text ?? ''), [preview]);
  const onError = (e: unknown) => toast(errorMessage(e), 'danger');

  const upload = useMutation({
    mutationFn: async (files: File[]) => { for (const f of files) await uploadMedia(f, kind); },
    onSuccess: async () => { await invalidate('media_assets'); toast('Upload complete'); }, onError,
  });
  const replace = useMutation({
    mutationFn: ({ row, file }: { row: Row; file: File }) => uploadMedia(file, row.kind, { id: row.id, path: row.path }),
    onSuccess: async (row) => { await invalidate('media_assets'); setPreview(row); toast('File replaced. Update any place that used the old link.'); }, onError,
  });
  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase.storage.from('media').remove([row.path]);
      if (error) throw new Error(error.message);
      unwrap(await supabase.from('media_assets').delete().eq('id', row.id).select('id'));
    },
    onSuccess: async () => { await invalidate('media_assets'); setPreview(null); toast('File deleted'); }, onError,
  });
  const saveAlt = useMutation({
    mutationFn: async () => unwrap(await supabase.from('media_assets').update({ alt_text: alt }).eq('id', preview!.id).select('id').single()),
    onSuccess: async () => { await invalidate('media_assets'); toast('Saved'); }, onError,
  });
  const rows = (media.data ?? []).filter((m) => !filter || m.kind === filter);
  return (
    <div>
      <PageHeader title="Media Library" description="Public images, logos, QR codes and videos used on the website. Payment proofs and customer documents are stored separately in private storage and never appear here." />
      <Glass className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <select className="field field-sm !w-auto" aria-label="Upload as" value={kind} onChange={(e) => setKind(e.target.value as MediaKind)}><option value="image">Image</option><option value="logo">Logo</option><option value="qr">QR code</option><option value="other">Other</option></select>
        <label className={cx('btn btn-sm btn-primary btn-style-gradient cursor-pointer', upload.isPending && 'opacity-60')}>
          <Upload className="h-4 w-4" aria-hidden />{upload.isPending ? 'Uploading…' : 'Upload files'}
          <input type="file" multiple accept="image/*,video/mp4,video/webm" className="sr-only" disabled={upload.isPending} onChange={(e) => { const files = [...(e.target.files ?? [])]; if (files.length) upload.mutate(files); e.target.value = ''; }} />
        </label>
        <span className="text-xs text-muted">Images up to 8 MB · videos (MP4, WebM) up to 50 MB</span>
        <select className="field field-sm ml-auto !w-auto" aria-label="Filter media" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All files</option><option value="image">Images</option><option value="logo">Logos</option><option value="qr">QR codes</option><option value="video">Videos</option><option value="other">Other</option></select>
      </Glass>
      {media.isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No files yet" text="Upload images, logos, QR codes or videos to use them across the site." /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {rows.map((m) => (
            <button key={m.id} type="button" onClick={() => setPreview(m)} className="glass-soft group overflow-hidden text-left hover:!border-accent/60">
              {String(m.mime_type).startsWith('video/') ? <video src={m.public_url} className="aspect-square w-full bg-black object-cover" muted preload="metadata" /> : <img src={m.public_url} alt={m.alt_text || m.file_name} loading="lazy" className="aspect-square w-full bg-black/30 object-contain p-1.5" />}
              <span className="block truncate px-2.5 py-2 text-xs">{m.file_name}</span>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.file_name ?? ''} wide>
        {preview && (
          <div className="grid gap-4">
            {String(preview.mime_type).startsWith('video/') ? <video src={preview.public_url} controls className="max-h-[50dvh] w-full rounded-2xl bg-black" /> : <img src={preview.public_url} alt={preview.alt_text} className="mx-auto max-h-[50dvh] rounded-2xl bg-black/40 object-contain" />}
            <p className="text-xs text-muted">{preview.mime_type} · {(preview.size_bytes / 1024).toFixed(0)} KB · {label(preview.kind)} · uploaded {formatDate(preview.created_at)}</p>
            <div className="flex gap-2"><input className="field field-sm min-w-0 flex-1 font-mono text-xs" readOnly aria-label="Public link" value={preview.public_url} onFocus={(e) => e.target.select()} /><Btn size="sm" variant="secondary" onClick={async () => toast((await copyText(preview.public_url)) ? 'Link copied' : 'Copy failed')}><Copy className="h-4 w-4" aria-hidden />Copy</Btn></div>
            <div className="flex items-end gap-2"><Field label="Alt text (describes the image for screen readers)" className="flex-1">{(p) => <input {...p} className="field field-sm" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={300} />}</Field><Btn size="sm" variant="secondary" loading={saveAlt.isPending} disabled={alt === (preview.alt_text ?? '')} onClick={() => saveAlt.mutate()}>Save</Btn></div>
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-sm btn-secondary" href={preview.public_url} download={preview.file_name} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" aria-hidden />Download</a>
              <label className={cx('btn btn-sm btn-secondary cursor-pointer', replace.isPending && 'opacity-60')}><RefreshCw className="h-4 w-4" aria-hidden />{replace.isPending ? 'Replacing…' : 'Replace file'}<input type="file" className="sr-only" accept="image/*,video/mp4,video/webm" onChange={(e) => { const f = e.target.files?.[0]; if (f) replace.mutate({ row: preview, file: f }); e.target.value = ''; }} /></label>
              <Btn size="sm" variant="danger" loading={remove.isPending} onClick={async () => { if (await confirm('Delete this file? Any page still using it will show a broken image.')) remove.mutate(preview); }}><Trash2 className="h-4 w-4" aria-hidden />Delete</Btn>
            </div>
          </div>
        )}
      </Modal>
      {confirmNode}
    </div>
  );
}
