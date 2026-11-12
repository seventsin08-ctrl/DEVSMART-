import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/lib/utils';
import { generateDocumentPdf, toWinAnsi } from '../../shared/pdf';
import { customerSchema, orderReference, paymentSubmitSchema, phMobile, sniffMime, trackingToken } from '../../shared/schemas';
import { DEFAULT_SITE } from '../../shared/site/defaults';
import { normalizeSiteDoc, validateSiteDoc } from '../../shared/site/parse';
import { isSafeHref, isSafeImageUrl, safeHref } from '../../shared/site/schema';
import { historyReducer, setIn, type HistoryState } from '../../src/studio/store';

describe('request validation', () => {
  it('accepts Philippine mobile numbers only', () => {
    expect(phMobile.parse('0917 123 4567')).toBe('09171234567');
    expect(phMobile.parse('+63 917-123-4567')).toBe('+639171234567');
    expect(phMobile.safeParse('12345').success).toBe(false);
    expect(phMobile.safeParse('0817 123 4567').success).toBe(false);
  });
  it('requires privacy consent and a real email', () => {
    const ok = { full_name: 'Juan Dela Cruz', email: 'JUAN@Example.com', phone: '09171234567', facebook: 'fb.com/juan', privacy_consent: true };
    expect(customerSchema.parse(ok).email).toBe('juan@example.com');
    expect(customerSchema.safeParse({ ...ok, privacy_consent: false }).success).toBe(false);
    expect(customerSchema.safeParse({ ...ok, email: 'not-an-email' }).success).toBe(false);
  });
  it('validates references and tracking tokens', () => {
    expect(orderReference.parse('dvm-2026-000001')).toBe('DVM-2026-000001');
    expect(orderReference.safeParse('DVM-26-1').success).toBe(false);
    expect(trackingToken.safeParse('short').success).toBe(false);
    expect(trackingToken.safeParse('a'.repeat(43)).success).toBe(true);
    expect(trackingToken.safeParse(`${'a'.repeat(40)}/../`).success).toBe(false);
  });
  it('detects real file types from their bytes', () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffMime(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffMime(new TextEncoder().encode('<script>alert(1)</script>'))).toBeNull();
    expect(sniffMime(new TextEncoder().encode('MZ executable'))).toBeNull();
  });
  it('rejects unsupported proof types and bad transaction references', () => {
    const base = { token: 'a'.repeat(43), payment_method_id: '00000000-0000-4000-8000-000000000001', payment_type: 'deposit', transaction_reference: 'GC-12345', file: { name: 'x', type: 'image/png', data: 'A'.repeat(32) } };
    expect(paymentSubmitSchema.safeParse(base).success).toBe(true);
    expect(paymentSubmitSchema.safeParse({ ...base, file: { ...base.file, type: 'image/svg+xml' } }).success).toBe(false);
    expect(paymentSubmitSchema.safeParse({ ...base, transaction_reference: '<b>x</b>' }).success).toBe(false);
  });
});

describe('site document', () => {
  it('blocks script and data URLs everywhere', () => {
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,<script>', '//evil.example', 'vbscript:x', 'https://a.b/"onerror="x']) {
      expect(isSafeHref(bad), bad).toBe(false);
      expect(isSafeImageUrl(bad), bad).toBe(false);
      expect(safeHref(bad)).toBe('#');
    }
    for (const good of ['/pricing', '#faq', 'https://example.com/a?b=1', 'mailto:a@b.co', 'tel:+639171234567', '']) expect(isSafeHref(good), good).toBe(true);
  });
  it('the built-in default site is valid', () => {
    expect(validateSiteDoc(DEFAULT_SITE)).toEqual([]);
    expect(normalizeSiteDoc(null)).toEqual(DEFAULT_SITE);
    expect(normalizeSiteDoc({ pages: {}, theme: null })).toEqual(DEFAULT_SITE);
  });
  it('falls back to safe values instead of rendering invalid data', () => {
    const doc = normalizeSiteDoc({
      theme: { colors: { accent: 'red; background:url(javascript:x)' } },
      brand: { name: 'Acme', logoUrl: 'javascript:alert(1)' },
      navigation: { cta: { href: 'javascript:alert(1)' } },
      pages: { home: { sections: [
        { id: 'ok', type: 'cta', props: { title: 'Hello' } },
        { id: 'bad link', type: 'cta', props: {} },
        { id: 'x1', type: 'hero', props: { primaryButton: { href: 'javascript:alert(1)' } } },
        { id: 'x2', type: 'not-a-section', props: {} },
        { id: 'ok', type: 'faq', props: {} },
      ] } },
    });
    expect(doc.theme).toEqual(DEFAULT_SITE.theme);            // invalid colour → whole theme falls back
    expect(doc.brand).toEqual(DEFAULT_SITE.brand);            // unsafe logo URL → brand falls back
    expect(doc.navigation.cta.href).toBe('/start-a-project');
    expect(doc.pages.home.sections.map((s) => s.id)).toEqual(['ok']); // bad id, unsafe link, unknown type, duplicate id dropped
    expect(doc.pages.home.sections[0].props).toMatchObject({ title: 'Hello' });
  });
  it('keeps functional sections on their pages even if removed from stored data', () => {
    const doc = normalizeSiteDoc({ pages: { 'start-a-project': { sections: [] }, payment: { sections: [] } } });
    expect(doc.pages['start-a-project'].sections.some((s) => s.type === 'orderForm')).toBe(true);
    expect(doc.pages.payment.sections.some((s) => s.type === 'payment')).toBe(true);
  });
});

describe('studio history', () => {
  const start: HistoryState = { past: [], present: DEFAULT_SITE, future: [], saved: DEFAULT_SITE, lastKey: null, lastAt: 0 };
  it('supports undo and redo and tracks unsaved changes', () => {
    let s = historyReducer(start, { type: 'set', path: ['brand', 'name'], value: 'A', key: 'brand.name', at: 1000 });
    s = historyReducer(s, { type: 'set', path: ['brand', 'tagline'], value: 'B', key: 'brand.tagline', at: 5000 });
    expect(s.present.brand).toMatchObject({ name: 'A', tagline: 'B' });
    expect(s.present).not.toBe(s.saved);
    expect(DEFAULT_SITE.brand.name).toBe('DevMart'); // original never mutated
    s = historyReducer(s, { type: 'undo' });
    expect(s.present.brand.tagline).toBe(DEFAULT_SITE.brand.tagline);
    s = historyReducer(s, { type: 'redo' });
    expect(s.present.brand.tagline).toBe('B');
    s = historyReducer(s, { type: 'saved' });
    expect(s.present).toBe(s.saved);
  });
  it('merges rapid edits to the same field into one undo step', () => {
    let s = historyReducer(start, { type: 'set', path: ['brand', 'name'], value: 'D', key: 'brand.name', at: 1000 });
    s = historyReducer(s, { type: 'set', path: ['brand', 'name'], value: 'De', key: 'brand.name', at: 1200 });
    s = historyReducer(s, { type: 'set', path: ['brand', 'name'], value: 'Dev', key: 'brand.name', at: 1400 });
    expect(s.past).toHaveLength(1);
    expect(historyReducer(s, { type: 'undo' }).present.brand.name).toBe('DevMart');
  });
  it('setIn copies only the changed branch', () => {
    const next = setIn(DEFAULT_SITE, ['pages', 'home', 'sections', 0, 'visible'], false);
    expect(next.pages.home.sections[0].visible).toBe(false);
    expect(next.pages.home.sections[1]).toBe(DEFAULT_SITE.pages.home.sections[1]);
    expect(next.theme).toBe(DEFAULT_SITE.theme);
  });
});

describe('documents and exports', () => {
  it('generates a real PDF, even with emoji, peso signs and very long words', async () => {
    const bytes = await generateDocumentPdf({
      kind: 'order_summary', number: 'SUM-2026-000001', issuedAt: new Date('2026-06-01T02:00:00Z'),
      brand: { name: 'DevMart', accent: '#2f6bff' },
      order: { reference: 'DVM-2026-000001', projectName: 'Café Niño 🚀 site' },
      customer: { name: 'Señor Peña', email: 'a@b.co', phone: '09171234567' },
      items: [{ name: 'Business Website', quantity: 1, unit_price_centavos: 600000, total_centavos: 600000 }],
      subtotalCentavos: 600000, discountCentavos: 60000, discountLabel: 'Promo', totalCentavos: 540000,
      notice: 'This is an ORDER SUMMARY, not a payment receipt.',
      sections: [{ heading: 'Notes', body: `₱5,000 budget ✓ ${'https://example.com/'.padEnd(400, 'x')}\n\n${'Long text. '.repeat(600)}` }],
    });
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(2000);
  });
  it('replaces characters the PDF fonts cannot draw', () => {
    expect(toWinAnsi('₱5 “ok” — niño 🚀')).toBe('PHP 5 "ok" - niño ??');
  });
  it('exports CSV safely', () => {
    const csv = toCsv([{ name: 'A, "B"', note: '=HYPERLINK("x")', n: 5 }]);
    expect(csv).toContain('"A, ""B"""');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
