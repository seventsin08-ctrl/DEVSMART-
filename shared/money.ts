// Money helpers. All amounts are integer centavos (1 PHP = 100 centavos).
// Never use floating point arithmetic on money.

const PESO = '₱';

/** Formats centavos as "₱5,000" (whole pesos) or "₱5,000.50". */
export function formatPHP(centavos: number, opts: { symbol?: string; alwaysDecimals?: boolean } = {}): string {
  const symbol = opts.symbol ?? PESO;
  const value = Math.trunc(Number(centavos) || 0);
  const negative = value < 0;
  const abs = Math.abs(value);
  const pesos = Math.floor(abs / 100);
  const cents = abs % 100;
  const whole = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = cents > 0 || opts.alwaysDecimals ? `.${cents.toString().padStart(2, '0')}` : '';
  return `${negative ? '-' : ''}${symbol}${whole}${decimals}`;
}

/**
 * Parses user input such as "5,000", "5000.5" or "₱ 1,250.75" into centavos using
 * string arithmetic only. Returns null when the input is not a valid non-negative amount.
 */
export function parsePesos(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).replace(/[\s,₱]/g, '').replace(/^php/i, '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, frac = ''] = raw.split('.');
  const centavos = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** centavos → "5000.00" for form inputs. */
export function centavosToInput(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '';
  const v = Math.trunc(centavos);
  return `${Math.floor(v / 100)}.${(v % 100).toString().padStart(2, '0')}`;
}

/** Integer percentage in basis points (10000 bps = 100%). Result is floored to a whole centavo. */
export function percentOf(amountCentavos: number, bps: number): number {
  // BigInt keeps the intermediate product exact for any realistic amount.
  return Number((BigInt(Math.trunc(amountCentavos)) * BigInt(Math.trunc(bps))) / 10000n);
}

export function bpsToPercentLabel(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  return frac === 0 ? `${whole}%` : `${whole}.${frac.toString().padStart(2, '0').replace(/0$/, '')}%`;
}
