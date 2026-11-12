import {
  DOCUMENT_KIND_LABELS, DOCUMENT_PREFIX, ORDER_STATUS_LABELS, formatDate,
  type DocumentKind, type OrderStatus,
} from '../../../shared/constants';
import { formatPHP } from '../../../shared/money';
import { DEFAULT_CONTRACT_TERMS } from '../../../shared/contract';
import { generateDocumentPdf, type PdfDocumentInput } from '../../../shared/pdf';
import {
  priceOrder, PricingError, type AddonRow, type PackageRow, type PricedOrder, type PromotionRow, type ServiceRow,
} from '../../../shared/pricing';
import { normalizeSiteDoc } from '../../../shared/site/parse';
import { HttpError, hashToken } from './http';
import { db } from './supabase';

const money = (c: number) => formatPHP(c, { symbol: 'PHP ', alwaysDecimals: true });

export interface Selection {
  service_id: string;
  package_id?: string | null;
  addon_ids: string[];
  promo_code: string;
}

export interface PricedSelection extends PricedOrder {
  service: ServiceRow;
  referrerCustomerId: string | null;
}

/** Loads catalogue rows fresh from the database and prices the selection. Client prices are never used. */
export async function priceSelection(selection: Selection, email: string): Promise<PricedSelection> {
  const supabase = db();
  const [{ data: service }, { data: pkg }, { data: addons }] = await Promise.all([
    supabase.from('services').select('*').eq('id', selection.service_id).maybeSingle(),
    selection.package_id
      ? supabase.from('service_packages').select('*').eq('id', selection.package_id).maybeSingle()
      : Promise.resolve({ data: null }),
    selection.addon_ids.length
      ? supabase.from('service_addons').select('*').in('id', selection.addon_ids)
      : Promise.resolve({ data: [] as AddonRow[] }),
  ]);
  if (!service) throw new HttpError(422, 'SERVICE_UNAVAILABLE', 'The selected service is no longer available.');
  if (selection.package_id && !pkg) throw new HttpError(422, 'PACKAGE_UNAVAILABLE', 'The selected package is no longer available.');
  const addonRows = (addons ?? []) as AddonRow[];
  if (addonRows.length !== new Set(selection.addon_ids).size) {
    throw new HttpError(422, 'ADDON_UNAVAILABLE', 'One of the selected add-ons is no longer available.');
  }

  // customer history (drives first-order / loyalty / per-customer limits)
  let isFirstOrder = true;
  let completedOrders = 0;
  const redemptionsByPromo: Record<string, number> = {};
  if (email) {
    const { data: customer } = await supabase.from('customers').select('id').eq('email', email).maybeSingle();
    if (customer) {
      const customerId = customer.id as string;
      const [{ count: prior }, { count: completed }, { data: redemptions }] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customerId).neq('status', 'cancelled'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customerId).eq('status', 'completed'),
        supabase.from('promotion_redemptions').select('promotion_id').eq('customer_id', customerId),
      ]);
      isFirstOrder = (prior ?? 0) === 0;
      completedOrders = completed ?? 0;
      for (const r of redemptions ?? []) {
        redemptionsByPromo[r.promotion_id as string] = (redemptionsByPromo[r.promotion_id as string] ?? 0) + 1;
      }
    }
  }

  // promotions
  const code = selection.promo_code.trim().toUpperCase();
  let codePromotion: PromotionRow | null = null;
  let referrerCustomerId: string | null = null;
  if (code) {
    const { data: byCode } = await supabase.from('promotions').select('*').eq('code', code).maybeSingle();
    if (byCode) codePromotion = byCode as PromotionRow;
    else if (/^[A-Z0-9]{6,12}$/.test(code)) {
      // maybe a customer referral code → apply the active referral promotion
      const { data: referrer } = await supabase.from('customers').select('id, email').eq('referral_code', code).maybeSingle();
      if (referrer && referrer.email !== email) {
        const { data: referral } = await supabase
          .from('promotions').select('*').eq('kind', 'referral').eq('is_active', true)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (referral) {
          codePromotion = referral as PromotionRow;
          referrerCustomerId = referrer.id as string;
        }
      }
    }
  }
  const { data: autos } = await supabase
    .from('promotions').select('*').in('kind', ['automatic', 'first_order', 'loyalty']).eq('is_active', true);

  try {
    const priced = priceOrder({
      service: service as ServiceRow,
      pkg: (pkg as PackageRow | null) ?? null,
      addons: selection.addon_ids.map((id) => addonRows.find((a) => a.id === id)!),
      codePromotion,
      codeEntered: code !== '',
      automaticPromotions: (autos ?? []) as PromotionRow[],
      ctx: { now: new Date(), isFirstOrder, completedOrders, redemptionsByPromo },
    });
    const usedReferral = priced.promotion?.kind === 'referral' ? referrerCustomerId : null;
    return { ...priced, service: service as ServiceRow, referrerCustomerId: usedReferral };
  } catch (err) {
    if (err instanceof PricingError) {
      throw new HttpError(422, err.code, 'Part of your selection is no longer available. Please review your order.');
    }
    throw err;
  }
}

// ───────────────────────── tracking tokens ─────────────────────────
export interface OrderRow {
  id: string;
  reference: string;
  customer_id: string;
  service_id: string | null;
  status: OrderStatus;
  payment_status: string;
  project_name: string;
  project_description: string;
  requested_features: string;
  preferred_design: string;
  reference_websites: string;
  target_deadline: string | null;
  budget_range: string;
  additional_notes: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_facebook: string;
  subtotal_centavos: number;
  discount_centavos: number;
  total_centavos: number;
  discount_label: string | null;
  quoted_total_centavos: number | null;
  deposit_due_centavos: number | null;
  amount_paid_centavos: number;
  deadline: string | null;
  created_at: string;
}

/** Resolves a tracking token to its order. Unknown, expired and revoked tokens all look the same. */
export async function orderFromToken(token: string): Promise<{ order: OrderRow; expiresAt: string }> {
  const supabase = db();
  const { data: access } = await supabase
    .from('order_access_tokens').select('id, order_id, expires_at, revoked_at')
    .eq('token_hash', hashToken(token)).maybeSingle();
  if (!access || access.revoked_at || new Date(access.expires_at as string).getTime() <= Date.now()) {
    throw new HttpError(404, 'LINK_INVALID', 'This tracking link is invalid or has expired. Request a new link below.');
  }
  const { data: order } = await supabase.from('orders').select('*').eq('id', access.order_id).maybeSingle();
  if (!order) throw new HttpError(404, 'LINK_INVALID', 'This tracking link is invalid or has expired. Request a new link below.');
  void supabase.from('order_access_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', access.id).then(() => undefined);
  return { order: order as OrderRow, expiresAt: access.expires_at as string };
}

export async function operationsSetting(name: string, fallback: number): Promise<number> {
  const { data } = await db().from('website_settings').select('published').eq('key', 'operations').maybeSingle();
  const v = Number((data?.published as Record<string, unknown> | null)?.[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

// ───────────────────────── documents ─────────────────────────
export async function loadBrand(): Promise<PdfDocumentInput['brand']> {
  const { data } = await db().rpc('get_published_site');
  const site = normalizeSiteDoc(data);
  return {
    name: site.brand.name,
    tagline: site.brand.tagline,
    email: site.brand.contact.email,
    phone: site.brand.contact.phone,
    address: site.brand.contact.address,
    accent: site.theme.colors.accent,
  };
}

export interface DocumentOptions {
  notes?: string;
  terms?: string;
  validDays?: number;
  customerVisible?: boolean;
  createdBy?: string | null;
  /** receipt / acknowledgment specifics */
  transaction?: { id: string; amount_centavos: number; method_name: string; transaction_reference: string; created_at: string };
  submission?: { method_name: string; transaction_reference: string; amount_claimed_centavos: number | null; created_at: string };
}

export interface CreatedDocument {
  id: string;
  number: string;
  kind: DocumentKind;
  title: string;
  storage_path: string;
  url: string;
}

export async function signedUrl(bucket: string, path: string, seconds: number, downloadName?: string): Promise<string> {
  const { data, error } = await db().storage.from(bucket).createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) throw new HttpError(500, 'STORAGE_ERROR', 'The file could not be prepared. Please try again.');
  return data.signedUrl;
}

/** Generates a branded PDF, stores it privately and records it in the documents table. */
export async function createDocument(order: OrderRow, kind: DocumentKind, opts: DocumentOptions = {}): Promise<CreatedDocument> {
  const supabase = db();
  const [{ data: items }, brand, { data: numberData, error: numberError }] = await Promise.all([
    supabase.from('order_items').select('name, quantity, unit_price_centavos, total_centavos').eq('order_id', order.id).order('created_at'),
    loadBrand(),
    supabase.rpc('next_reference', { p_scope: DOCUMENT_PREFIX[kind] }),
  ]);
  if (numberError || !numberData) throw new HttpError(500, 'DOCUMENT_ERROR', 'The document number could not be generated.');
  const number = numberData as string;
  const issuedAt = new Date();
  const agreedTotal = order.quoted_total_centavos ?? order.total_centavos;
  const balance = Math.max(agreedTotal - order.amount_paid_centavos, 0);

  const base: PdfDocumentInput = {
    kind, number, issuedAt, brand,
    order: { reference: order.reference, projectName: order.project_name, statusLabel: ORDER_STATUS_LABELS[order.status] },
    customer: { name: order.customer_name, email: order.customer_email, phone: order.customer_phone, facebook: order.customer_facebook },
  };
  const lineItems = {
    items: items ?? [],
    subtotalCentavos: order.subtotal_centavos,
    discountCentavos: order.discount_centavos,
    discountLabel: order.discount_label,
    totalCentavos: order.total_centavos,
  };
  const projectSections = [
    { heading: 'Project description', body: order.project_description },
    { heading: 'Requested features', body: order.requested_features },
    { heading: 'Preferred design', body: order.preferred_design },
    { heading: 'Reference websites', body: order.reference_websites },
    { heading: 'Additional notes', body: order.additional_notes },
  ];
  const quotedRows = order.quoted_total_centavos !== null
    ? [{ label: 'Quoted project total', value: money(order.quoted_total_centavos), bold: true }]
    : [];
  const depositRows = order.deposit_due_centavos !== null
    ? [{ label: 'Deposit to start', value: money(order.deposit_due_centavos) }]
    : [];

  let input: PdfDocumentInput;
  let amount: number | null = agreedTotal;
  switch (kind) {
    case 'order_summary':
      input = {
        ...base, ...lineItems, totalLabel: 'Estimated total',
        notice: 'This is an ORDER SUMMARY, not a payment receipt. No payment has been made or confirmed. The total shown is an estimate; your final price will be confirmed in a written quotation.',
        facts: [
          { label: 'Order date', value: formatDate(order.created_at, true) },
          { label: 'Target deadline', value: order.target_deadline ? formatDate(order.target_deadline) : 'Not specified' },
          { label: 'Budget range', value: order.budget_range || 'Not specified' },
        ],
        sections: projectSections,
      };
      amount = order.total_centavos;
      break;
    case 'quotation':
      input = {
        ...base, ...lineItems, totalLabel: 'Estimate at order',
        summaryRows: [...quotedRows, ...depositRows],
        facts: [
          { label: 'Valid until', value: formatDate(new Date(issuedAt.getTime() + (opts.validDays ?? 15) * 86400000)) },
          { label: 'Target delivery', value: order.deadline ? formatDate(order.deadline) : order.target_deadline ? formatDate(order.target_deadline) : 'To be agreed' },
        ],
        notice: 'This quotation is an offer for the work described below. It is not a receipt and does not confirm any payment.',
        sections: [...projectSections.slice(0, 2), { heading: 'Notes', body: opts.notes ?? '' }],
      };
      break;
    case 'contract':
      input = {
        ...base, ...lineItems, totalLabel: 'Estimate at order',
        summaryRows: [...quotedRows, ...depositRows],
        facts: [{ label: 'Target delivery', value: order.deadline ? formatDate(order.deadline) : 'To be agreed' }],
        sections: [
          { heading: 'Project description', body: order.project_description },
          { heading: 'Terms and conditions', body: opts.terms?.trim() ? opts.terms : DEFAULT_CONTRACT_TERMS },
          { heading: 'Notes', body: opts.notes ?? '' },
        ],
        signatures: true,
      };
      break;
    case 'invoice':
      input = {
        ...base, ...lineItems, totalLabel: 'Estimate at order',
        summaryRows: [
          ...quotedRows,
          { label: 'Verified payments', value: `- ${money(order.amount_paid_centavos)}` },
          { label: 'Balance due', value: money(balance), bold: true },
        ],
        notice: 'This invoice shows the amount due. It is not a receipt. Payments are confirmed only after manual verification.',
        sections: [{ heading: 'Notes', body: opts.notes ?? '' }],
      };
      amount = balance;
      break;
    case 'payment_acknowledgment': {
      const s = opts.submission!;
      input = {
        ...base,
        notice: 'We received your proof of payment. This acknowledgment is NOT a payment receipt — your payment is pending manual verification by our team.',
        facts: [
          { label: 'Payment method', value: s.method_name },
          { label: 'Transaction reference', value: s.transaction_reference },
          { label: 'Amount declared', value: s.amount_claimed_centavos ? money(s.amount_claimed_centavos) : 'Not stated' },
          { label: 'Submitted on', value: formatDate(s.created_at, true) },
          { label: 'Verification status', value: 'Pending review' },
        ],
      };
      amount = s.amount_claimed_centavos;
      break;
    }
    case 'receipt': {
      const t = opts.transaction!;
      input = {
        ...base,
        notice: 'Payment received and verified. Thank you!',
        facts: [
          { label: 'Amount received', value: money(t.amount_centavos) },
          { label: 'Payment method', value: t.method_name },
          { label: 'Transaction reference', value: t.transaction_reference },
          { label: 'Verified on', value: formatDate(t.created_at, true) },
        ],
        summaryRows: [
          { label: 'Project total', value: money(agreedTotal) },
          { label: 'Total verified payments', value: money(order.amount_paid_centavos) },
          { label: 'Remaining balance', value: money(balance), bold: true },
        ],
        sections: [{ heading: 'Notes', body: opts.notes ?? '' }],
      };
      amount = t.amount_centavos;
      break;
    }
  }

  const bytes = await generateDocumentPdf(input);
  const path = `${order.id}/${number}.pdf`;
  const { error: uploadError } = await supabase.storage.from('documents').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) {
    console.error('[documents] upload failed', uploadError.message);
    throw new HttpError(500, 'STORAGE_ERROR', 'The document could not be stored. Please try again.');
  }
  const title = `${DOCUMENT_KIND_LABELS[kind]} ${number}`;
  const { data: row, error } = await supabase.from('documents').insert({
    order_id: order.id, customer_id: order.customer_id, kind, number, title, storage_path: path,
    amount_centavos: amount, payment_transaction_id: opts.transaction?.id ?? null,
    is_customer_visible: opts.customerVisible ?? true, created_by: opts.createdBy ?? null,
    metadata: { valid_days: opts.validDays ?? null },
  }).select('id').single();
  if (error || !row) {
    await supabase.storage.from('documents').remove([path]);
    console.error('[documents] insert failed', error?.message);
    throw new HttpError(500, 'DOCUMENT_ERROR', 'The document could not be saved. Please try again.');
  }
  return { id: row.id as string, number, kind, title, storage_path: path, url: await signedUrl('documents', path, 600, `${number}.pdf`) };
}
