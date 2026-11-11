// POST /api/order-track — secure order tracking.
//   view          : token → order status, milestones, payments, documents
//   document      : token + document id → short-lived signed download URL
//   request_link  : reference + email → e-mails a fresh expiring link (response never reveals a match)
import type { Config } from '@netlify/functions';
import { ORDER_STATUS_DESCRIPTIONS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type PaymentStatus } from '../../shared/constants';
import { trackRequestSchema } from '../../shared/schemas';
import { emailConfigured, sendEmail } from './_lib/email';
import { checkSpam, rateLimit } from './_lib/guard';
import { HttpError, clientIp, endpoint, hashIp, hashToken, json, newToken, readBody, siteUrl } from './_lib/http';
import { operationsSetting, orderFromToken, signedUrl } from './_lib/orders';
import { db } from './_lib/supabase';

const maskRef = (ref: string) => (ref.length <= 4 ? '••••' : `${'•'.repeat(Math.min(ref.length - 4, 8))}${ref.slice(-4)}`);

export default endpoint(['POST'], async (req, context) => {
  const ip = clientIp(req, context);
  const ipHash = hashIp(ip);
  const body = await readBody(req, trackRequestSchema, 8 * 1024);
  const supabase = db();

  if (body.action === 'request_link') {
    await rateLimit('track-request', ipHash, 5, 3600);
    await checkSpam(body.antispam, ip, 1500);
    const generic = {
      ok: true,
      email_configured: emailConfigured(),
      message: emailConfigured()
        ? 'If the reference and email match an order, a new tracking link has been sent to that email address.'
        : 'Email delivery is not available right now. Please contact DevMart and we will send you a new tracking link.',
    };
    if (!emailConfigured()) return json(generic);
    const { data: order } = await supabase
      .from('orders').select('id, reference, customer_email, customer_name')
      .eq('reference', body.reference).maybeSingle();
    if (order && (order.customer_email as string).toLowerCase() === body.email) {
      const token = newToken();
      const days = await operationsSetting('tracking_link_days', 30);
      await supabase.from('order_access_tokens').insert({
        order_id: order.id, token_hash: hashToken(token),
        expires_at: new Date(Date.now() + Math.max(days, 1) * 86400000).toISOString(),
      });
      await sendEmail({
        to: order.customer_email as string,
        subject: `Your tracking link for ${order.reference}`,
        heading: 'Your new tracking link',
        lines: [`Hi ${order.customer_name}, here is a new private link to track order ${order.reference}.`, 'If you did not request this, you can ignore this email.'],
        action: { label: 'Track my order', url: `${siteUrl(req)}/track-order?t=${token}` },
      });
    }
    return json(generic);
  }

  await rateLimit('track-view', ipHash, 120, 600);
  const { order, expiresAt } = await orderFromToken(body.token);

  if (body.action === 'document') {
    const { data: doc } = await supabase
      .from('documents').select('number, storage_path')
      .eq('id', body.document_id).eq('order_id', order.id).eq('is_customer_visible', true).maybeSingle();
    if (!doc) throw new HttpError(404, 'NOT_FOUND', 'This document is not available.');
    return json({ url: await signedUrl('documents', doc.storage_path as string, 300, `${doc.number}.pdf`) });
  }

  const [items, history, project, updates, payments, documents, service] = await Promise.all([
    supabase.from('order_items').select('kind, name, quantity, total_centavos').eq('order_id', order.id).order('created_at'),
    supabase.from('order_status_history').select('to_status, created_at').eq('order_id', order.id).order('created_at'),
    supabase.from('projects').select('id, status, start_date, deadline, completed_at').eq('order_id', order.id).maybeSingle(),
    supabase.from('order_updates').select('body, created_at').eq('order_id', order.id).eq('is_public', true).order('created_at', { ascending: false }),
    supabase.from('payment_submissions')
      .select('id, method_name, payment_type, amount_claimed_centavos, verified_amount_centavos, transaction_reference, status, review_note, created_at')
      .eq('order_id', order.id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id, kind, number, title, created_at').eq('order_id', order.id).eq('is_customer_visible', true).order('created_at', { ascending: false }),
    order.service_id ? supabase.from('services').select('name').eq('id', order.service_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const milestones = project.data
    ? await supabase.from('project_milestones').select('title, description, due_date, status, completed_at')
        .eq('project_id', project.data.id).eq('is_public', true).order('sort_order')
    : { data: [] };

  const agreed = order.quoted_total_centavos ?? order.total_centavos;
  return json({
    order: {
      reference: order.reference,
      status: order.status,
      status_label: ORDER_STATUS_LABELS[order.status],
      status_description: ORDER_STATUS_DESCRIPTIONS[order.status],
      payment_status: order.payment_status,
      payment_status_label: PAYMENT_STATUS_LABELS[order.payment_status as PaymentStatus],
      project_name: order.project_name,
      service_name: (service.data as { name: string } | null)?.name ?? null,
      customer_first_name: order.customer_name.split(/\s+/)[0],
      created_at: order.created_at,
      target_deadline: order.target_deadline,
      deadline: order.deadline,
      subtotal_centavos: order.subtotal_centavos,
      discount_centavos: order.discount_centavos,
      discount_label: order.discount_label,
      estimate_centavos: order.total_centavos,
      quoted_total_centavos: order.quoted_total_centavos,
      deposit_due_centavos: order.deposit_due_centavos,
      amount_paid_centavos: order.amount_paid_centavos,
      balance_centavos: Math.max(agreed - order.amount_paid_centavos, 0),
    },
    items: items.data ?? [],
    history: history.data ?? [],
    project: project.data ? { status: project.data.status, start_date: project.data.start_date, deadline: project.data.deadline } : null,
    milestones: milestones.data ?? [],
    updates: updates.data ?? [],
    payments: (payments.data ?? []).map((p) => ({
      ...p,
      transaction_reference: maskRef(p.transaction_reference as string),
      status_label: PAYMENT_STATUS_LABELS[p.status as PaymentStatus],
      review_note: p.status === 'rejected' ? p.review_note : '',
    })),
    documents: documents.data ?? [],
    link_expires_at: expiresAt,
  });
});

export const config: Config = { path: '/api/order-track' };
