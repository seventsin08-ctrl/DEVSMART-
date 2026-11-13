// POST /api/order-create — validates, prices on the server, stores the order atomically,
// issues a private tracking link and generates the order summary PDF.
import { formatPHP } from '../../shared/money';
import { orderRequestSchema } from '../../shared/schemas';
import { adminNotifyEmail, sendEmail } from './_lib/email';
import { checkSpam, rateLimit } from './_lib/guard';
import { HttpError, clientIp, endpoint, hashIp, hashToken, json, newToken, readBody, siteUrl } from './_lib/http';
import { createDocument, operationsSetting, priceSelection, type OrderRow } from './_lib/orders';
import { db } from './_lib/supabase';

export default endpoint(['POST'], async (req, context) => {
  const ip = clientIp(req, context);
  const ipHash = hashIp(ip);
  await rateLimit('order', ipHash, 5, 3600);
  const body = await readBody(req, orderRequestSchema, 48 * 1024);
  await checkSpam(body.antispam, ip, 4000);

  const priced = await priceSelection(
    { ...body.selection, package_id: body.selection.package_id ?? null }, body.customer.email,
  );
  if (body.selection.promo_code.trim() !== '' && priced.codeProblem) {
    throw new HttpError(422, 'PROMO_INVALID', 'The promo code could not be applied. Remove it or try another code.',
      { 'selection.promo_code': 'This code cannot be applied to your order.' });
  }

  const token = newToken();
  const days = await operationsSetting('tracking_link_days', 30);
  const expiresAt = new Date(Date.now() + Math.max(days, 1) * 86400000).toISOString();

  const { data, error } = await db().rpc('create_order_tx', {
    p: {
      service_id: priced.service.id,
      customer: {
        full_name: body.customer.full_name, email: body.customer.email,
        phone: body.customer.phone, facebook: body.customer.facebook,
      },
      project: body.project,
      items: priced.items,
      subtotal_centavos: priced.subtotal,
      discount_centavos: priced.discount,
      promotion_id: priced.promotion?.id ?? '',
      promo_code: priced.promotion ? body.selection.promo_code.trim().toUpperCase() : '',
      discount_label: priced.discountLabel ?? '',
      referrer_customer_id: priced.referrerCustomerId ?? '',
      token_hash: hashToken(token),
      token_expires_at: expiresAt,
      ip_hash: ipHash,
    },
  });
  if (error || !data) {
    if (error?.message.includes('PROMO_UNAVAILABLE')) {
      throw new HttpError(409, 'PROMO_UNAVAILABLE', 'This promotion just reached its limit. Please remove the code and submit again.');
    }
    console.error('[order-create] rpc failed', error?.message);
    throw new HttpError(500, 'ORDER_FAILED', 'We could not save your order. Please try again.');
  }
  const result = data as { order_id: string; reference: string };

  const trackingUrl = `${siteUrl(req)}/track-order?t=${token}`;
  let summaryUrl: string | null = null;
  try {
    const { data: order } = await db().from('orders').select('*').eq('id', result.order_id).single();
    const doc = await createDocument(order as OrderRow, 'order_summary');
    summaryUrl = doc.url;
  } catch (err) {
    // The order itself is safely stored; the summary can be regenerated from the admin dashboard.
    console.error('[order-create] summary pdf failed', err);
  }

  const total = formatPHP(priced.total);
  const admin = adminNotifyEmail();
  const [customerMail] = await Promise.all([
    sendEmail({
      to: body.customer.email,
      subject: `We received your order ${result.reference}`,
      heading: `Order ${result.reference} received`,
      lines: [
        `Hi ${body.customer.full_name}, thank you for your order for "${body.project.name}".`,
        `Estimated total: ${total}. This is an estimate — we will send a quotation after reviewing your requirements.`,
        'Use the private link below to track your order. Keep it safe and do not share it.',
      ],
      action: { label: 'Track my order', url: trackingUrl },
    }),
    admin
      ? sendEmail({
          to: admin,
          subject: `New order ${result.reference} — ${priced.service.name}`,
          heading: `New order ${result.reference}`,
          lines: [
            `${body.customer.full_name} (${body.customer.email}, ${body.customer.phone}) requested "${body.project.name}".`,
            `Service: ${priced.service.name}. Estimated total: ${total}.`,
          ],
          action: { label: 'Open in dashboard', url: `${siteUrl(req)}/admin/orders/${result.order_id}` },
          footer: 'DevMart admin notification.',
        })
      : Promise.resolve({ sent: false }),
  ]);

  return json({
    reference: result.reference,
    status: 'pending_review',
    tracking_url: trackingUrl,
    tracking_expires_at: expiresAt,
    summary_url: summaryUrl,
    email_sent: customerMail.sent,
    totals: {
      subtotal_centavos: priced.subtotal, discount_centavos: priced.discount,
      discount_label: priced.discountLabel, total_centavos: priced.total,
    },
  }, 201);
});
