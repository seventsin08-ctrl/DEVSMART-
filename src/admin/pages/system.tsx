// Overview, analytics, notifications, settings and security.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ORDER_STATUS_LABELS, formatDate, manilaToday, type OrderStatus } from '@shared/constants';
import { centavosToInput, formatPHP } from '@shared/money';
import { api, errorMessage } from '@/lib/api';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { cx } from '@/lib/utils';
import { Badge, Btn, EmptyState, Field, Glass, Notice, Spinner, Tabs, useConfirm, useToast } from '@/ui';
import { DataTable, ExportButton, PageHeader, StatCard, useInvalidate, useRows, type Row } from '../kit';
import { StatusBadge } from './orders';

// ───────── analytics data ─────────
interface Summary {
  total_inquiries: number; pending_orders: number; active_projects: number; completed_projects: number;
  cancelled_orders: number; converted_orders: number; verified_revenue_centavos: number; outstanding_centavos: number;
  discount_total_centavos: number; discounted_orders: number; status_breakdown: Record<string, number>;
  popular_services: { name: string; orders: number; value_centavos: number }[];
  discounts: { name: string; uses: number; amount_centavos: number }[];
  monthly: { month: string; orders: number; revenue_centavos: number }[];
}
const startOf = (date: string) => new Date(`${date}T00:00:00+08:00`).toISOString();
const endOf = (date: string) => new Date(new Date(`${date}T00:00:00+08:00`).getTime() + 86400000).toISOString();
const shift = (days: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(Date.now() + days * 86400000));

function useSummary(from: string, to: string, serviceId: string) {
  return useQuery({
    queryKey: ['admin', 'analytics', from, to, serviceId],
    queryFn: async () => unwrap(await requireSupabase().rpc('analytics_summary', { p_from: startOf(from), p_to: endOf(to), p_service_id: serviceId || null })) as Summary,
  });
}
const rate = (s: Summary) => (s.total_inquiries === 0 ? '—' : `${((s.converted_orders / s.total_inquiries) * 100).toFixed(1)}%`);

function StatGrid({ s }: { s: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Total inquiries" value={String(s.total_inquiries)} />
      <StatCard label="Pending orders" value={String(s.pending_orders)} tone={s.pending_orders ? 'warn' : undefined} />
      <StatCard label="Active projects" value={String(s.active_projects)} tone="accent" />
      <StatCard label="Completed projects" value={String(s.completed_projects)} tone="good" />
      <StatCard label="Verified revenue" value={formatPHP(s.verified_revenue_centavos)} hint="Verified payments minus refunds" tone="good" />
      <StatCard label="Outstanding balances" value={formatPHP(s.outstanding_centavos)} hint="Agreed totals not yet paid" />
      <StatCard label="Conversion rate" value={rate(s)} hint={`${s.converted_orders} of ${s.total_inquiries} inquiries became projects`} />
      <StatCard label="Discounts used" value={formatPHP(s.discount_total_centavos)} hint={`${s.discounted_orders} order(s)`} />
    </div>
  );
}

// ───────── Overview ─────────
export function OverviewPage() {
  const supabase = requireSupabase();
  const invalidate = useInvalidate();
  const summary = useSummary('2020-01-01', manilaToday(), '');
  const recent = useRows('orders', { order: ['created_at', false], limit: 6, key: ['recent'] });
  const unread = useRows('notifications', { order: ['created_at', false], limit: 6, filter: (q) => q.eq('is_read', false), key: ['unread'] });
  const pending = useRows('payment_submissions', { select: 'id', filter: (q) => q.in('status', ['proof_submitted', 'under_review']), key: ['pending-count'] });
  useEffect(() => {
    // creates "deadline soon / overdue" notifications once per deadline
    supabase.rpc('generate_deadline_notifications', { p_days: 3 }).then(({ data }) => { if (data) invalidate('notifications'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div>
      <PageHeader title="Overview" description="All-time figures, calculated live from your database." actions={<Link className="btn btn-sm btn-secondary" to="/admin/analytics">Open analytics</Link>} />
      {summary.isLoading ? <Spinner /> : summary.isError ? <Notice tone="danger">{errorMessage(summary.error)}</Notice> : <StatGrid s={summary.data!} />}
      {(pending.data?.length ?? 0) > 0 && <Notice tone="warn" className="mt-5" title={`${pending.data!.length} payment proof(s) waiting for review`}><Link className="underline" to="/admin/payments">Review payments</Link></Notice>}
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Recent orders</h2><Link className="text-sm text-accent hover:underline" to="/admin/orders">View all</Link></div>
          {recent.isLoading ? <Spinner /> : (
            <DataTable rows={recent.data ?? []} empty={<EmptyState title="No orders yet" text="New orders will show up here." />} columns={[
              { key: 'reference', label: 'Reference', render: (o) => <Link className="font-mono text-xs font-semibold hover:text-accent" to={`/admin/orders/${o.id}`}>{o.reference}</Link> },
              { key: 'customer_name', label: 'Customer' },
              { key: 'total', label: 'Total', render: (o) => formatPHP(o.quoted_total_centavos ?? o.total_centavos) },
              { key: 'status', label: 'Status', render: (o) => <StatusBadge status={o.status} /> },
            ]} />
          )}
        </div>
        <Glass className="h-fit p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Unread notifications</h2><Link className="text-sm text-accent hover:underline" to="/admin/notifications">View all</Link></div>
          {(unread.data ?? []).length === 0 ? <p className="text-sm text-muted">You are all caught up.</p> : (
            <ul className="space-y-2.5">{unread.data!.map((n) => <li key={n.id}><Link to={n.link ?? '/admin/notifications'} className="glass-soft block p-3 hover:!border-accent/60"><p className="text-sm font-medium">{n.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p></Link></li>)}</ul>
          )}
        </Glass>
      </div>
    </div>
  );
}

// ───────── Analytics ─────────
const PIE = ['#3b9eff', '#7dd3fc', '#a5b4fc', '#c7d2e3', '#34d399', '#fbbf24', '#f472b6', '#94a3b8'];
const tooltipStyle = { background: 'var(--dm-bg)', border: '1px solid color-mix(in srgb, var(--dm-text) 18%, transparent)', borderRadius: 12, color: 'var(--dm-text)', fontSize: 13 };

export function AnalyticsPage() {
  const [from, setFrom] = useState(shift(-180));
  const [to, setTo] = useState(manilaToday());
  const [serviceId, setServiceId] = useState('');
  const services = useRows('services', { order: ['sort_order', true] });
  const valid = from <= to;
  const summary = useSummary(valid ? from : to, to, serviceId);
  const s = summary.data;
  const monthly = useMemo(() => (s?.monthly ?? []).map((m) => ({ month: m.month, Orders: m.orders, Revenue: m.revenue_centavos / 100 })), [s]);
  const preset = (days: number) => { setFrom(shift(-days)); setTo(manilaToday()); };

  const exportRows = (): Row[] => !s ? [] : [
    { section: 'Summary', metric: 'Total inquiries', value: s.total_inquiries },
    { section: 'Summary', metric: 'Pending orders', value: s.pending_orders },
    { section: 'Summary', metric: 'Active projects', value: s.active_projects },
    { section: 'Summary', metric: 'Completed projects', value: s.completed_projects },
    { section: 'Summary', metric: 'Cancelled orders', value: s.cancelled_orders },
    { section: 'Summary', metric: 'Verified revenue (PHP)', value: centavosToInput(s.verified_revenue_centavos) },
    { section: 'Summary', metric: 'Outstanding balances (PHP)', value: centavosToInput(s.outstanding_centavos) },
    { section: 'Summary', metric: 'Conversion rate', value: rate(s) },
    { section: 'Summary', metric: 'Discounts given (PHP)', value: centavosToInput(s.discount_total_centavos) },
    ...s.monthly.flatMap((m) => [{ section: 'Monthly orders', metric: m.month, value: m.orders }, { section: 'Monthly revenue (PHP)', metric: m.month, value: centavosToInput(m.revenue_centavos) }]),
    ...s.popular_services.map((p) => ({ section: 'Popular services (orders)', metric: p.name, value: p.orders })),
    ...s.discounts.map((d) => ({ section: 'Discounts used (PHP)', metric: `${d.name} × ${d.uses}`, value: centavosToInput(d.amount_centavos) })),
    ...Object.entries(s.status_breakdown).map(([k, v]) => ({ section: 'Orders by status', metric: ORDER_STATUS_LABELS[k as OrderStatus] ?? k, value: v })),
  ];

  return (
    <div>
      <PageHeader title="Analytics" description="Every figure is computed from real orders and verified payments. An empty database shows zeros."
        actions={<ExportButton filename={`analytics-${from}-to-${to}.csv`} rows={exportRows()} />} />
      <Glass className="mb-5 flex flex-wrap items-end gap-3 p-4">
        <Field label="From">{(p) => <input {...p} type="date" className="field field-sm" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(p) => <input {...p} type="date" className="field field-sm" value={to} max={manilaToday()} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Field label="Service">{(p) => <select {...p} className="field field-sm" value={serviceId} onChange={(e) => setServiceId(e.target.value)}><option value="">All services</option>{(services.data ?? []).map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}</select>}</Field>
        <div className="flex gap-1.5">{[[30, '30 days'], [90, '90 days'], [365, '12 months']].map(([d, l]) => <Btn key={d} size="sm" variant="secondary" onClick={() => preset(d as number)}>{l}</Btn>)}</div>
      </Glass>
      {!valid && <Notice tone="warn" className="mb-4">The start date must be before the end date.</Notice>}
      {summary.isLoading ? <Spinner /> : summary.isError || !s ? <Notice tone="danger">{errorMessage(summary.error)}</Notice> : (
        <>
          <StatGrid s={s} />
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Glass className="p-5">
              <h2 className="mb-4 font-semibold">Monthly verified revenue (₱)</h2>
              <div className="h-64" role="img" aria-label="Bar chart of monthly verified revenue">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid stroke="color-mix(in srgb, var(--dm-text) 10%, transparent)" vertical={false} />
                    <XAxis dataKey="month" stroke="var(--dm-muted)" fontSize={12} tickLine={false} />
                    <YAxis stroke="var(--dm-muted)" fontSize={12} tickLine={false} width={64} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'color-mix(in srgb, var(--dm-text) 6%, transparent)' }} formatter={(v) => formatPHP(Math.round(Number(v) * 100))} />
                    <Bar dataKey="Revenue" fill="var(--dm-accent)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Glass>
            <Glass className="p-5">
              <h2 className="mb-4 font-semibold">Monthly inquiries</h2>
              <div className="h-64" role="img" aria-label="Line chart of monthly inquiries">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthly} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid stroke="color-mix(in srgb, var(--dm-text) 10%, transparent)" vertical={false} />
                    <XAxis dataKey="month" stroke="var(--dm-muted)" fontSize={12} tickLine={false} />
                    <YAxis stroke="var(--dm-muted)" fontSize={12} tickLine={false} width={36} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="Orders" stroke="var(--dm-accent)" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Glass>
            <Glass className="p-5">
              <h2 className="mb-4 font-semibold">Popular services</h2>
              {s.popular_services.length === 0 ? <p className="text-sm text-muted">No orders in this period.</p> : (
                <div className="grid items-center gap-4 sm:grid-cols-2">
                  <div className="h-52" role="img" aria-label="Pie chart of orders by service">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={s.popular_services} dataKey="orders" nameKey="name" innerRadius={48} outerRadius={84} paddingAngle={2} stroke="none">{s.popular_services.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-2 text-sm">{s.popular_services.map((p, i) => <li key={p.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PIE[i % PIE.length] }} /><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="text-muted">{p.orders} · {formatPHP(p.value_centavos)}</span></li>)}</ul>
                </div>
              )}
            </Glass>
            <Glass className="p-5">
              <h2 className="mb-4 font-semibold">Orders by status</h2>
              {Object.keys(s.status_breakdown).length === 0 ? <p className="text-sm text-muted">No orders in this period.</p> : (
                <ul className="space-y-2.5">{Object.entries(s.status_breakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <li key={k}><div className="mb-1 flex justify-between text-sm"><span>{ORDER_STATUS_LABELS[k as OrderStatus] ?? k}</span><span className="text-muted">{v}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-accent" style={{ width: `${(v / s.total_inquiries) * 100}%` }} /></div></li>
                ))}</ul>
              )}
              <h2 className="mb-3 mt-6 font-semibold">Discounts used</h2>
              {s.discounts.length === 0 ? <p className="text-sm text-muted">No discounts were used in this period.</p> : <ul className="divide-y divide-white/10 text-sm">{s.discounts.map((d) => <li key={d.name} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate">{d.name} <span className="text-muted">× {d.uses}</span></span><span>{formatPHP(d.amount_centavos)}</span></li>)}</ul>}
            </Glass>
          </div>
        </>
      )}
    </div>
  );
}

// ───────── Notifications ─────────
const NOTIF_TONE: Record<string, 'info' | 'success' | 'warn' | 'danger' | 'neutral'> = {
  new_order: 'info', payment_proof: 'warn', payment_approved: 'success', payment_rejected: 'danger',
  project_deadline: 'warn', customer_message: 'info', project_completed: 'success', system: 'neutral',
};
const NOTIF_LABEL: Record<string, string> = {
  new_order: 'New order', payment_proof: 'Payment proof', payment_approved: 'Payment approved', payment_rejected: 'Payment rejected',
  project_deadline: 'Deadline', customer_message: 'Message', project_completed: 'Completed', system: 'System',
};

export function useUnreadCount() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'notifications', 'count'], refetchInterval: 45_000,
    queryFn: async () => (await requireSupabase().from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)).count ?? 0,
  });
  useEffect(() => {
    // live updates when Supabase Realtime is enabled for the notifications table; polling covers the rest
    const supabase = requireSupabase();
    const channel = supabase.channel('admin-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => qc.invalidateQueries({ queryKey: ['admin', 'notifications'] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);
  return query.data ?? 0;
}

export function NotificationsPage() {
  const supabase = requireSupabase();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [tab, setTab] = useState<'notifications' | 'messages'>('notifications');
  const [type, setType] = useState('');
  const notifications = useRows('notifications', { order: ['created_at', false], limit: 300 });
  const messages = useRows('contact_messages', { order: ['created_at', false], limit: 300 });
  const email = useQuery({ queryKey: ['admin', 'email-status'], queryFn: () => api<{ email_configured: boolean }>('admin-action', { action: 'email_status' }, { auth: true }), retry: false });
  const onError = (e: unknown) => toast(errorMessage(e), 'danger');
  const mark = useMutation({
    mutationFn: async (id: string | null) => {
      const q = supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() });
      unwrap(await (id ? q.eq('id', id) : q.eq('is_read', false)).select('id'));
    },
    onSuccess: () => invalidate('notifications'), onError,
  });
  const removeNotification = useMutation({ mutationFn: async (id: string) => unwrap(await supabase.from('notifications').delete().eq('id', id).select('id')), onSuccess: () => invalidate('notifications'), onError });
  const markMessage = useMutation({ mutationFn: async (m: Row) => unwrap(await supabase.from('contact_messages').update({ is_read: !m.is_read }).eq('id', m.id).select('id')), onSuccess: () => invalidate('contact_messages'), onError });
  const removeMessage = useMutation({ mutationFn: async (id: string) => unwrap(await supabase.from('contact_messages').delete().eq('id', id).select('id')), onSuccess: () => invalidate('contact_messages'), onError });
  const list = (notifications.data ?? []).filter((n) => !type || n.type === type);
  const unreadMessages = (messages.data ?? []).filter((m) => !m.is_read).length;
  return (
    <div>
      <PageHeader title="Notifications" description="New orders, payment proofs, payment decisions, deadlines, customer messages and completed projects."
        actions={tab === 'notifications' ? <Btn size="sm" variant="secondary" loading={mark.isPending && mark.variables === null} onClick={() => mark.mutate(null)}><CheckCheck className="h-4 w-4" aria-hidden />Mark all read</Btn> : undefined} />
      {email.data && !email.data.email_configured && <Notice tone="info" className="mb-4" title="Email notifications are off">In-app notifications work now. To also send emails, add RESEND_API_KEY, EMAIL_FROM and ADMIN_NOTIFY_EMAIL to your hosting environment (see README).</Notice>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'notifications', label: 'Activity', count: (notifications.data ?? []).filter((n) => !n.is_read).length }, { id: 'messages', label: 'Customer messages', count: unreadMessages }]} />
        {tab === 'notifications' && <select className="field field-sm !w-auto" aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{Object.entries(NOTIF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
      </div>
      {tab === 'notifications' ? (notifications.isLoading ? <Spinner /> : list.length === 0 ? <EmptyState title="No notifications" /> : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id} className={cx('glass-soft flex flex-wrap items-start gap-3 p-4', !n.is_read && '!border-accent/50')}>
              <Bell className={cx('mt-0.5 h-4 w-4 shrink-0', n.is_read ? 'text-muted' : 'text-accent')} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className={cx('text-sm', !n.is_read && 'font-semibold')}>{n.title}</p><Badge tone={NOTIF_TONE[n.type]}>{NOTIF_LABEL[n.type]}</Badge></div>
                {n.body && <p className="mt-0.5 text-sm text-muted [overflow-wrap:anywhere]">{n.body}</p>}
                <p className="mt-1 text-xs text-muted">{formatDate(n.created_at, true)}</p>
              </div>
              <div className="flex items-center gap-1">
                {n.link && <Link to={n.link} className="btn btn-sm btn-secondary" onClick={() => !n.is_read && mark.mutate(n.id)}>Open</Link>}
                {!n.is_read && <button type="button" aria-label="Mark as read" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" onClick={() => mark.mutate(n.id)}><CheckCheck className="h-4 w-4" /></button>}
                <button type="button" aria-label="Delete notification" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-white/10" onClick={() => removeNotification.mutate(n.id)}><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )) : messages.isLoading ? <Spinner /> : (messages.data ?? []).length === 0 ? <EmptyState title="No messages yet" text="Messages from the contact form appear here." /> : (
        <ul className="space-y-2">
          {messages.data!.map((m) => (
            <li key={m.id} className={cx('glass-soft p-4', !m.is_read && '!border-accent/50')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-medium">{m.name}</p><p className="text-sm text-muted [overflow-wrap:anywhere]"><a className="hover:text-accent" href={`mailto:${m.email}`}>{m.email}</a>{m.phone && <> · <a className="hover:text-accent" href={`tel:${m.phone}`}>{m.phone}</a></>} · {formatDate(m.created_at, true)}</p></div>
                <div className="flex gap-1"><Btn size="sm" variant="secondary" onClick={() => markMessage.mutate(m)}>{m.is_read ? 'Mark unread' : 'Mark read'}</Btn><button type="button" aria-label="Delete message" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-white/10" onClick={() => removeMessage.mutate(m.id)}><Trash2 className="h-4 w-4" /></button></div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{m.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────── Settings ─────────
const OP_FIELDS = [
  { key: 'deposit_percent', label: 'Default deposit (%)', hint: 'Used as guidance when quoting. 0–100.', max: 100 },
  { key: 'tracking_link_days', label: 'Tracking link validity (days)', hint: 'How long a customer tracking link works.', max: 365 },
  { key: 'points_per_100_pesos', label: 'Loyalty points per ₱100 verified', hint: 'Set 0 to turn off loyalty points.', max: 1000 },
  { key: 'referral_bonus_points', label: 'Referral bonus points', hint: 'Given to the referrer when a referred customer’s first project is completed.', max: 100000 },
] as const;

export function SettingsPage() {
  const supabase = requireSupabase();
  const toast = useToast();
  const invalidate = useInvalidate();
  const settings = useRows('website_settings', { filter: (q) => q.eq('key', 'operations'), key: ['operations'] });
  const email = useQuery({ queryKey: ['admin', 'email-status'], queryFn: () => api<{ email_configured: boolean }>('admin-action', { action: 'email_status' }, { auth: true }), retry: false });
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    const current = (settings.data?.[0]?.published ?? {}) as Record<string, number>;
    setForm(Object.fromEntries(OP_FIELDS.map((f) => [f.key, String(current[f.key] ?? '')])));
  }, [settings.data]);
  const save = useMutation({
    mutationFn: async () => {
      const value: Record<string, number> = {};
      for (const f of OP_FIELDS) {
        if (!/^\d{1,6}$/.test(form[f.key] ?? '') || Number(form[f.key]) > f.max) throw new Error(`${f.label}: enter a whole number from 0 to ${f.max}.`);
        value[f.key] = Number(form[f.key]);
      }
      if (value.tracking_link_days < 1) throw new Error('Tracking links must be valid for at least 1 day.');
      unwrap(await supabase.from('website_settings').upsert({ key: 'operations', draft: value, published: value }).select('key').single());
    },
    onSuccess: async () => { await invalidate('website_settings'); toast('Settings saved'); },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });
  return (
    <div>
      <PageHeader title="Settings" description="Operational settings for orders, tracking links and loyalty." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Glass className="p-5">
          <h2 className="mb-4 text-lg font-semibold">Orders &amp; loyalty</h2>
          {settings.isLoading ? <Spinner /> : (
            <div className="grid gap-4">
              {OP_FIELDS.map((f) => <Field key={f.key} label={f.label} hint={f.hint}>{(p) => <input {...p} className="field" inputMode="numeric" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value.replace(/\D/g, '') })} />}</Field>)}
              <div><Btn loading={save.isPending} onClick={() => save.mutate()}>Save settings</Btn></div>
            </div>
          )}
        </Glass>
        <div className="space-y-5">
          <Glass className="p-5">
            <h2 className="mb-2 text-lg font-semibold">Business details &amp; branding</h2>
            <p className="text-sm text-muted">Your business name, logo, contact email, phone, Facebook link, address and every piece of website text are edited — and published — in the Branding Studio.</p>
            <Link to="/admin/studio" className="btn btn-sm btn-secondary mt-4">Open Branding Studio</Link>
          </Glass>
          <Glass className="p-5">
            <h2 className="mb-2 text-lg font-semibold">Email notifications</h2>
            {email.isLoading ? <Spinner /> : email.data?.email_configured
              ? <Notice tone="success" title="Transactional email is configured">Customers receive tracking links and payment decisions by email, and you receive new-order alerts.</Notice>
              : <Notice tone="info" title="Not configured">Email is optional. Add RESEND_API_KEY, EMAIL_FROM and ADMIN_NOTIFY_EMAIL as environment variables on your host to turn it on. Until then, share tracking links manually from each order page.</Notice>}
          </Glass>
          <Glass className="p-5">
            <h2 className="mb-2 text-lg font-semibold">Time zone &amp; currency</h2>
            <p className="text-sm text-muted">All dates use Philippine Time (Asia/Manila) and all amounts are in Philippine pesos (₱), stored as whole centavos.</p>
          </Glass>
        </div>
      </div>
    </div>
  );
}

// ───────── Security ─────────
export function SecurityPage({ email }: { email: string }) {
  const supabase = requireSupabase();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [confirm, confirmNode] = useConfirm();
  const [tab, setTab] = useState<'account' | 'audit'>('account');
  const [newEmail, setNewEmail] = useState('');
  const [role, setRole] = useState('admin');
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');
  const factors = useQuery({ queryKey: ['admin', 'mfa-factors'], queryFn: async () => { const { data, error } = await supabase.auth.mfa.listFactors(); if (error) throw new Error(error.message); return data.all; } });
  const admins = useRows('admin_roles', { order: ['created_at', true] });
  const audit = useRows('audit_logs', { order: ['created_at', false], limit: 300, enabled: tab === 'audit' });
  const onError = (e: unknown) => toast(errorMessage(e), 'danger');

  const addAdmin = useMutation({
    mutationFn: async () => {
      const e = newEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Enter a valid email address.');
      unwrap(await supabase.from('admin_roles').insert({ email: e, role }).select('id').single());
    },
    onSuccess: async () => { await invalidate('admin_roles'); setNewEmail(''); toast('Added to the allowlist. Create the user in Supabase → Authentication to let them sign in.'); }, onError,
  });
  const patchAdmin = useMutation({ mutationFn: async ({ id, patch }: { id: string; patch: Row }) => unwrap(await supabase.from('admin_roles').update(patch).eq('id', id).select('id').single()), onSuccess: () => invalidate('admin_roles'), onError });
  const removeAdmin = useMutation({ mutationFn: async (id: string) => unwrap(await supabase.from('admin_roles').delete().eq('id', id).select('id')), onSuccess: () => invalidate('admin_roles'), onError });
  const changePassword = useMutation({
    mutationFn: async () => {
      if (password.length < 12) throw new Error('Use at least 12 characters.');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setPassword(''); toast('Password changed'); }, onError,
  });
  const signOutAll = useMutation({ mutationFn: async () => { const { error } = await supabase.auth.signOut({ scope: 'global' }); if (error) throw new Error(error.message); }, onError });

  const logs = (audit.data ?? []).filter((l) => !search.trim() || [l.actor_email, l.action, l.entity_table, l.entity_id].some((v) => String(v ?? '').toLowerCase().includes(search.trim().toLowerCase())));
  return (
    <div>
      <PageHeader title="Security" description="Two-step verification, the admin allowlist, sessions and the audit trail." />
      <Tabs className="mb-5 w-fit" value={tab} onChange={setTab} tabs={[{ id: 'account', label: 'Access' }, { id: 'audit', label: 'Audit log' }]} />
      {tab === 'account' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Glass className="p-5">
            <h2 className="mb-1 text-lg font-semibold">Your account</h2>
            <p className="mb-4 text-sm text-muted [overflow-wrap:anywhere]">Signed in as {email}</p>
            <h3 className="mb-2 text-sm font-semibold">Two-step verification</h3>
            {factors.isLoading ? <Spinner /> : (
              <ul className="space-y-2">{(factors.data ?? []).map((f) => (
                <li key={f.id} className="glass-soft flex items-center gap-3 p-3"><ShieldCheck className={cx('h-5 w-5', f.status === 'verified' ? 'text-emerald-300' : 'text-muted')} aria-hidden /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{f.friendly_name ?? 'Authenticator app'}</p><p className="text-xs text-muted">{f.status === 'verified' ? 'Active' : 'Not finished'} · added {formatDate(f.created_at)}</p></div></li>
              ))}</ul>
            )}
            <p className="mt-2 text-xs text-muted">Two-step verification is mandatory and cannot be turned off here. If you lose your authenticator, remove the factor in Supabase → Authentication → Users, then sign in again to set up a new one.</p>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Change password</h3>
            <div className="flex flex-wrap items-end gap-2"><Field label="New password" className="min-w-0 flex-1" hint="At least 12 characters.">{(p) => <input {...p} className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field><Btn loading={changePassword.isPending} disabled={!password} onClick={() => changePassword.mutate()}>Update</Btn></div>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Sessions</h3>
            <Btn variant="secondary" size="sm" loading={signOutAll.isPending} onClick={async () => { if (await confirm('Sign out of DevMart on every device, including this one?')) signOutAll.mutate(); }}><LogOut className="h-4 w-4" aria-hidden />Sign out everywhere</Btn>
          </Glass>
          <Glass className="p-5">
            <h2 className="mb-1 text-lg font-semibold">Admin allowlist</h2>
            <p className="mb-4 text-sm text-muted">Only these emails can use the dashboard, and only after two-step verification. There is no public sign-up.</p>
            {admins.isLoading ? <Spinner /> : (
              <ul className="space-y-2">{(admins.data ?? []).map((a) => (
                <li key={a.id} className="glass-soft flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.email}</p><p className="text-xs text-muted">{a.user_id ? 'Account linked' : 'No account yet'}</p></div>
                  <select className="field field-sm !w-auto" aria-label={`Role for ${a.email}`} value={a.role} onChange={(e) => patchAdmin.mutate({ id: a.id, patch: { role: e.target.value } })}><option value="owner">Owner</option><option value="admin">Admin</option><option value="staff">Staff</option></select>
                  <Btn size="sm" variant="secondary" onClick={() => patchAdmin.mutate({ id: a.id, patch: { is_active: !a.is_active } })}>{a.is_active ? 'Disable' : 'Enable'}</Btn>
                  {!a.is_active && <Badge tone="warn">Disabled</Badge>}
                  <button type="button" aria-label={`Remove ${a.email}`} className="grid h-8 w-8 place-items-center rounded-full text-rose-300 hover:bg-rose-400/15" onClick={async () => { if (await confirm(`Remove ${a.email} from the allowlist?`)) removeAdmin.mutate(a.id); }}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}</ul>
            )}
            <div className="mt-4 grid grid-cols-[1fr_auto_auto] items-end gap-2">
              <Field label="Add email">{(p) => <input {...p} className="field field-sm" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@example.com" />}</Field>
              <select className="field field-sm !w-auto" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}><option value="admin">Admin</option><option value="staff">Staff</option><option value="owner">Owner</option></select>
              <Btn size="sm" loading={addAdmin.isPending} disabled={!newEmail.trim()} onClick={() => addAdmin.mutate()}>Add</Btn>
            </div>
          </Glass>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <input className="field field-sm !w-64" type="search" aria-label="Search audit log" placeholder="Search actor, action, table…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <ExportButton filename="audit-log.csv" rows={logs.map((l) => ({ time: l.created_at, actor: l.actor_email ?? 'system', action: l.action, table: l.entity_table, record: l.entity_id }))} />
          </div>
          {audit.isLoading ? <Spinner /> : (
            <DataTable rows={logs} empty={<EmptyState title="No audit entries yet" />} columns={[
              { key: 'created_at', label: 'Time', render: (l) => <span className="whitespace-nowrap">{formatDate(l.created_at, true)}</span> },
              { key: 'actor_email', label: 'Actor', render: (l) => l.actor_email ?? <span className="text-muted">system / customer</span> },
              { key: 'action', label: 'Action', render: (l) => <Badge tone={l.action === 'delete' ? 'danger' : l.action === 'insert' ? 'success' : 'info'}>{l.action}</Badge> },
              { key: 'entity_table', label: 'Record', render: (l) => <span>{l.entity_table}<span className="ml-1.5 font-mono text-xs text-muted">{String(l.entity_id ?? '').slice(0, 8)}</span></span> },
            ]} />
          )}
          <p className="mt-3 text-xs text-muted">The audit log is append-only: it cannot be edited or deleted from the dashboard. Showing the latest 300 entries.</p>
        </div>
      )}
      {confirmNode}
    </div>
  );
}
