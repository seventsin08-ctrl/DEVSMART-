// Services, add-ons, packages, quick pricing, discounts and portfolio management.
import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { PROMOTION_KINDS, PROMOTION_KIND_LABELS, formatDate, type PromotionKind } from '@shared/constants';
import { bpsToPercentLabel, centavosToInput, formatPHP, parsePesos } from '@shared/money';
import { ICON_NAMES } from '@shared/site/schema';
import { errorMessage } from '@/lib/api';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { slugify } from '@/lib/utils';
import { Badge, Glass, Notice, Spinner, Tabs, useToast } from '@/ui';
import { DataTable, ExportButton, PageHeader, ResourceList, useInvalidate, useRows, type ResourceConfig, type Row } from '../kit';

const activeBadge = (row: Row) => (row.is_archived ? <Badge>Archived</Badge> : row.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="warn">Disabled</Badge>);
const iconOptions = ICON_NAMES.map((i) => ({ value: i, label: i }));

function useServiceOptions() {
  const services = useRows('services', { order: ['sort_order', true] });
  return (services.data ?? []).map((s) => ({ value: s.id as string, label: s.name as string }));
}

// ───────── Services ─────────
export function ServicesPage() {
  const [tab, setTab] = useState<'services' | 'addons' | 'packages' | 'archived'>('services');
  const serviceOptions = useServiceOptions();

  const serviceFields: ResourceConfig['fields'] = [
    { key: 'name', label: 'Service name', type: 'text', required: true, half: true },
    { key: 'starting_price_centavos', label: 'Starting price (₱)', type: 'money', required: true, half: true },
    { key: 'short_description', label: 'Short description', type: 'text', hint: 'One line shown on cards.' },
    { key: 'description', label: 'Full description', type: 'textarea' },
    { key: 'features', label: 'Included features', type: 'lines', hint: 'One feature per line.' },
    { key: 'delivery_days_min', label: 'Fastest delivery (days)', type: 'number', nullable: true, half: true },
    { key: 'delivery_days_max', label: 'Longest delivery (days)', type: 'number', nullable: true, half: true },
    { key: 'icon', label: 'Icon', type: 'select', options: iconOptions, half: true },
    { key: 'image_url', label: 'Service image', type: 'image', nullable: true },
    { key: 'is_active', label: 'Enabled', type: 'bool', hint: 'Disabled services are hidden from customers.' },
  ];
  const services: ResourceConfig = {
    table: 'services', singular: 'Service', reorderable: true, searchKeys: ['name'],
    filter: (q) => q.eq('is_archived', false), filterKey: 'live',
    archive: { column: 'is_archived', value: true },
    columns: [
      { key: 'name', label: 'Service', render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'starting_price_centavos', label: 'Starts at', render: (r) => formatPHP(r.starting_price_centavos) },
      { key: 'delivery', label: 'Delivery', hideOnMobile: true, render: (r) => (r.delivery_days_min ? `${r.delivery_days_min}–${r.delivery_days_max ?? r.delivery_days_min} days` : '—') },
      { key: 'is_active', label: 'Status', render: activeBadge },
    ],
    fields: serviceFields,
    defaults: { name: '', starting_price_centavos: 500000, short_description: '', description: '', features: [], icon: 'Globe', image_url: null, is_active: true, delivery_days_min: 7, delivery_days_max: 14 },
    transform: (p, isNew) => (isNew ? { ...p, slug: `${slugify(p.name)}-${Math.random().toString(36).slice(2, 6)}` } : p),
  };
  const archived: ResourceConfig = {
    ...services, reorderable: false, filter: (q) => q.eq('is_archived', true), filterKey: 'archived',
    archive: undefined, deleteLabel: 'Permanently delete this archived service? Past orders keep their own copy of the name and price.',
    fields: [...serviceFields, { key: 'is_archived', label: 'Archived', type: 'bool', hint: 'Turn off to restore this service.' }],
    empty: 'No archived services',
  };
  const addons: ResourceConfig = {
    table: 'service_addons', singular: 'Add-on', reorderable: true, searchKeys: ['name'],
    columns: [
      { key: 'name', label: 'Add-on', render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'service_id', label: 'Applies to', hideOnMobile: true, render: (r) => serviceOptions.find((s) => s.value === r.service_id)?.label ?? 'All services' },
      { key: 'price_centavos', label: 'Price', render: (r) => formatPHP(r.price_centavos) },
      { key: 'is_active', label: 'Status', render: activeBadge },
    ],
    fields: [
      { key: 'name', label: 'Add-on name', type: 'text', required: true, half: true },
      { key: 'price_centavos', label: 'Price (₱)', type: 'money', required: true, half: true },
      { key: 'service_id', label: 'Applies to', type: 'select', nullable: true, options: [{ value: '', label: 'All services' }, ...serviceOptions] },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'is_active', label: 'Enabled', type: 'bool' },
    ],
    defaults: { name: '', price_centavos: 100000, service_id: '', description: '', is_active: true },
  };
  const packages: ResourceConfig = {
    table: 'service_packages', singular: 'Package', reorderable: true, searchKeys: ['name'],
    columns: [
      { key: 'name', label: 'Package', render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'service_id', label: 'Service', render: (r) => serviceOptions.find((s) => s.value === r.service_id)?.label ?? '—' },
      { key: 'price_centavos', label: 'Price', render: (r) => formatPHP(r.price_centavos) },
      { key: 'is_active', label: 'Status', render: activeBadge },
    ],
    fields: [
      { key: 'service_id', label: 'Service', type: 'select', required: true, options: [{ value: '', label: 'Choose a service' }, ...serviceOptions] },
      { key: 'name', label: 'Package name', type: 'text', required: true, half: true },
      { key: 'price_centavos', label: 'Package price (₱)', type: 'money', required: true, half: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'features', label: 'What is included', type: 'lines', hint: 'One item per line.' },
      { key: 'delivery_days', label: 'Estimated delivery (days)', type: 'number', nullable: true, half: true },
      { key: 'is_active', label: 'Enabled', type: 'bool' },
    ],
    defaults: { service_id: '', name: '', price_centavos: 0, description: '', features: [], delivery_days: null, is_active: true },
  };
  const config = { services, addons, packages, archived }[tab];
  return (
    <div>
      <PageHeader title="Services" description="What customers can order. Changes are saved to the database and appear on the website immediately. Past orders always keep the prices they were quoted." />
      <Tabs className="mb-5 w-fit" value={tab} onChange={setTab} tabs={[{ id: 'services', label: 'Services' }, { id: 'addons', label: 'Add-ons' }, { id: 'packages', label: 'Packages' }, { id: 'archived', label: 'Archived' }]} />
      <ResourceList key={tab} config={config} />
    </div>
  );
}

// ───────── Pricing (quick inline price editor) ─────────
function PriceCell({ table, row, column }: { table: string; row: Row; column: string }) {
  const [value, setValue] = useState(centavosToInput(row[column]));
  const invalidate = useInvalidate();
  const toast = useToast();
  const save = useMutation({
    mutationFn: async () => {
      const centavos = parsePesos(value);
      if (centavos === null) throw new Error('Enter a valid peso amount.');
      unwrap(await requireSupabase().from(table).update({ [column]: centavos }).eq('id', row.id).select('id').single());
    },
    onSuccess: async () => { await invalidate(table); toast('Price updated'); },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });
  const dirty = parsePesos(value) !== row[column];
  return (
    <form className="flex items-center justify-end gap-2" onSubmit={(e) => { e.preventDefault(); if (dirty) save.mutate(); }}>
      <span className="text-muted" aria-hidden>₱</span>
      <input className="field field-sm !w-32 text-right" inputMode="decimal" aria-label={`Price for ${row.name}`} value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" disabled={!dirty || save.isPending} aria-label="Save price" className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[#fff] disabled:bg-white/10 disabled:text-muted"><Check className="h-4 w-4" /></button>
    </form>
  );
}

export function PricingPage() {
  const services = useRows('services', { order: ['sort_order', true], filter: (q) => q.eq('is_archived', false), key: ['live'] });
  const addons = useRows('service_addons', { order: ['sort_order', true] });
  const packages = useRows('service_packages', { order: ['sort_order', true] });
  const section = (title: string, table: string, rows: Row[] | undefined, column: string) => (
    <Glass className="p-5">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {!rows ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-muted">None yet. Add them under Services.</p> : (
        <ul className="divide-y divide-white/10">
          {rows.map((r) => (
            <li key={`${r.id}:${r[column]}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 font-medium">{r.name}{!r.is_active && <Badge tone="warn" className="ml-2">Disabled</Badge>}</span>
              <PriceCell table={table} row={r} column={column} />
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
  return (
    <div>
      <PageHeader title="Pricing" description="Edit prices in one place. New prices apply to new orders only — existing orders keep the prices they were quoted." />
      <div className="grid gap-5 xl:grid-cols-2">
        {section('Service starting prices', 'services', services.data, 'starting_price_centavos')}
        {section('Add-on prices', 'service_addons', addons.data, 'price_centavos')}
        {section('Package prices', 'service_packages', packages.data, 'price_centavos')}
      </div>
    </div>
  );
}

// ───────── Discounts ─────────
export function DiscountsPage() {
  const [tab, setTab] = useState<'promotions' | 'redemptions'>('promotions');
  const serviceOptions = useServiceOptions();
  const redemptions = useRows('promotion_redemptions', { select: '*, promotions(name), orders(reference, customer_name)', order: ['created_at', false], enabled: tab === 'redemptions' });
  const promotions: ResourceConfig = {
    table: 'promotions', singular: 'Promotion', searchKeys: ['name', 'code'],
    columns: [
      { key: 'name', label: 'Promotion', render: (r) => <span><span className="font-medium">{r.name}</span>{r.code && <span className="ml-2 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-xs">{r.code}</span>}</span> },
      { key: 'kind', label: 'Type', hideOnMobile: true, render: (r) => PROMOTION_KIND_LABELS[r.kind as PromotionKind] },
      { key: 'value', label: 'Discount', render: (r) => (r.discount_type === 'percent' ? bpsToPercentLabel(r.percent_bps) : formatPHP(r.fixed_centavos)) },
      { key: 'usage', label: 'Used', hideOnMobile: true, render: (r) => `${r.usage_count}${r.usage_limit ? ` / ${r.usage_limit}` : ''}` },
      { key: 'expires_at', label: 'Expires', hideOnMobile: true, render: (r) => (r.expires_at ? formatDate(r.expires_at, true) : 'Never') },
      { key: 'is_active', label: 'Status', render: (r) => (!r.is_active ? <Badge tone="warn">Disabled</Badge> : r.expires_at && new Date(r.expires_at) <= new Date() ? <Badge tone="danger">Expired</Badge> : <Badge tone="success">Active</Badge>) },
    ],
    fields: [
      { key: 'name', label: 'Promotion name', type: 'text', required: true, hint: 'Shown to customers on their order.' },
      { key: 'kind', label: 'Type', type: 'select', half: true, options: PROMOTION_KINDS.map((k) => ({ value: k, label: PROMOTION_KIND_LABELS[k] })) },
      { key: 'code', label: 'Promo code', type: 'text', half: true, upper: true, nullable: true, required: true, show: (f) => f.kind === 'promo_code', hint: 'Letters and numbers, e.g. WELCOME10' },
      { key: 'min_completed_orders', label: 'Completed projects needed', type: 'number', half: true, show: (f) => f.kind === 'loyalty', hint: 'Applies automatically to returning customers.' },
      { key: 'discount_type', label: 'Discount type', type: 'select', half: true, options: [{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }] },
      { key: 'percent_bps', label: 'Percent off (%)', type: 'percent', half: true, nullable: true, required: true, show: (f) => f.discount_type === 'percent' },
      { key: 'fixed_centavos', label: 'Amount off (₱)', type: 'money', half: true, nullable: true, required: true, show: (f) => f.discount_type === 'fixed' },
      { key: 'max_discount_centavos', label: 'Maximum discount (₱)', type: 'money', half: true, nullable: true, show: (f) => f.discount_type === 'percent', hint: 'Optional cap.' },
      { key: 'min_subtotal_centavos', label: 'Minimum order (₱)', type: 'money', half: true },
      { key: 'starts_at', label: 'Starts (Manila time)', type: 'datetime', half: true },
      { key: 'expires_at', label: 'Expires (Manila time)', type: 'datetime', half: true },
      { key: 'usage_limit', label: 'Total usage limit', type: 'number', nullable: true, half: true, hint: 'Leave empty for unlimited.' },
      { key: 'per_customer_limit', label: 'Limit per customer', type: 'number', nullable: true, half: true },
      { key: 'service_ids', label: 'Limit to services', type: 'multi', options: serviceOptions, hint: 'Select none to allow every service.' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'show_on_site', label: 'Advertise on the Pricing page', type: 'bool', hint: 'Shows this promotion (and its code) publicly.' },
      { key: 'is_active', label: 'Enabled', type: 'bool' },
    ],
    defaults: { name: '', kind: 'promo_code', code: '', discount_type: 'percent', percent_bps: 1000, fixed_centavos: null, max_discount_centavos: null, min_subtotal_centavos: 0, min_completed_orders: 1, starts_at: null, expires_at: null, usage_limit: null, per_customer_limit: 1, service_ids: [], description: '', show_on_site: false, is_active: true },
    transform: (p) => {
      if (p.kind === 'promo_code' && !/^[A-Z0-9_-]{3,40}$/.test(p.code ?? '')) throw new Error('Promo code: use 3–40 letters, numbers, - or _.');
      if (p.fixed_centavos === 0) throw new Error('Amount off must be greater than zero.');
      return {
        ...p,
        code: p.kind === 'promo_code' ? p.code : null,
        percent_bps: p.discount_type === 'percent' ? p.percent_bps : null,
        fixed_centavos: p.discount_type === 'fixed' ? p.fixed_centavos : null,
        max_discount_centavos: p.discount_type === 'percent' ? p.max_discount_centavos || null : null,
        min_completed_orders: p.kind === 'loyalty' ? Math.max(p.min_completed_orders ?? 1, 1) : 0,
      };
    },
  };
  return (
    <div>
      <PageHeader title="Discounts" description="Promo codes, automatic and first-order discounts, loyalty rewards and referral discounts. Every discount is validated on the server and one discount applies per order." />
      <Tabs className="mb-5 w-fit" value={tab} onChange={setTab} tabs={[{ id: 'promotions', label: 'Promotions' }, { id: 'redemptions', label: 'Redemptions' }]} />
      {tab === 'promotions' ? (
        <>
          <Notice tone="info" className="mb-4">Referral discounts: create one promotion of type “Referral discount”. New customers who enter an existing customer’s referral code (see Customers) receive it, and the referrer earns loyalty points when that first project is completed.</Notice>
          <ResourceList config={promotions} />
        </>
      ) : redemptions.isLoading ? <Spinner /> : (
        <>
          <div className="mb-3 flex justify-end"><ExportButton filename="discount-redemptions.csv" rows={(redemptions.data ?? []).map((r) => ({ date: r.created_at, promotion: r.promotions?.name, code: r.code_used, order: r.orders?.reference, customer: r.orders?.customer_name, discount_php: centavosToInput(r.discount_centavos) }))} /></div>
          <DataTable rows={redemptions.data ?? []} columns={[
            { key: 'created_at', label: 'Date', render: (r) => formatDate(r.created_at, true) },
            { key: 'promotion', label: 'Promotion', render: (r) => r.promotions?.name ?? '—' },
            { key: 'order', label: 'Order', render: (r) => <span className="font-mono text-xs">{r.orders?.reference}</span> },
            { key: 'customer', label: 'Customer', hideOnMobile: true, render: (r) => r.orders?.customer_name },
            { key: 'discount_centavos', label: 'Discount', className: 'text-right', render: (r) => formatPHP(r.discount_centavos) },
          ]} />
        </>
      )}
    </div>
  );
}

// ───────── Portfolio ─────────
export function PortfolioPage() {
  const config: ResourceConfig = {
    table: 'portfolio_projects', singular: 'Project', reorderable: true, searchKeys: ['title', 'category'],
    columns: [
      { key: 'image_url', label: '', render: (r) => (r.image_url ? <img src={r.image_url} alt="" className="h-10 w-14 rounded-lg object-cover" /> : <span className="block h-10 w-14 rounded-lg bg-white/10" />) },
      { key: 'title', label: 'Project', render: (r) => <span className="font-medium">{r.title}{r.is_concept && <Badge className="ml-2">Concept</Badge>}</span> },
      { key: 'category', label: 'Category', hideOnMobile: true },
      { key: 'flags', label: 'Status', render: (r) => <span className="flex gap-1">{r.is_published ? <Badge tone="success">Published</Badge> : <Badge tone="warn">Hidden</Badge>}{r.is_featured && <Badge tone="info">Featured</Badge>}</span> },
    ],
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, half: true },
      { key: 'category', label: 'Category', type: 'text', half: true, hint: 'e.g. Booking System' },
      { key: 'summary', label: 'Short summary', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'image_url', label: 'Cover image', type: 'image', nullable: true },
      { key: 'tech', label: 'Technologies', type: 'lines', hint: 'One per line.' },
      { key: 'project_url', label: 'Live link', type: 'text', nullable: true, half: true },
      { key: 'client_name', label: 'Client name', type: 'text', nullable: true, half: true },
      { key: 'completed_on', label: 'Completed on', type: 'date', half: true },
      { key: 'is_concept', label: 'Concept project', type: 'bool', hint: 'Labels the project as a concept, not client work.' },
      { key: 'is_featured', label: 'Featured on the homepage', type: 'bool' },
      { key: 'is_published', label: 'Published', type: 'bool' },
    ],
    defaults: { title: '', category: '', summary: '', description: '', image_url: null, tech: [], project_url: null, client_name: null, completed_on: null, is_concept: false, is_featured: false, is_published: true },
    transform: (p, isNew) => {
      if (p.project_url && !/^https?:\/\//i.test(p.project_url)) throw new Error('Live link must start with https://');
      return isNew ? { ...p, slug: `${slugify(p.title)}-${Math.random().toString(36).slice(2, 6)}` } : p;
    },
  };
  return (
    <div>
      <PageHeader title="Portfolio" description="Projects shown on the Portfolio page and the homepage." />
      <ResourceList config={config} />
    </div>
  );
}
