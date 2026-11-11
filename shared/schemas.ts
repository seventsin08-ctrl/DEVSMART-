// Request validation shared by the browser forms and the serverless functions.
import { z } from 'zod';
import { BUDGET_RANGES, PAYMENT_TYPES, PROOF_MIME_TYPES } from './constants';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id');
const trimmed = (max: number) => z.string().trim().max(max, `Maximum ${max} characters`);

/** Philippine mobile numbers: 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX. */
export const phMobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .refine((v) => /^(\+?63|0)9\d{9}$/.test(v), 'Enter a valid mobile number, e.g. 0917 123 4567');

export const emailSchema = z.string().trim().toLowerCase().max(254).email('Enter a valid email address');

export const selectionSchema = z.object({
  service_id: uuid,
  package_id: uuid.nullable().optional(),
  addon_ids: z.array(uuid).max(30).default([]),
  promo_code: trimmed(40).optional().default(''),
});

export const requirementsSchema = z.object({
  name: trimmed(200).min(2, 'Give your project a name'),
  description: trimmed(5000).min(10, 'Tell us a little more about the project (at least 10 characters)'),
  features: trimmed(5000).default(''),
  preferred_design: trimmed(2000).default(''),
  reference_websites: trimmed(2000).default(''),
  target_deadline: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Invalid date')
    .default(''),
  budget_range: z.enum(['', ...BUDGET_RANGES]).default(''),
  additional_notes: trimmed(5000).default(''),
});

export const customerSchema = z.object({
  full_name: trimmed(200).min(2, 'Enter your full name'),
  email: emailSchema,
  phone: phMobile,
  facebook: trimmed(300).min(3, 'Enter your Facebook profile link or name'),
  privacy_consent: z.literal(true, { error: 'Please agree to the privacy policy to continue' }),
});

/** Anti-spam fields added by the browser forms. */
export const antiSpamSchema = z.object({
  website: z.string().max(200).optional().default(''), // honeypot — must stay empty
  elapsed_ms: z.number().int().nonnegative().optional().default(0),
  turnstile_token: z.string().max(4000).optional().default(''),
});

export const quoteRequestSchema = selectionSchema.extend({
  email: z.string().trim().toLowerCase().max(254).optional().default(''),
});

export const orderRequestSchema = z.object({
  selection: selectionSchema,
  project: requirementsSchema,
  customer: customerSchema,
  antispam: antiSpamSchema.optional().default({ website: '', elapsed_ms: 0, turnstile_token: '' }),
});
export type OrderRequest = z.infer<typeof orderRequestSchema>;

export const trackingToken = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'Invalid tracking link');
export const orderReference = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^DVM-\d{4}-\d{6,}$/, 'Order references look like DVM-2026-000001');

export const trackRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('view'), token: trackingToken }),
  z.object({ action: z.literal('document'), token: trackingToken, document_id: uuid }),
  z.object({
    action: z.literal('request_link'),
    reference: orderReference,
    email: emailSchema,
    antispam: antiSpamSchema.optional(),
  }),
]);

export const paymentSubmitSchema = z.object({
  token: trackingToken,
  payment_method_id: uuid,
  payment_type: z.enum(PAYMENT_TYPES),
  amount: z.string().trim().max(20).optional().default(''),
  transaction_reference: z
    .string()
    .trim()
    .min(4, 'Enter the transaction / reference number from your payment')
    .max(120)
    .regex(/^[A-Za-z0-9 \-_/.#]+$/, 'Use letters, numbers, spaces and - _ / . # only'),
  file: z.object({
    name: z.string().max(255),
    type: z.enum(PROOF_MIME_TYPES, { error: 'Upload a JPG, PNG or PDF file' }),
    data: z.string().min(16), // base64
  }),
});

export const contactSchema = z.object({
  name: trimmed(200).min(2, 'Enter your name'),
  email: emailSchema,
  phone: trimmed(40).optional().default(''),
  message: trimmed(5000).min(10, 'Write at least 10 characters'),
  antispam: antiSpamSchema.optional(),
});

export const adminActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('review_payment'),
    submission_id: uuid,
    decision: z.enum(['under_review', 'verified', 'rejected', 'refunded']),
    amount: z.string().trim().max(20).optional().default(''),
    note: trimmed(1000).optional().default(''),
  }),
  z.object({
    action: z.literal('generate_document'),
    order_id: uuid,
    kind: z.enum(['quotation', 'contract', 'invoice', 'receipt', 'order_summary']),
    transaction_id: uuid.optional(),
    notes: trimmed(4000).optional().default(''),
    terms: trimmed(12000).optional().default(''),
    valid_days: z.number().int().min(1).max(365).optional().default(15),
    customer_visible: z.boolean().optional().default(true),
  }),
  z.object({ action: z.literal('tracking_link'), order_id: uuid, send_email: z.boolean().optional().default(false) }),
  z.object({ action: z.literal('email_status') }),
]);
export type AdminAction = z.infer<typeof adminActionSchema>;

/** Detects the real file type from its first bytes (never trust the declared MIME type). */
export function sniffMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return 'application/pdf';
  }
  return null;
}
