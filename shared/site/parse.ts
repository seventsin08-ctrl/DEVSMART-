// Turns whatever is stored in the database into a complete, valid SiteDoc.
// Invalid or missing pieces fall back to defaults instead of breaking the site.
import { DEFAULT_SECTION_PROPS, DEFAULT_SECTION_STYLE, DEFAULT_SITE } from './defaults';
import {
  PAGE_SLUGS, brandSchema, buttonsSchema, footerSchema, formsSchema, navigationSchema,
  sectionPropsSchemas, sectionStyleSchema, themeSchema,
  type Page, type PageSlug, type Section, type SectionType, type SiteDoc,
} from './schema';

type Json = unknown;
const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Recursively overlays `override` on `base`. Arrays and primitives are replaced, objects merged. */
export function deepMerge<T>(base: T, override: Json): T {
  if (!isObject(base) || !isObject(override)) return (override === undefined || override === null ? base : override) as T;
  const out: Record<string, Json> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    out[k] = k in base ? deepMerge((base as Record<string, Json>)[k], v) : v;
  }
  return out as T;
}

function parsePart<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, fallback: T, raw: Json): T {
  if (!isObject(raw)) return structuredClone(fallback);
  const merged = deepMerge(structuredClone(fallback), raw);
  const result = schema.safeParse(merged);
  return result.success ? (result.data as T) : structuredClone(fallback);
}

export function parseSection(raw: Json): Section | null {
  if (!isObject(raw)) return null;
  const type = raw.type as SectionType;
  if (typeof type !== 'string' || !(type in sectionPropsSchemas)) return null;
  const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id) ? raw.id : null;
  if (!id) return null;
  const style = sectionStyleSchema.safeParse(deepMerge({ ...DEFAULT_SECTION_STYLE }, raw.style));
  const props = sectionPropsSchemas[type].safeParse(
    deepMerge(structuredClone(DEFAULT_SECTION_PROPS[type]) as Record<string, Json>, raw.props),
  );
  if (!props.success) return null;
  return {
    id, type, visible: raw.visible !== false,
    style: style.success ? style.data : { ...DEFAULT_SECTION_STYLE },
    props: props.data,
  } as Section;
}

function parsePage(slug: PageSlug, raw: Json): Page {
  const fallback = DEFAULT_SITE.pages[slug];
  if (!isObject(raw) || !Array.isArray(raw.sections)) return structuredClone(fallback);
  const seen = new Set<string>();
  const sections: Section[] = [];
  for (const item of raw.sections.slice(0, 40)) {
    const section = parseSection(item);
    if (!section || seen.has(section.id)) continue;
    seen.add(section.id);
    sections.push(section);
  }
  // functional sections must never disappear from their page
  for (const required of fallback.sections.filter((s) => ['orderForm', 'trackOrder', 'payment'].includes(s.type))) {
    if (!sections.some((s) => s.type === required.type)) sections.push(structuredClone(required));
  }
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.slice(0, 80) : fallback.title;
  return { title, sections };
}

/** Always returns a complete, schema-valid document. */
export function normalizeSiteDoc(raw: Json): SiteDoc {
  const src = isObject(raw) ? raw : {};
  const rawPages = isObject(src.pages) ? src.pages : {};
  const pages = {} as Record<PageSlug, Page>;
  for (const slug of PAGE_SLUGS) pages[slug] = parsePage(slug, rawPages[slug]);
  return {
    theme: parsePart(themeSchema, DEFAULT_SITE.theme, src.theme),
    brand: parsePart(brandSchema, DEFAULT_SITE.brand, src.brand),
    navigation: parsePart(navigationSchema, DEFAULT_SITE.navigation, src.navigation),
    footer: parsePart(footerSchema, DEFAULT_SITE.footer, src.footer),
    buttons: parsePart(buttonsSchema, DEFAULT_SITE.buttons, src.buttons),
    forms: parsePart(formsSchema, DEFAULT_SITE.forms, src.forms),
    pages,
  };
}

/** Strict validation used before saving: returns human-readable problems (empty = valid). */
export function validateSiteDoc(doc: SiteDoc): string[] {
  const problems: string[] = [];
  const check = (label: string, schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown) => {
    const r = schema.safeParse(value);
    if (!r.success) for (const i of r.error!.issues.slice(0, 5)) problems.push(`${label} › ${i.path.join('.')}: ${i.message}`);
  };
  check('Theme', themeSchema, doc.theme);
  check('Brand', brandSchema, doc.brand);
  check('Navigation', navigationSchema, doc.navigation);
  check('Footer', footerSchema, doc.footer);
  check('Buttons', buttonsSchema, doc.buttons);
  check('Forms', formsSchema, doc.forms);
  for (const slug of PAGE_SLUGS) {
    const ids = new Set<string>();
    for (const s of doc.pages[slug]?.sections ?? []) {
      if (ids.has(s.id)) problems.push(`${slug} › duplicate section id ${s.id}`);
      ids.add(s.id);
      check(`${slug} › ${s.type}`, sectionPropsSchemas[s.type], s.props);
      check(`${slug} › ${s.type} style`, sectionStyleSchema, s.style);
    }
  }
  return problems;
}
