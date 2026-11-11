// POST /api/payment-submit — a customer uploads a proof of payment for manual verification.
// Nothing here can mark a payment as verified.
import crypto from 'node:crypto';
import type { Config } from '@netlify/functions';
import { PROOF_MAX_BYTES } from '../../shared/constants';
import { parsePesos } from '../../shared/money';
import { paymentSubmitSchema, sniffMime } from '../../shared/schemas';
import { adminNotifyEmail, sendEmail } from './_lib/email';
import { rateLimit } from './_lib/guard';
import { HttpError, clientIp, endpoint, hashIp, json, readBody, siteUrl } from './_lib/http';
import { createDocument, orderFromToken } from './_lib/orders';
import { db } from './_lib/supabase';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

export default endpoint(['POST'], async (req, context) => {
  const ipHash = hashIp(clientIp(req, context));
  await rateLimit('payment', ipHash, 8, 3600);
  // 4 MB file → ~5.4 MB of base64 + JSON overhead
  const body = await readBody(req, paymentSubmitSchema, 5.8 * 1024 * 1024);
  const { order } = await orderFromToken(body.token);
  const supabase = db();

  if (order.status === 'cancelled') throw new HttpError(409, 'ORDER_CLOSED', 'This order was cancelled and can no longer receive payments.');

  const { count: pending } = await supabase
    .from('payment_submissions').select('id', { count: 'exact', head: true })
    .eq('order_id', order.id).in('status', ['proof_submitted', 'under_review']);
  if ((pending ?? 0) >= 3) {
    throw new HttpError(409, 'TOO_MANY_PENDING', 'You already have payment proofs waiting for review. Please wait for our team to check them.');
  }

  const { data: method } = await supabase
    .from('payment_methods').select('id, name').eq('id', body.payment_method_id).eq('is_active', true).maybeSingle();
  if (!method) throw new HttpError(422, 'METHOD_UNAVAILABLE', 'This payment method is no longer available. Please choose another.');

  let amount: number | null = null;
  if (body.amount !== '') {
    amount = parsePesos(body.amount);
    if (amount === null || amount <= 0) {
      throw new HttpError(422, 'VALIDATION_FAILED', 'Please check the highlighted fields.', { amount: 'Enter a valid amount, e.g. 2500 or 2,500.00' });
    }
  }

  // ── file validation: size, real content type (magic bytes), declared type must match ──
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(body.file.data)) throw new HttpError(422, 'INVALID_FILE', 'The file could not be read. Please upload it again.');
  const bytes = Buffer.from(body.file.data, 'base64');
  if (bytes.length === 0) throw new HttpError(422, 'INVALID_FILE', 'The file is empty.');
  if (bytes.length > PROOF_MAX_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE', 'The file is larger than 4 MB. Please upload a smaller file.');
  const detected = sniffMime(bytes);
  if (!detected || detected !== body.file.type) {
    throw new HttpError(422, 'INVALID_FILE', 'Only genuine JPG, PNG or PDF files are accepted.');
  }

  const { data: duplicate } = await supabase
    .from('payment_submissions').select('id')
    .eq('order_id', order.id).eq('transaction_reference', body.transaction_reference)
    .in('status', ['proof_submitted', 'under_review', 'verified']).maybeSingle();
  if (duplicate) throw new HttpError(409, 'DUPLICATE', 'A payment with this transaction reference was already submitted for this order.');

  // random server-side name — the customer-supplied filename is never used in the path
  const path = `${order.id}/${crypto.randomUUID()}.${EXT[detected]}`;
  const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(path, bytes, { contentType: detected, upsert: false });
  if (uploadError) {
    console.error('[payment-submit] upload failed', uploadError.message);
    throw new HttpError(500, 'STORAGE_ERROR', 'Your file could not be uploaded. Please try again.');
  }

  const { data: submission, error } = await supabase.from('payment_submissions').insert({
    order_id: order.id, payment_method_id: method.id, method_name: method.name,
    payment_type: body.payment_type, amount_claimed_centavos: amount,
    transaction_reference: body.transaction_reference, proof_path: path, proof_mime: detected, proof_size: bytes.length,
    // status defaults to 'proof_submitted' — verification is a separate, admin-only action
  }).select('id, method_name, transaction_reference, amount_claimed_centavos, created_at, status').single();
  if (error || !submission) {
    await supabase.storage.from('payment-proofs').remove([path]);
    console.error('[payment-submit] insert failed', error?.message);
    throw new HttpError(500, 'SUBMIT_FAILED', 'Your payment proof could not be saved. Please try again.');
  }

  let acknowledgmentUrl: string | null = null;
  try {
    const doc = await createDocument(order, 'payment_acknowledgment', {
      submission: submission as { method_name: string; transaction_reference: string; amount_claimed_centavos: number | null; created_at: string },
    });
    acknowledgmentUrl = doc.url;
  } catch (err) {
    console.error('[payment-submit] acknowledgment pdf failed', err);
  }

  const admin = adminNotifyEmail();
  if (admin) {
    await sendEmail({
      to: admin,
      subject: `Payment proof submitted — ${order.reference}`,
      heading: `Payment proof for ${order.reference}`,
      lines: [`${order.customer_name} submitted a ${method.name} payment proof (reference ${body.transaction_reference}).`, 'Review and verify it in the dashboard.'],
      action: { label: 'Review payment', url: `${siteUrl(req)}/admin/payments` },
      footer: 'DevMart admin notification.',
    });
  }

  return json({ id: submission.id, status: submission.status, acknowledgment_url: acknowledgmentUrl }, 201);
});

export const config: Config = { path: '/api/payment-submit' };
