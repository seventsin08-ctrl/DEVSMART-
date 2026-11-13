// POST /api/admin-action — privileged operations for the admin dashboard.
// Every call re-verifies the caller: valid session + allowlisted + MFA (aal2).
import { formatPHP, parsePesos } from '../../shared/money';
import { adminActionSchema } from '../../shared/schemas';
import { emailConfigured, sendEmail } from './_lib/email';
import { HttpError, endpoint, json, readBody, siteUrl } from './_lib/http';
import { createDocument, type OrderRow } from './_lib/orders';
import { db, requireAdmin } from './_lib/supabase';

const RPC_ERRORS: Record<string, [number, string]> = {
  INVALID_TRANSITION: [409, 'This payment has already been processed.'],
  AMOUNT_REQUIRED: [422, 'Enter the amount you verified.'],
  SUBMISSION_NOT_FOUND: [404, 'Payment submission not found.'],
  ORDER_NOT_FOUND: [404, 'Order not found.'],
  FORBIDDEN: [403, 'You do not have access to this action.'],
};
function rpcError(message: string | undefined): HttpError {
  for (const [code, [status, text]] of Object.entries(RPC_ERRORS)) {
    if (message?.includes(code)) return new HttpError(status, code, text);
  }
  console.error('[admin-action] rpc error', message);
  return new HttpError(500, 'ACTION_FAILED', 'The action could not be completed.');
}

async function loadOrder(orderId: string): Promise<OrderRow> {
  const { data } = await db().from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!data) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return data as OrderRow;
}

export default endpoint(['POST'], async (req) => {
  const admin = await requireAdmin(req);
  const body = await readBody(req, adminActionSchema, 32 * 1024);

  switch (body.action) {
    case 'email_status':
      return json({ email_configured: emailConfigured() });

    case 'review_payment': {
      let amount: number | null = null;
      if (body.decision === 'verified') {
        amount = parsePesos(body.amount);
        if (amount === null || amount <= 0) throw new HttpError(422, 'AMOUNT_REQUIRED', 'Enter the amount you verified.');
      }
      // Runs as the admin so is_admin(), auth.uid() and the audit trail all apply.
      const { data, error } = await admin.asUser.rpc('admin_review_payment', {
        p_submission_id: body.submission_id, p_decision: body.decision, p_amount_centavos: amount, p_note: body.note,
      });
      if (error) throw rpcError(error.message);
      const result = data as { order_id: string; transaction_id: string | null };
      const order = await loadOrder(result.order_id);

      let receipt = null;
      if (body.decision === 'verified' && result.transaction_id) {
        const { data: txn } = await db().from('payment_transactions').select('*').eq('id', result.transaction_id).single();
        try {
          receipt = await createDocument(order, 'receipt', { transaction: txn, createdBy: admin.user.id });
        } catch (err) {
          console.error('[admin-action] receipt generation failed', err);
        }
      }

      let emailSent = false;
      if (body.decision === 'verified' || body.decision === 'rejected') {
        const mail = await sendEmail({
          to: order.customer_email,
          subject: body.decision === 'verified' ? `Payment verified — ${order.reference}` : `Payment proof not accepted — ${order.reference}`,
          heading: body.decision === 'verified' ? 'Your payment is verified' : 'We could not verify your payment',
          lines: body.decision === 'verified'
            ? [`Hi ${order.customer_name}, we verified your payment of ${formatPHP(amount ?? 0)} for order ${order.reference}.`, 'Your receipt is available on your tracking page.']
            : [`Hi ${order.customer_name}, we could not verify the payment proof you submitted for order ${order.reference}.`, body.note ? `Reason: ${body.note}` : 'Please submit a new, clear proof of payment or contact us.'],
        });
        emailSent = mail.sent;
      }
      return json({ ...result, receipt, email_sent: emailSent });
    }

    case 'generate_document': {
      const order = await loadOrder(body.order_id);
      if (body.kind === 'receipt') {
        // Receipts exist only for verified ledger entries.
        if (!body.transaction_id) throw new HttpError(422, 'TRANSACTION_REQUIRED', 'Choose the verified payment this receipt is for.');
        const { data: txn } = await db().from('payment_transactions').select('*')
          .eq('id', body.transaction_id).eq('order_id', order.id).eq('kind', 'payment').maybeSingle();
        if (!txn) throw new HttpError(422, 'NOT_VERIFIED', 'Receipts can only be issued for verified payments.');
        return json({ document: await createDocument(order, 'receipt', { transaction: txn, notes: body.notes, createdBy: admin.user.id, customerVisible: body.customer_visible }) });
      }
      const document = await createDocument(order, body.kind, {
        notes: body.notes, terms: body.terms, validDays: body.valid_days,
        customerVisible: body.customer_visible, createdBy: admin.user.id,
      });
      return json({ document });
    }

    case 'tracking_link': {
      const { data, error } = await admin.asUser.rpc('admin_issue_tracking_token', { p_order_id: body.order_id });
      if (error) throw rpcError(error.message);
      const issued = data as { token: string; expires_at: string };
      const url = `${siteUrl(req)}/track-order?t=${issued.token}`;
      let emailSent = false;
      if (body.send_email) {
        const order = await loadOrder(body.order_id);
        const mail = await sendEmail({
          to: order.customer_email,
          subject: `Your tracking link for ${order.reference}`,
          heading: 'Track your order',
          lines: [`Hi ${order.customer_name}, use this private link to follow order ${order.reference}.`],
          action: { label: 'Track my order', url },
        });
        emailSent = mail.sent;
      }
      return json({ url, expires_at: issued.expires_at, email_sent: emailSent, email_configured: emailConfigured() });
    }
  }
});
