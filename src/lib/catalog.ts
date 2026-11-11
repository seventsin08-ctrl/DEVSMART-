// Public catalogue data (read through RLS with the anon key).
import { useQuery } from '@tanstack/react-query';
import type { AddonRow, PackageRow, ServiceRow } from '@shared/pricing';
import { isSupabaseConfigured, supabase, unwrap } from './supabase';

/** Shown only when no backend is configured, so the storefront still renders during setup. */
const FALLBACK_SERVICES: ServiceRow[] = ([
  ['personal-website', 'Personal Website', 'A polished personal site, portfolio or online résumé.', 'User', 500000, 5, 10],
  ['business-website', 'Business Website', 'A credible online home for your business.', 'Building2', 600000, 7, 14],
  ['smart-ordering-system', 'Smart Ordering System', 'Let customers order online, any time.', 'ShoppingBag', 800000, 10, 21],
  ['booking-system', 'Booking System', 'Appointments and reservations without the back-and-forth.', 'CalendarCheck', 1000000, 14, 28],
  ['android-application', 'Android Application', 'A custom Android app for your idea or business.', 'Smartphone', 1200000, 21, 35],
  ['ios-android-application', 'iOS + Android Application', 'One app, both platforms.', 'TabletSmartphone', 1800000, 28, 45],
] as const).map(([slug, name, short, icon, price, min, max], i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 1}`, slug, name, short_description: short, description: short, features: [],
  icon, image_url: null, starting_price_centavos: price, delivery_days_min: min, delivery_days_max: max,
  is_active: true, is_archived: false, sort_order: i + 1,
}));

export interface PortfolioRow {
  id: string; slug: string; title: string; category: string; summary: string; description: string;
  image_url: string | null; tech: string[]; project_url: string | null; client_name: string | null;
  is_concept: boolean; is_featured: boolean; sort_order: number;
}
export interface PaymentMethodRow {
  id: string; name: string; kind: 'gcash' | 'maya' | 'bank' | 'custom'; account_holder: string;
  account_number: string; qr_image_url: string | null; instructions: string; sort_order: number;
}
export interface PublicPromotion {
  id: string; name: string; description: string; kind: string; code: string | null;
  discount_type: 'percent' | 'fixed'; percent_bps: number | null; fixed_centavos: number | null;
  min_subtotal_centavos: number; service_ids: string[]; expires_at: string | null;
}

const opts = { staleTime: 60_000 } as const;

export function useServices() {
  return useQuery({
    queryKey: ['public', 'services'], ...opts,
    queryFn: async (): Promise<ServiceRow[]> => {
      if (!supabase) return FALLBACK_SERVICES;
      return unwrap(await supabase.from('services').select('*').eq('is_active', true).eq('is_archived', false).order('sort_order').order('name')) as ServiceRow[];
    },
  });
}
export function useAddons() {
  return useQuery({
    queryKey: ['public', 'addons'], ...opts,
    queryFn: async (): Promise<AddonRow[]> =>
      supabase ? (unwrap(await supabase.from('service_addons').select('*').eq('is_active', true).order('sort_order').order('name')) as AddonRow[]) : [],
  });
}
export function usePackages() {
  return useQuery({
    queryKey: ['public', 'packages'], ...opts,
    queryFn: async (): Promise<PackageRow[]> =>
      supabase ? (unwrap(await supabase.from('service_packages').select('*').eq('is_active', true).order('sort_order').order('price_centavos')) as PackageRow[]) : [],
  });
}
export function usePortfolio() {
  return useQuery({
    queryKey: ['public', 'portfolio'], ...opts,
    queryFn: async (): Promise<PortfolioRow[]> =>
      supabase ? (unwrap(await supabase.from('portfolio_projects').select('*').eq('is_published', true).order('sort_order').order('created_at', { ascending: false })) as PortfolioRow[]) : [],
  });
}
export function usePaymentMethods() {
  return useQuery({
    queryKey: ['public', 'payment-methods'], ...opts,
    queryFn: async (): Promise<PaymentMethodRow[]> =>
      supabase ? (unwrap(await supabase.from('payment_methods').select('*').eq('is_active', true).order('sort_order')) as PaymentMethodRow[]) : [],
  });
}
export function usePublicPromotions() {
  return useQuery({
    queryKey: ['public', 'promotions'], ...opts,
    queryFn: async (): Promise<PublicPromotion[]> =>
      supabase ? (unwrap(await supabase.from('public_promotions').select('*')) as PublicPromotion[]) : [],
  });
}
export { isSupabaseConfigured };

export function deliveryLabel(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `${min}–${max} days`;
  return `${min ?? max} days`;
}
