import { describe, expect, it } from 'vitest';
import { bpsToPercentLabel, centavosToInput, formatPHP, parsePesos, percentOf } from '../../shared/money';
import { buildOrderItems, computeDiscount, priceOrder, promotionProblem, PricingError, type AddonRow, type PromotionRow, type ServiceRow } from '../../shared/pricing';

const service: ServiceRow = {
  id: 's1', slug: 'business-website', name: 'Business Website', short_description: '', description: '', features: [], icon: 'Globe',
  image_url: null, starting_price_centavos: 600000, delivery_days_min: 7, delivery_days_max: 14, is_active: true, is_archived: false, sort_order: 1,
};
const addon = (id: string, price: number, service_id: string | null = null, is_active = true): AddonRow => ({ id, service_id, name: id, description: '', price_centavos: price, is_active, sort_order: 0 });
const promo = (over: Partial<PromotionRow>): PromotionRow => ({
  id: 'p1', name: 'Promo', description: '', kind: 'promo_code', code: 'SAVE', discount_type: 'percent', percent_bps: 1000, fixed_centavos: null,
  max_discount_centavos: null, min_subtotal_centavos: 0, min_completed_orders: 0, service_ids: [], starts_at: null, expires_at: null,
  usage_limit: null, per_customer_limit: null, usage_count: 0, is_active: true, show_on_site: false, ...over,
});
const ctx = { now: new Date('2026-06-01T00:00:00Z'), isFirstOrder: true, completedOrders: 0, redemptionsByPromo: {} };

describe('money', () => {
  it('formats pesos exactly', () => {
    expect(formatPHP(500000)).toBe('₱5,000');
    expect(formatPHP(123456789)).toBe('₱1,234,567.89');
    expect(formatPHP(5, { alwaysDecimals: true })).toBe('₱0.05');
    expect(formatPHP(-150)).toBe('-₱1.50');
  });
  it('parses user input without floating point', () => {
    expect(parsePesos('5,000')).toBe(500000);
    expect(parsePesos('₱ 1,250.75')).toBe(125075);
    expect(parsePesos('0.1')).toBe(10);
    expect(parsePesos('19.99')).toBe(1999); // 19.99 * 100 is 1998.9999… in floating point
    expect(parsePesos('abc')).toBeNull();
    expect(parsePesos('-5')).toBeNull();
    expect(parsePesos('1.234')).toBeNull();
    expect(centavosToInput(1999)).toBe('19.99');
  });
  it('computes percentages in whole centavos, rounding down', () => {
    expect(percentOf(750000, 1000)).toBe(75000);
    expect(percentOf(999, 3333)).toBe(332);
    expect(bpsToPercentLabel(1250)).toBe('12.5%');
    expect(bpsToPercentLabel(1000)).toBe('10%');
  });
});

describe('order items', () => {
  it('sums the service and add-ons', () => {
    const { items, subtotal } = buildOrderItems(service, null, [addon('a', 150000), addon('b', 100000, 's1')]);
    expect(items).toHaveLength(3);
    expect(subtotal).toBe(850000);
  });
  it('rejects inactive services, foreign add-ons and duplicates', () => {
    expect(() => buildOrderItems({ ...service, is_active: false }, null, [])).toThrow(PricingError);
    expect(() => buildOrderItems({ ...service, is_archived: true }, null, [])).toThrow(PricingError);
    expect(() => buildOrderItems(service, null, [addon('a', 1, 'other')])).toThrow(PricingError);
    expect(() => buildOrderItems(service, null, [addon('a', 1, null, false)])).toThrow(PricingError);
    expect(() => buildOrderItems(service, null, [addon('a', 1), addon('a', 1)])).toThrow(PricingError);
  });
  it('uses the package price instead of the starting price', () => {
    const pkg = { id: 'k', service_id: 's1', name: 'Pro', description: '', features: [], price_centavos: 900000, delivery_days: null, is_active: true, sort_order: 0 };
    expect(buildOrderItems(service, pkg, []).subtotal).toBe(900000);
    expect(() => buildOrderItems(service, { ...pkg, service_id: 'x' }, [])).toThrow(PricingError);
  });
});

describe('discounts', () => {
  it('never exceeds the subtotal or goes negative', () => {
    expect(computeDiscount(promo({ discount_type: 'fixed', percent_bps: null, fixed_centavos: 9999999 }), 600000)).toBe(600000);
    expect(computeDiscount(promo({ percent_bps: 10000 }), 600000)).toBe(600000);
    expect(computeDiscount(promo({ percent_bps: 5000, max_discount_centavos: 100000 }), 600000)).toBe(100000);
  });
  it('enforces dates, limits, services and minimums', () => {
    const c = { ...ctx, subtotal: 600000, serviceId: 's1' };
    expect(promotionProblem(promo({}), c)).toBeNull();
    expect(promotionProblem(promo({ is_active: false }), c)).toBe('inactive');
    expect(promotionProblem(promo({ expires_at: '2026-05-31T00:00:00Z' }), c)).toBe('expired');
    expect(promotionProblem(promo({ starts_at: '2026-07-01T00:00:00Z' }), c)).toBe('not_started');
    expect(promotionProblem(promo({ usage_limit: 5, usage_count: 5 }), c)).toBe('usage_limit');
    expect(promotionProblem(promo({ per_customer_limit: 1 }), { ...c, redemptionsByPromo: { p1: 1 } })).toBe('customer_limit');
    expect(promotionProblem(promo({ service_ids: ['other'] }), c)).toBe('service_not_eligible');
    expect(promotionProblem(promo({ min_subtotal_centavos: 700000 }), c)).toBe('min_subtotal');
    expect(promotionProblem(promo({ kind: 'first_order', code: null }), { ...c, isFirstOrder: false })).toBe('first_order_only');
    expect(promotionProblem(promo({ kind: 'loyalty', code: null, min_completed_orders: 2 }), { ...c, completedOrders: 1 })).toBe('loyalty_not_reached');
  });
  it('applies one promotion: a valid code wins, otherwise the best automatic one', () => {
    const auto = promo({ id: 'auto', kind: 'first_order', code: null, percent_bps: 500 });
    const big = promo({ id: 'big', kind: 'automatic', code: null, discount_type: 'fixed', percent_bps: null, fixed_centavos: 100000 });
    const base = { service, pkg: null, addons: [], ctx };
    const withCode = priceOrder({ ...base, codePromotion: promo({}), codeEntered: true, automaticPromotions: [auto, big] });
    expect(withCode).toMatchObject({ subtotal: 600000, discount: 60000, total: 540000, codeProblem: null });
    expect(withCode.promotion?.id).toBe('p1');
    const noCode = priceOrder({ ...base, codePromotion: null, codeEntered: false, automaticPromotions: [auto, big] });
    expect(noCode).toMatchObject({ discount: 100000, total: 500000 });
    expect(noCode.promotion?.id).toBe('big');
    const badCode = priceOrder({ ...base, codePromotion: null, codeEntered: true, automaticPromotions: [] });
    expect(badCode).toMatchObject({ discount: 0, total: 600000, codeProblem: 'unknown_code', promotion: null });
    const expired = priceOrder({ ...base, codePromotion: promo({ expires_at: '2020-01-01T00:00:00Z' }), codeEntered: true, automaticPromotions: [] });
    expect(expired).toMatchObject({ discount: 0, codeProblem: 'expired' });
  });
});
