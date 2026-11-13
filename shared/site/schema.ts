// Validated schema for everything the Branding Studio can edit.
// The site is rendered ONLY from data that passes these schemas: plain text, numbers,
// enumerated options and sanitised URLs. No HTML, CSS or JavaScript can be injected.
import { z } from 'zod';

// ───────────────────────── primitives ─────────────────────────
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #3b9eff');

/** Allows relative paths, anchors, http(s), mailto and tel. Blocks javascript:, data:, etc. */
export function isSafeHref(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>"`]/.test(v)) return false;
  if (v.startsWith('/') && !v.startsWith('//')) return true;
  if (v.startsWith('#')) return true;
  return /^(https?:\/\/|mailto:|tel:)/i.test(v);
}
export function isSafeImageUrl(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>"`]/.test(v)) return false;
  if (v.startsWith('/') && !v.startsWith('//')) return true;
  return /^https?:\/\//i.test(v);
}
/** Render-time guard: anything unsafe collapses to "#". */
export function safeHref(value: string | null | undefined): string {
  return value && isSafeHref(value) ? value.trim() || '#' : '#';
}
export function safeImage(value: string | null | undefined): string | undefined {
  return value && value.trim() !== '' && isSafeImageUrl(value) ? value.trim() : undefined;
}

const href = z.string().max(2000).refine(isSafeHref, 'Use a page path (/pricing), #anchor, https://, mailto: or tel: link');
const imageUrl = z.string().max(2000).refine(isSafeImageUrl, 'Use an https:// image URL or a media library file');
const text = (max: number) => z.string().max(max);
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const FONT_OPTIONS = {
  system: { label: 'System (San Francisco / Segoe)', stack: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', google: null },
  inter: { label: 'Inter', stack: '"Inter", system-ui, sans-serif', google: 'Inter:wght@400;500;600;700;800' },
  manrope: { label: 'Manrope', stack: '"Manrope", system-ui, sans-serif', google: 'Manrope:wght@400;500;600;700;800' },
  jakarta: { label: 'Plus Jakarta Sans', stack: '"Plus Jakarta Sans", system-ui, sans-serif', google: 'Plus+Jakarta+Sans:wght@400;500;600;700;800' },
  sora: { label: 'Sora', stack: '"Sora", system-ui, sans-serif', google: 'Sora:wght@400;500;600;700;800' },
  outfit: { label: 'Outfit', stack: '"Outfit", system-ui, sans-serif', google: 'Outfit:wght@400;500;600;700;800' },
  grotesk: { label: 'Space Grotesk', stack: '"Space Grotesk", system-ui, sans-serif', google: 'Space+Grotesk:wght@400;500;600;700' },
  dmsans: { label: 'DM Sans', stack: '"DM Sans", system-ui, sans-serif', google: 'DM+Sans:wght@400;500;600;700;800' },
  poppins: { label: 'Poppins', stack: '"Poppins", system-ui, sans-serif', google: 'Poppins:wght@400;500;600;700;800' },
} as const;
export type FontKey = keyof typeof FONT_OPTIONS;
const fontKey = z.enum(Object.keys(FONT_OPTIONS) as [FontKey, ...FontKey[]]);

export const ICON_NAMES = [
  'Globe', 'User', 'Building2', 'ShoppingBag', 'CalendarCheck', 'Smartphone', 'TabletSmartphone',
  'Sparkles', 'Zap', 'ShieldCheck', 'Wallet', 'Clock', 'HeartHandshake', 'Rocket', 'Code2',
  'Palette', 'MessageCircle', 'Headphones', 'BadgeCheck', 'Layers', 'Gauge', 'Lock', 'Star',
  'ThumbsUp', 'Wrench', 'LineChart', 'Search', 'PenTool', 'MonitorSmartphone', 'Gift',
] as const;
export type IconName = (typeof ICON_NAMES)[number];
const iconName = z.enum(ICON_NAMES);

// ───────────────────────── theme ─────────────────────────
export const themeSchema = z.object({
  mode: z.enum(['light', 'dark']),
  colors: z.object({
    background: hexColor,
    surface: hexColor,
    text: hexColor,
    muted: hexColor,
    accent: hexColor,
    accent2: hexColor,
  }),
  gradient: z.object({
    from: hexColor,
    via: hexColor,
    to: hexColor,
    angle: z.number().min(0).max(360),
    animated: z.boolean(),
  }),
  labels: z.object({ mono: z.boolean(), numbered: z.boolean(), rules: z.boolean() }),
  background: z.object({
    style: z.enum(['aurora', 'mesh', 'grid', 'spotlight', 'solid']),
    intensity: z.number().min(0).max(100),
    animated: z.boolean(),
  }),
  fonts: z.object({ heading: fontKey, body: fontKey }),
  scale: z.object({
    base: z.number().min(14).max(20),
    heading: z.number().min(0.7).max(1.4),
  }),
  glass: z.object({
    opacity: z.number().min(0).max(40),
    blur: z.number().min(0).max(60),
    border: z.number().min(0).max(40),
    saturation: z.number().min(100).max(220),
  }),
  radius: z.object({ card: z.number().min(0).max(48), button: z.number().min(0).max(999) }),
  shadow: z.object({ intensity: z.number().min(0).max(100) }),
});
export type Theme = z.infer<typeof themeSchema>;

// ───────────────────────── shared pieces ─────────────────────────
export const buttonSchema = z.object({
  label: text(60),
  href,
  variant: z.enum(['primary', 'secondary', 'ghost']),
  show: z.boolean(),
});
export type ButtonConfig = z.infer<typeof buttonSchema>;

export const buttonsSchema = z.object({
  size: z.enum(['sm', 'md', 'lg']),
  style: z.enum(['gradient', 'solid', 'glass', 'white']),
  hover: z.enum(['glow', 'lift', 'scale', 'none']),
  animation: z.enum(['none', 'shine', 'pulse']),
  uppercase: z.boolean(),
});
export type ButtonsConfig = z.infer<typeof buttonsSchema>;

export const brandSchema = z.object({
  name: text(60).min(1),
  tagline: text(140),
  description: text(600),
  logoUrl: imageUrl,
  logoHeight: z.number().min(16).max(72),
  showName: z.boolean(),
  faviconUrl: imageUrl,
  contact: z.object({
    email: text(254),
    phone: text(40),
    facebookUrl: href,
    address: text(300),
    hours: text(200),
  }),
});
export type Brand = z.infer<typeof brandSchema>;

const navItem = z.object({ id, label: text(40).min(1), href });
export const navigationSchema = z.object({
  items: z.array(navItem).max(10),
  align: z.enum(['left', 'center', 'right']),
  style: z.enum(['floating', 'bar']),
  sticky: z.boolean(),
  cta: buttonSchema,
  mobile: z.object({ style: z.enum(['sheet', 'fullscreen']), showCta: z.boolean() }),
});
export type Navigation = z.infer<typeof navigationSchema>;

export const footerSchema = z.object({
  text: text(400),
  columns: z
    .array(z.object({ id, title: text(40), links: z.array(z.object({ id, label: text(40), href })).max(10) }))
    .max(4),
  copyright: text(200),
  showContact: z.boolean(),
});
export type Footer = z.infer<typeof footerSchema>;

export const formsSchema = z.object({
  order: z.object({
    stepLabels: z.array(text(30)).length(5),
    serviceHeading: text(120),
    serviceHelp: text(300),
    addonsHeading: text(120),
    packageHeading: text(120),
    promoLabel: text(80),
    requirementsHeading: text(120),
    requirementsHelp: text(300),
    customerHeading: text(120),
    contactNotice: text(600),
    consentLabel: text(300),
    reviewHeading: text(120),
    estimateNote: text(400),
    submitLabel: text(40),
    labels: z.object({
      projectName: text(60), projectDescription: text(60), features: text(60), preferredDesign: text(60),
      referenceWebsites: text(60), deadline: text(60), budget: text(60), notes: text(60),
      fullName: text(60), email: text(60), phone: text(60), facebook: text(60),
    }),
    confirmationTitle: text(120),
    confirmationMessage: text(600),
  }),
  payment: z.object({
    intro: text(600),
    proofHelp: text(400),
    successTitle: text(120),
    successMessage: text(600),
  }),
  track: z.object({ intro: text(600), requestHelp: text(400) }),
  contact: z.object({ submitLabel: text(40), successMessage: text(300) }),
});
export type Forms = z.infer<typeof formsSchema>;

// ───────────────────────── sections ─────────────────────────
export const sectionStyleSchema = z.object({
  paddingY: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
  background: z.enum(['none', 'glass', 'tint', 'glow']),
  align: z.enum(['left', 'center']),
  width: z.enum(['narrow', 'normal', 'wide']),
  animation: z.enum(['none', 'fade', 'rise', 'scale', 'blur', 'assemble']),
  accent: z.union([z.literal(''), hexColor]),
});
export type SectionStyle = z.infer<typeof sectionStyleSchema>;

const heading = { eyebrow: text(60), title: text(160), subtitle: text(500) };

export const sectionPropsSchemas = {
  hero: z.object({
    eyebrow: text(80),
    headline: text(160),
    gradientHeadline: z.boolean(),
    twoTone: z.boolean(),
    showCursors: z.boolean(),
    subtitle: text(500),
    primaryButton: buttonSchema,
    secondaryButton: buttonSchema,
    chips: z.array(text(40)).max(8),
    visual: z.enum(['sculpture', 'orb', 'devices', 'image', 'none']),
    imageUrl,
    imageAlt: text(160),
    backgroundImageUrl: imageUrl,
    height: z.enum(['auto', 'tall', 'screen']),
  }),
  pageHeader: z.object({ ...heading }),
  services: z.object({
    ...heading,
    limit: z.number().int().min(0).max(24),
    columns: z.union([z.literal(2), z.literal(3)]),
    showPrices: z.boolean(),
    showFeatures: z.boolean(),
    button: buttonSchema,
  }),
  portfolio: z.object({
    ...heading,
    featuredOnly: z.boolean(),
    limit: z.number().int().min(0).max(24),
    columns: z.union([z.literal(2), z.literal(3)]),
    button: buttonSchema,
  }),
  benefits: z.object({
    ...heading,
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    items: z.array(z.object({ id, icon: iconName, title: text(80), text: text(300) })).max(12),
  }),
  process: z.object({
    ...heading,
    items: z.array(z.object({ id, title: text(80), text: text(300) })).max(8),
  }),
  pricing: z.object({
    ...heading,
    showAddons: z.boolean(),
    showPromotions: z.boolean(),
    note: text(400),
    button: buttonSchema,
  }),
  testimonials: z.object({
    ...heading,
    emptyText: text(300),
    items: z.array(z.object({ id, quote: text(600), name: text(80), role: text(120) })).max(12),
  }),
  faq: z.object({
    ...heading,
    items: z.array(z.object({ id, question: text(200), answer: text(1500) })).max(30),
  }),
  contact: z.object({ ...heading, showForm: z.boolean(), showDetails: z.boolean() }),
  cta: z.object({
    title: text(160),
    text: text(500),
    primaryButton: buttonSchema,
    secondaryButton: buttonSchema,
  }),
  richText: z.object({
    title: text(160),
    blocks: z.array(z.object({ id, heading: text(160), body: text(6000) })).max(40),
  }),
  imageText: z.object({
    ...heading,
    text: text(2000),
    imageUrl,
    imageAlt: text(160),
    imageSide: z.enum(['left', 'right']),
    button: buttonSchema,
  }),
  // functional app sections — their behaviour is fixed, only their position/visibility is editable
  orderForm: z.object({}),
  trackOrder: z.object({}),
  payment: z.object({}),
} as const;

export type SectionType = keyof typeof sectionPropsSchemas;
export const SECTION_TYPES = Object.keys(sectionPropsSchemas) as SectionType[];
export type SectionProps<T extends SectionType> = z.infer<(typeof sectionPropsSchemas)[T]>;

export type Section<T extends SectionType = SectionType> = {
  [K in SectionType]: { id: string; type: K; visible: boolean; style: SectionStyle; props: SectionProps<K> };
}[T];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero',
  pageHeader: 'Page header',
  services: 'Services',
  portfolio: 'Portfolio',
  benefits: 'Benefits',
  process: 'How it works',
  pricing: 'Pricing',
  testimonials: 'Testimonials',
  faq: 'FAQ',
  contact: 'Contact',
  cta: 'Call to action',
  richText: 'Text content',
  imageText: 'Image + text',
  orderForm: 'Order form',
  trackOrder: 'Order tracking',
  payment: 'Payment',
};

/** App sections can only exist once and cannot be added/removed from the editor. */
export const LOCKED_SECTION_TYPES: SectionType[] = ['orderForm', 'trackOrder', 'payment'];

export interface Page {
  title: string;
  sections: Section[];
}

export const PAGE_SLUGS = [
  'home', 'services', 'pricing', 'portfolio', 'about', 'start-a-project', 'track-order', 'payment',
  'faq', 'contact', 'privacy-policy', 'terms-and-conditions',
] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

export const PAGE_PATHS: Record<PageSlug, string> = {
  home: '/',
  services: '/services',
  pricing: '/pricing',
  portfolio: '/portfolio',
  about: '/about',
  'start-a-project': '/start-a-project',
  'track-order': '/track-order',
  payment: '/payment',
  faq: '/faq',
  contact: '/contact',
  'privacy-policy': '/privacy-policy',
  'terms-and-conditions': '/terms-and-conditions',
};

export interface SiteDoc {
  theme: Theme;
  brand: Brand;
  navigation: Navigation;
  footer: Footer;
  buttons: ButtonsConfig;
  forms: Forms;
  pages: Record<PageSlug, Page>;
}
