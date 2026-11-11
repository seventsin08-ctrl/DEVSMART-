// POST /api/contact — public contact form.
import type { Config } from '@netlify/functions';
import { contactSchema } from '../../shared/schemas';
import { adminNotifyEmail, sendEmail } from './_lib/email';
import { checkSpam, rateLimit } from './_lib/guard';
import { HttpError, clientIp, endpoint, hashIp, json, readBody } from './_lib/http';
import { db } from './_lib/supabase';

export default endpoint(['POST'], async (req, context) => {
  const ip = clientIp(req, context);
  await rateLimit('contact', hashIp(ip), 5, 3600);
  const body = await readBody(req, contactSchema, 16 * 1024);
  await checkSpam(body.antispam, ip, 2500);

  const { error } = await db().from('contact_messages').insert({
    name: body.name, email: body.email, phone: body.phone, message: body.message,
  });
  if (error) {
    console.error('[contact] insert failed', error.message);
    throw new HttpError(500, 'SEND_FAILED', 'Your message could not be sent. Please try again.');
  }
  const admin = adminNotifyEmail();
  if (admin) {
    await sendEmail({
      to: admin, subject: `New message from ${body.name}`, heading: `Message from ${body.name}`,
      lines: [`Email: ${body.email}${body.phone ? ` · Phone: ${body.phone}` : ''}`, body.message],
      footer: 'DevMart admin notification.',
    });
  }
  return json({ ok: true }, 201);
});

export const config: Config = { path: '/api/contact' };
