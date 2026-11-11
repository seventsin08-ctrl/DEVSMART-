// Branded PDF documents (order summaries, quotations, agreements, acknowledgments, receipts, invoices).
// Uses pdf-lib with standard fonts so it runs identically in Node (serverless) and in tests.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { DOCUMENT_KIND_LABELS, formatDate, type DocumentKind } from './constants';
import { formatPHP } from './money';

export interface PdfLineItem {
  name: string;
  quantity: number;
  unit_price_centavos: number;
  total_centavos: number;
}

export interface PdfDocumentInput {
  kind: DocumentKind;
  number: string;
  issuedAt: Date;
  brand: { name: string; tagline?: string; email?: string; phone?: string; address?: string; accent?: string };
  order: { reference: string; projectName: string; statusLabel?: string; createdAt?: string };
  customer: { name: string; email: string; phone: string; facebook?: string };
  items?: PdfLineItem[];
  subtotalCentavos?: number;
  discountCentavos?: number;
  discountLabel?: string | null;
  totalCentavos?: number;
  totalLabel?: string;
  /** extra label/value rows shown under the totals (e.g. deposit due, amount paid, balance) */
  summaryRows?: { label: string; value: string; bold?: boolean }[];
  /** key facts box (payment details, validity…) */
  facts?: { label: string; value: string }[];
  /** free text sections: project details, terms, notes */
  sections?: { heading: string; body: string }[];
  /** prominent notice printed in a tinted box */
  notice?: string;
  signatures?: boolean;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.46, 0.53);
const LINE = rgb(0.87, 0.89, 0.92);
const TINT = rgb(0.95, 0.97, 1);

/** Standard PDF fonts only cover WinAnsi (Latin-1 + a few extras). Replace anything else. */
export function toWinAnsi(input: string): string {
  return String(input ?? '')
    .replace(/₱/g, 'PHP ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/\t/g, '  ')
    .replace(/[^\x0A\x20-\x7E¡-ÿ]/g, '?');
}

const money = (centavos: number) => formatPHP(centavos, { symbol: 'PHP ', alwaysDecimals: true });

function hexToRgb(hex: string | undefined) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return rgb(0.15, 0.39, 0.92);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of toWinAnsi(text).split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const rawWord of paragraph.split(/\s+/)) {
      let word = rawWord;
      // hard-break words that are wider than the line (long URLs)
      while (font.widthOfTextAtSize(word, size) > maxWidth) {
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut -= 1;
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function generateDocumentPdf(input: PdfDocumentInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(input.brand.accent);
  const title = DOCUMENT_KIND_LABELS[input.kind];
  const contentWidth = A4[0] - MARGIN * 2;

  pdf.setTitle(`${title} ${input.number}`);
  pdf.setAuthor(toWinAnsi(input.brand.name));
  pdf.setSubject(`${title} for order ${input.order.reference}`);
  pdf.setCreationDate(input.issuedAt);

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGIN;

  const newPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const ensure = (height: number) => {
    if (y - height < MARGIN + 30) newPage();
  };
  const draw = (text: string, x: number, size: number, font = regular, color = INK) => {
    page.drawText(toWinAnsi(text), { x, y, size, font, color });
  };
  const drawRight = (text: string, right: number, size: number, font = regular, color = INK) => {
    const t = toWinAnsi(text);
    page.drawText(t, { x: right - font.widthOfTextAtSize(t, size), y, size, font, color });
  };
  const paragraph = (text: string, size = 10, font = regular, color = INK, width = contentWidth, x = MARGIN) => {
    for (const line of wrap(text, font, size, width)) {
      ensure(size + 4);
      if (line) page.drawText(line, { x, y, size, font, color });
      y -= size + 4;
    }
  };
  const rule = () => {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.7, color: LINE });
  };

  // ── header ──
  page.drawRectangle({ x: 0, y: A4[1] - 8, width: A4[0], height: 8, color: accent });
  y -= 6;
  draw(input.brand.name, MARGIN, 22, bold);
  drawRight(title.toUpperCase(), A4[0] - MARGIN, 14, bold, accent);
  y -= 16;
  if (input.brand.tagline) draw(input.brand.tagline, MARGIN, 9, regular, MUTED);
  drawRight(`No. ${input.number}`, A4[0] - MARGIN, 10, regular, INK);
  y -= 13;
  const contactLine = [input.brand.email, input.brand.phone, input.brand.address].filter(Boolean).join('  |  ');
  if (contactLine) draw(contactLine, MARGIN, 8.5, regular, MUTED);
  drawRight(`Date: ${formatDate(input.issuedAt)}`, A4[0] - MARGIN, 10, regular, INK);
  y -= 16;
  rule();
  y -= 22;

  // ── parties ──
  const colX = MARGIN + contentWidth / 2 + 10;
  const top = y;
  draw('PREPARED FOR', MARGIN, 8, bold, MUTED);
  y -= 14;
  draw(input.customer.name, MARGIN, 11, bold);
  y -= 14;
  for (const line of [input.customer.email, input.customer.phone, input.customer.facebook].filter(Boolean) as string[]) {
    for (const l of wrap(line, regular, 9.5, contentWidth / 2 - 10)) {
      page.drawText(l, { x: MARGIN, y, size: 9.5, font: regular, color: INK });
      y -= 13;
    }
  }
  const leftBottom = y;
  y = top;
  page.drawText('ORDER', { x: colX, y, size: 8, font: bold, color: MUTED });
  y -= 14;
  page.drawText(toWinAnsi(input.order.reference), { x: colX, y, size: 11, font: bold, color: INK });
  y -= 14;
  for (const l of wrap(input.order.projectName, regular, 9.5, contentWidth / 2 - 10)) {
    page.drawText(l, { x: colX, y, size: 9.5, font: regular, color: INK });
    y -= 13;
  }
  if (input.order.statusLabel) {
    page.drawText(toWinAnsi(`Status: ${input.order.statusLabel}`), { x: colX, y, size: 9.5, font: regular, color: MUTED });
    y -= 13;
  }
  y = Math.min(y, leftBottom) - 12;

  // ── notice ──
  if (input.notice) {
    const lines = wrap(input.notice, regular, 9.5, contentWidth - 24);
    const h = lines.length * 13.5 + 16;
    ensure(h + 10);
    page.drawRectangle({ x: MARGIN, y: y - h + 10, width: contentWidth, height: h, color: TINT, borderColor: LINE, borderWidth: 0.7 });
    page.drawRectangle({ x: MARGIN, y: y - h + 10, width: 3, height: h, color: accent });
    y -= 6;
    for (const l of lines) {
      page.drawText(l, { x: MARGIN + 14, y, size: 9.5, font: regular, color: INK });
      y -= 13.5;
    }
    y -= 14;
  }

  // ── facts ──
  if (input.facts?.length) {
    for (const fact of input.facts) {
      ensure(16);
      draw(fact.label, MARGIN, 9.5, regular, MUTED);
      const lines = wrap(fact.value, bold, 9.5, contentWidth - 170);
      for (const l of lines) {
        page.drawText(l, { x: MARGIN + 170, y, size: 9.5, font: bold, color: INK });
        y -= 14;
      }
      if (lines.length === 0) y -= 14;
    }
    y -= 10;
  }

  // ── line items ──
  if (input.items?.length) {
    ensure(60);
    const right = A4[0] - MARGIN;
    page.drawRectangle({ x: MARGIN, y: y - 6, width: contentWidth, height: 20, color: TINT });
    draw('DESCRIPTION', MARGIN + 8, 8, bold, MUTED);
    drawRight('QTY', right - 190, 8, bold, MUTED);
    drawRight('UNIT PRICE', right - 100, 8, bold, MUTED);
    drawRight('AMOUNT', right - 8, 8, bold, MUTED);
    y -= 22;
    for (const item of input.items) {
      const lines = wrap(item.name, regular, 10, contentWidth - 260);
      ensure(lines.length * 13 + 10);
      const rowTop = y;
      for (const l of lines) {
        page.drawText(l, { x: MARGIN + 8, y, size: 10, font: regular, color: INK });
        y -= 13;
      }
      const afterName = y;
      y = rowTop;
      drawRight(String(item.quantity), right - 190, 10);
      drawRight(money(item.unit_price_centavos), right - 100, 10);
      drawRight(money(item.total_centavos), right - 8, 10);
      y = afterName - 4;
      rule();
      y -= 14;
    }

    const totalsRow = (label: string, value: string, strong = false) => {
      ensure(18);
      drawRight(label, right - 130, strong ? 11 : 10, strong ? bold : regular, strong ? INK : MUTED);
      drawRight(value, right - 8, strong ? 11 : 10, strong ? bold : regular, INK);
      y -= strong ? 18 : 15;
    };
    if (input.subtotalCentavos !== undefined) totalsRow('Subtotal', money(input.subtotalCentavos));
    if (input.discountCentavos && input.discountCentavos > 0) {
      totalsRow(`Discount${input.discountLabel ? ` (${input.discountLabel})` : ''}`, `- ${money(input.discountCentavos)}`);
    }
    if (input.totalCentavos !== undefined) totalsRow(input.totalLabel ?? 'Total', money(input.totalCentavos), true);
    for (const row of input.summaryRows ?? []) totalsRow(row.label, row.value, row.bold);
    y -= 10;
  } else if (input.summaryRows?.length) {
    const right = A4[0] - MARGIN;
    for (const row of input.summaryRows) {
      ensure(18);
      drawRight(row.label, right - 150, row.bold ? 11 : 10, row.bold ? bold : regular, row.bold ? INK : MUTED);
      drawRight(row.value, right - 8, row.bold ? 11 : 10, row.bold ? bold : regular, INK);
      y -= row.bold ? 18 : 15;
    }
    y -= 10;
  }

  // ── text sections ──
  for (const section of input.sections ?? []) {
    if (!section.body.trim()) continue;
    ensure(40);
    draw(section.heading.toUpperCase(), MARGIN, 8.5, bold, accent);
    y -= 15;
    paragraph(section.body, 9.5);
    y -= 10;
  }

  // ── signatures ──
  if (input.signatures) {
    ensure(90);
    y -= 40;
    const half = contentWidth / 2 - 20;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + half, y }, thickness: 0.7, color: INK });
    page.drawLine({ start: { x: colX + 10, y }, end: { x: colX + 10 + half, y }, thickness: 0.7, color: INK });
    y -= 13;
    draw(`${input.brand.name} (Service Provider)`, MARGIN, 9, regular, MUTED);
    page.drawText(toWinAnsi(`${input.customer.name} (Client)`), { x: colX + 10, y, size: 9, font: regular, color: MUTED });
    y -= 12;
    draw('Signature over printed name / Date', MARGIN, 8, regular, MUTED);
    page.drawText('Signature over printed name / Date', { x: colX + 10, y, size: 8, font: regular, color: MUTED });
  }

  // ── footer on every page ──
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    const footer = toWinAnsi(`${input.brand.name}  |  ${title} ${input.number}  |  Order ${input.order.reference}`);
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 6 }, end: { x: A4[0] - MARGIN, y: MARGIN + 6 }, thickness: 0.5, color: LINE });
    p.drawText(footer, { x: MARGIN, y: MARGIN - 8, size: 8, font: regular, color: MUTED });
    const pn = `Page ${index + 1} of ${pages.length}`;
    p.drawText(pn, { x: A4[0] - MARGIN - regular.widthOfTextAtSize(pn, 8), y: MARGIN - 8, size: 8, font: regular, color: MUTED });
  });

  return pdf.save();
}

export const DEFAULT_CONTRACT_TERMS = `1. Scope of work. The Service Provider will design and develop the project described in this agreement and in the accepted quotation.

2. Fees and payment. The Client agrees to pay the total project fee stated above. Work begins once the deposit has been verified. The remaining balance is due before final handover of the project files, source code or credentials.

3. Timeline. Estimated delivery dates depend on timely feedback and content from the Client. Delays in feedback or content may move the delivery date.

4. Revisions. Revisions within the agreed scope are included. Requests outside the agreed scope will be quoted separately.

5. Third-party costs. Domain names, hosting, paid plugins, SMS credits and app store fees are not included unless stated in the quotation.

6. Ownership. Upon full payment, the Client owns the final deliverables created specifically for this project. The Service Provider may reuse general-purpose code and may show the work in its portfolio unless the Client objects in writing.

7. Cancellation. Either party may cancel in writing. Payments for work already completed are non-refundable unless otherwise agreed.

8. Confidentiality and data privacy. Both parties will keep confidential information private and will handle personal data in line with the Data Privacy Act of 2012 (RA 10173).

9. Governing law. This agreement is governed by the laws of the Republic of the Philippines.`;
