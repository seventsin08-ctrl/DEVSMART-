// Authoritative pricing & discount rules. Pure functions with no I/O so the exact same
// logic is unit-tested, used by the server (source of truth) and by the browser (estimate only).
import { percentOf } from './money';

export interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  description: string;
  features: string[];
  icon: string;
  image_url: string | null;
  starting_price_centavos: number;
  delivery_days_min: number | null;
  delivery_days_max: number | null;
  is_active: boolean;
  is_archived: boolean;
  sort_order: number;
}

export interface AddonRow {
  id: string;
  service_id: string | null;
  name: string;
  description: string;
  price_centavos: number;
  is_active: boolean;
  sort_order: number;
}

export interface PackageRow {
  id: string;
  service_id: string;
  name: string;
  description: string;
  features: string[];
  price_centavos: number;
  delivery_days: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface PromotionRow {
  id: string;
  name: string;
  description: string;
  kind: 'promo_code' | 'automatic' | 'first_order' | 'loyalty' | 'referral';
  code: string | null;
  discount_type: 'percent' | 'fixed';
  percent_bps: number | null;
  fixed_centavos: number | null;
  max_discount_centavos: number | null;
  min_subtotal_centavos: number;
  min_completed_orders: number;
  service_ids: string[];
  starts_at: string | null;
  expires_at: string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  usage_count: number;
  is_active: boolean;
  show_on_site: boolean;
}

export interface OrderItemDraft {
  kind: 'service' | 'package' | 'addon';
  service_id: string | null;
  package_id: string | null;
  addon_id: string | null;
  name: string;
  unit_price_centavos: number;
  quantity: number;
}

export type PricingErrorCode =
  | 'SERVICE_UNAVAILABLE' | 'PACKAGE_UNAVAILABLE' | 'ADDON_UNAVAILABLE' | 'DUPLICATE_ADDON';

export class PricingError extends Error {
  constructor(public code: PricingErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PricingError';
  }
}

/** Builds the immutable line items for an order from catalogue rows. */
export function buildOrderItems(
  service: ServiceRow,
  pkg: PackageRow | null,
  addons: AddonRow[],
): { items: OrderItemDraft[]; subtotal: number } {
  if (!service.is_active || service.is_archived) throw new PricingError('SERVICE_UNAVAILABLE');
  const items: OrderItemDraft[] = [];

  if (pkg) {
    if (!pkg.is_active || pkg.service_id !== service.id) throw new PricingError('PACKAGE_UNAVAILABLE');
    items.push({
      kind: 'package', service_id: service.id, package_id: pkg.id, addon_id: null,
      name: `${service.name} — ${pkg.name}`, unit_price_centavos: pkg.price_centavos, quantity: 1,
    });
  } else {
    items.push({
      kind: 'service', service_id: service.id, package_id: null, addon_id: null,
      name: service.name, unit_price_centavos: service.starting_price_centavos, quantity: 1,
    });
  }

  const seen = new Set<string>();
  for (const addon of addons) {
    if (seen.has(addon.id)) throw new PricingError('DUPLICATE_ADDON');
    seen.add(addon.id);
    if (!addon.is_active || (addon.service_id !== null && addon.service_id !== service.id)) {
      throw new PricingError('ADDON_UNAVAILABLE');
    }
    items.push({
      kind: 'addon', service_id: service.id, package_id: null, addon_id: addon.id,
      name: addon.name, unit_price_centavos: addon.price_centavos, quantity: 1,
    });
  }

  const subtotal = items.reduce((sum, i) => sum + i.unit_price_centavos * i.quantity, 0);
  return { items, subtotal };
}

export interface PromoContext {
  now: Date;
  subtotal: number;
  serviceId: string;
  /** true when this e-mail has no earlier (non-cancelled) order */
  isFirstOrder: boolean;
  /** number of completed orders for this customer */
  completedOrders: number;
  /** how many times this customer already redeemed a given promotion id */
  redemptionsByPromo: Record<string, number>;
}

export type PromoProblem =
  | 'inactive' | 'not_started' | 'expired' | 'usage_limit' | 'customer_limit'
  | 'service_not_eligible' | 'min_subtotal' | 'first_order_only' | 'loyalty_not_reached';

export const PROMO_PROBLEM_MESSAGES: Record<PromoProblem, string> = {
  inactive: 'This promotion is not active.',
  not_started: 'This promotion has not started yet.',
  expired: 'This promotion has expired.',
  usage_limit: 'This promotion has reached its usage limit.',
  customer_limit: 'You have already used this promotion.',
  service_not_eligible: 'This promotion does not apply to the selected service.',
  min_subtotal: 'Your order does not reach the minimum amount for this promotion.',
  first_order_only: 'This promotion is only for first-time customers.',
  loyalty_not_reached: 'This reward unlocks after more completed projects.',
};

/** Returns null when the promotion can be applied, otherwise the reason it cannot. */
export function promotionProblem(promo: PromotionRow, ctx: PromoContext): PromoProblem | null {
  if (!promo.is_active) return 'inactive';
  if (promo.starts_at && new Date(promo.starts_at).getTime() > ctx.now.getTime()) return 'not_started';
  if (promo.expires_at && new Date(promo.expires_at).getTime() <= ctx.now.getTime()) return 'expired';
  if (promo.usage_limit !== null && promo.usage_count >= promo.usage_limit) return 'usage_limit';
  if (promo.per_customer_limit !== null && (ctx.redemptionsByPromo[promo.id] ?? 0) >= promo.per_customer_limit) {
    return 'customer_limit';
  }
  if (promo.service_ids.length > 0 && !promo.service_ids.includes(ctx.serviceId)) return 'service_not_eligible';
  if (ctx.subtotal < promo.min_subtotal_centavos) return 'min_subtotal';
  if ((promo.kind === 'first_order' || promo.kind === 'referral') && !ctx.isFirstOrder) return 'first_order_only';
  if (promo.kind === 'loyalty' && ctx.completedOrders < Math.max(promo.min_completed_orders, 1)) {
    return 'loyalty_not_reached';
  }
  return null;
}

/** Discount in centavos: floored, capped, never negative and never more than the subtotal. */
export function computeDiscount(promo: PromotionRow, subtotal: number): number {
  let discount = promo.discount_type === 'percent' ? percentOf(subtotal, promo.percent_bps ?? 0) : promo.fixed_centavos ?? 0;
  if (promo.max_discount_centavos !== null) discount = Math.min(discount, promo.max_discount_centavos);
  return Math.max(0, Math.min(Math.trunc(discount), subtotal));
}

export function promotionLabel(promo: PromotionRow): string {
  return promo.code ? `${promo.name} (${promo.code})` : promo.name;
}

export interface PricedOrder {
  items: OrderItemDraft[];
  subtotal: number;
  discount: number;
  total: number;
  promotion: PromotionRow | null;
  discountLabel: string | null;
  /** set when a code was entered but could not be applied */
  codeProblem: PromoProblem | 'unknown_code' | null;
}

/**
 * Applies at most ONE promotion:
 *   1. a valid entered code (promo code or referral) wins;
 *   2. otherwise the automatic / first-order / loyalty promotion with the largest discount.
 */
export function priceOrder(input: {
  service: ServiceRow;
  pkg: PackageRow | null;
  addons: AddonRow[];
  /** promotion matched by the entered code (promo_code kind, or the referral promotion) */
  codePromotion: PromotionRow | null;
  /** true when the customer typed a code at all */
  codeEntered: boolean;
  /** active promotions of kind automatic / first_order / loyalty */
  automaticPromotions: PromotionRow[];
  ctx: Omit<PromoContext, 'subtotal' | 'serviceId'>;
}): PricedOrder {
  const { items, subtotal } = buildOrderItems(input.service, input.pkg, input.addons);
  const ctx: PromoContext = { ...input.ctx, subtotal, serviceId: input.service.id };

  let promotion: PromotionRow | null = null;
  let discount = 0;
  let codeProblem: PricedOrder['codeProblem'] = null;

  if (input.codeEntered) {
    if (!input.codePromotion) codeProblem = 'unknown_code';
    else {
      const problem = promotionProblem(input.codePromotion, ctx);
      if (problem) codeProblem = problem;
      else {
        promotion = input.codePromotion;
        discount = computeDiscount(promotion, subtotal);
      }
    }
  }

  if (!promotion) {
    for (const candidate of input.automaticPromotions) {
      if (!['automatic', 'first_order', 'loyalty'].includes(candidate.kind)) continue;
      if (promotionProblem(candidate, ctx)) continue;
      const d = computeDiscount(candidate, subtotal);
      if (d > discount) {
        discount = d;
        promotion = candidate;
      }
    }
  }

  if (promotion && discount === 0) promotion = null;

  return {
    items, subtotal, discount, total: subtotal - discount, promotion,
    discountLabel: promotion ? promotionLabel(promotion) : null, codeProblem,
  };
}
