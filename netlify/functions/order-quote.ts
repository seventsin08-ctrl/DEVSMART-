// POST /api/order-quote — server-side price & discount preview for the order form.
import type { Config } from '@netlify/functions';
import { PROMO_PROBLEM_MESSAGES } from '../../shared/pricing';
import { quoteRequestSchema } from '../../shared/schemas';
import { rateLimit } from './_lib/guard';
import { clientIp, endpoint, hashIp, json, readBody } from './_lib/http';
import { priceSelection } from './_lib/orders';

export default endpoint(['POST'], async (req, context) => {
  await rateLimit('quote', hashIp(clientIp(req, context)), 60, 600);
  const body = await readBody(req, quoteRequestSchema, 8 * 1024);
  const priced = await priceSelection(
    { service_id: body.service_id, package_id: body.package_id ?? null, addon_ids: body.addon_ids, promo_code: body.promo_code },
    body.email,
  );
  return json({
    items: priced.items.map((i) => ({ kind: i.kind, name: i.name, quantity: i.quantity, total_centavos: i.unit_price_centavos * i.quantity })),
    subtotal_centavos: priced.subtotal,
    discount_centavos: priced.discount,
    discount_label: priced.discountLabel,
    total_centavos: priced.total,
    code_message:
      priced.codeProblem === null ? null
      : priced.codeProblem === 'unknown_code' ? 'This code is not valid.'
      : PROMO_PROBLEM_MESSAGES[priced.codeProblem],
  });
});

export const config: Config = { path: '/api/order-quote' };
