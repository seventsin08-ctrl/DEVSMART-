// Optional transactional email through Resend. When RESEND_API_KEY / EMAIL_FROM are not set,
// nothing is sent and callers are told so — the app never pretends an email went out.
import { escapeHtml } from './http';

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function adminNotifyEmail(): string | null {
  return process.env.ADMIN_NOTIFY_EMAIL?.trim() || null;
}

export interface EmailMessage {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  action?: { label: string; url: string };
  footer?: string;
}

function render(msg: EmailMessage): { html: string; text: string } {
  const paragraphs = msg.lines.map((l) => `<p style="margin:0 0 12px;line-height:1.6">${escapeHtml(l)}</p>`).join('');
  const action = msg.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(msg.action.url)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">${escapeHtml(msg.action.label)}</a></p>
       <p style="margin:0 0 12px;font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(msg.action.url)}</p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #e5e7eb">
      <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(msg.heading)}</h1>
      ${paragraphs}${action}
    </div>
    <p style="font-size:12px;color:#6b7280;margin:16px 4px">${escapeHtml(msg.footer ?? 'This is an automated message about your DevMart order.')}</p>
  </div></body></html>`;
  const text = [msg.heading, '', ...msg.lines, ...(msg.action ? ['', `${msg.action.label}: ${msg.action.url}`] : [])].join('\n');
  return { html, text };
}

export async function sendEmail(msg: EmailMessage): Promise<{ sent: boolean; reason?: string }> {
  if (!emailConfigured()) return { sent: false, reason: 'not_configured' };
  const { html, text } = render(msg);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html, text }),
    });
    if (!res.ok) {
      console.error('[email] provider rejected message', res.status, await res.text().catch(() => ''));
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] send failed', err);
    return { sent: false, reason: 'network_error' };
  }
}
