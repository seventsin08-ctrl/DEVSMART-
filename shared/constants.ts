export const TIME_ZONE = 'Asia/Manila';

export const ORDER_STATUSES = [
  'pending_review', 'contacted', 'quotation_sent', 'awaiting_approval', 'awaiting_deposit',
  'payment_under_review', 'payment_verified', 'in_development', 'revision',
  'awaiting_final_payment', 'completed', 'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_review: 'Pending Review',
  contacted: 'Contacted',
  quotation_sent: 'Quotation Sent',
  awaiting_approval: 'Awaiting Approval',
  awaiting_deposit: 'Awaiting Deposit',
  payment_under_review: 'Payment Under Review',
  payment_verified: 'Payment Verified',
  in_development: 'In Development',
  revision: 'Revision',
  awaiting_final_payment: 'Awaiting Final Payment',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  pending_review: 'We received your order and will review it shortly.',
  contacted: 'We have reached out to you about your project.',
  quotation_sent: 'A formal quotation has been sent for your review.',
  awaiting_approval: 'We are waiting for your approval to proceed.',
  awaiting_deposit: 'Please send your deposit to start development.',
  payment_under_review: 'We are checking the payment proof you submitted.',
  payment_verified: 'Your payment is verified. Development will start soon.',
  in_development: 'Your project is being built.',
  revision: 'We are working on the changes you requested.',
  awaiting_final_payment: 'Your project is ready. Please settle the remaining balance.',
  completed: 'Your project is complete. Thank you!',
  cancelled: 'This order was cancelled.',
};

export const PAYMENT_STATUSES = [
  'awaiting_payment', 'proof_submitted', 'under_review', 'verified', 'rejected', 'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  awaiting_payment: 'Awaiting Payment',
  proof_submitted: 'Proof Submitted',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  refunded: 'Refunded',
};

export const PAYMENT_TYPES = ['deposit', 'full', 'final', 'other'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: 'Deposit / down payment',
  full: 'Full payment',
  final: 'Final / remaining balance',
  other: 'Other',
};

export const BUDGET_RANGES = [
  'Below ₱5,000', '₱5,000 – ₱10,000', '₱10,000 – ₱20,000', '₱20,000 – ₱50,000', 'Above ₱50,000', 'Not sure yet',
] as const;

export const DOCUMENT_KINDS = [
  'order_summary', 'quotation', 'contract', 'payment_acknowledgment', 'receipt', 'invoice',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  order_summary: 'Order Summary',
  quotation: 'Quotation',
  contract: 'Service Agreement',
  payment_acknowledgment: 'Payment Acknowledgment',
  receipt: 'Payment Receipt',
  invoice: 'Invoice',
};
export const DOCUMENT_PREFIX: Record<DocumentKind, string> = {
  order_summary: 'SUM', quotation: 'QUO', contract: 'CON',
  payment_acknowledgment: 'ACK', receipt: 'REC', invoice: 'INV',
};

export const PROMOTION_KINDS = ['promo_code', 'automatic', 'first_order', 'loyalty', 'referral'] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];
export const PROMOTION_KIND_LABELS: Record<PromotionKind, string> = {
  promo_code: 'Promo code',
  automatic: 'Automatic (everyone)',
  first_order: 'First-order discount',
  loyalty: 'Loyalty reward',
  referral: 'Referral discount',
};

export const PROOF_MAX_BYTES = 4 * 1024 * 1024; // 4 MB (fits the serverless request limit once base64-encoded)
export const PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type ProofMime = (typeof PROOF_MIME_TYPES)[number];

/** Formats an ISO timestamp / date in Asia/Manila. */
export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+08:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: TIME_ZONE, year: 'numeric', month: 'short', day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(d);
}

/** Today's date (YYYY-MM-DD) in Asia/Manila. */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
