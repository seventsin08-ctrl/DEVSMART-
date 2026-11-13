// Content sections. Every piece of text comes from validated site data and is rendered as
// plain text by React (never as HTML).
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Check, ChevronDown, Clock, Quote, Tag } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { bpsToPercentLabel, formatPHP } from '@shared/money';
import { safeHref, safeImage, type SectionProps, type SectionType } from '@shared/site/schema';
import { api, errorMessage } from '@/lib/api';
import { deliveryLabel, useAddons, usePortfolio, usePublicPromotions, useServices, type PortfolioRow } from '@/lib/catalog';
import { cx } from '@/lib/utils';
import { Btn, Field, Glass, Notice } from '@/ui';
import { Turnstile } from '../Turnstile';
import { ContactList, SiteButton, SiteLink } from '../chrome';
import { Assemble, DriftingCursors, Sculpture } from '../fx';
import { SiteIcon } from '../icons';
import { useSite } from '../SiteContext';

type P<T extends SectionType> = { id: string; props: SectionProps<T>; align: 'left' | 'center' };

export function Heading({ id, eyebrow, title, subtitle, align, as = 'h2' }: { id: string; eyebrow?: string; title?: string; subtitle?: string; align: 'left' | 'center'; as?: 'h1' | 'h2' }) {
  if (!eyebrow && !title && !subtitle) return null;
  const H = as;
  return (
    <div className={cx('mb-10 max-w-3xl sm:mb-12', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && <p className="eyebrow mb-3" data-edit={`section:${id}:eyebrow`}>{eyebrow}</p>}
      {title && <H className={as === 'h1' ? 'h-display !text-[calc(clamp(2.2rem,6vw,4rem)*var(--dm-heading-scale))]' : 'h-section'} data-edit={`section:${id}:title`}>{title}</H>}
      {subtitle && <p className="mt-4 text-lg leading-relaxed text-muted" data-edit={`section:${id}:subtitle`}>{subtitle}</p>}
    </div>
  );
}

const Skeletons = ({ n, className }: { n: number; className?: string }) => (
  <>{Array.from({ length: n }, (_, i) => <div key={i} className={cx('dm-skeleton h-56', className)} />)}</>
);

// ───────── Hero ─────────
function DevicesVisual() {
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-xl" aria-hidden>
      <div className="glass dm-float absolute inset-x-0 top-[6%] h-[70%] overflow-hidden !rounded-[22px] p-0">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/25" /><span className="h-2.5 w-2.5 rounded-full bg-white/25" /><span className="h-2.5 w-2.5 rounded-full bg-white/25" />
          <span className="ml-3 h-5 flex-1 rounded-full bg-white/10" />
        </div>
        <div className="grid h-full grid-cols-[1fr_1.6fr] gap-4 p-5">
          <div className="space-y-2.5"><div className="h-3 w-2/3 rounded-full bg-white/30" /><div className="h-2.5 rounded-full bg-white/10" /><div className="h-2.5 w-5/6 rounded-full bg-white/10" /><div className="mt-4 h-8 w-24 rounded-full bg-accent/80" /></div>
          <div className="rounded-2xl bg-gradient-to-br from-accent/50 via-accent/10 to-transparent ring-1 ring-white/10" />
        </div>
      </div>
      <div className="glass dm-float absolute bottom-0 right-[4%] h-[62%] w-[30%] overflow-hidden !rounded-[26px] p-2.5 [animation-delay:-3s]">
        <div className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-white/25" />
        <div className="space-y-2"><div className="h-16 rounded-xl bg-gradient-to-br from-accent/60 to-accent/10" /><div className="h-2.5 w-3/4 rounded-full bg-white/25" /><div className="h-2.5 rounded-full bg-white/10" /><div className="h-8 rounded-xl bg-white/10" /><div className="h-8 rounded-xl bg-white/10" /></div>
      </div>
      <div className="glass dm-float absolute bottom-[10%] left-0 flex items-center gap-2.5 !rounded-2xl px-4 py-3 [animation-delay:-5s]">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-400/20 text-emerald-300"><Check className="h-4 w-4" /></span>
        <span className="space-y-1.5"><span className="block h-2 w-20 rounded-full bg-white/30" /><span className="block h-2 w-12 rounded-full bg-white/15" /></span>
      </div>
    </div>
  );
}

export function HeroSection({ id, props, align }: P<'hero'>) {
  const { site, editing } = useSite();
  const image = safeImage(props.imageUrl);
  const bg = safeImage(props.backgroundImageUrl);
  const hasVisual = props.visual === 'devices' || props.visual === 'orb' || props.visual === 'sculpture' || (props.visual === 'image' && image);
  const split = hasVisual && align === 'left';
  const minH = { auto: '', tall: 'min-h-[min(74dvh,720px)]', screen: 'min-h-[calc(100dvh-5rem)]' }[props.height];
  // two-tone: first sentence bright, the rest muted on its own line
  const cut = props.twoTone ? props.headline.search(/[.!?]\s/) : -1;
  const first = cut > 0 ? props.headline.slice(0, cut + 1) : props.headline;
  const rest = cut > 0 ? props.headline.slice(cut + 2) : '';
  const gradient = cx(props.gradientHeadline && 'gradient-text', props.gradientHeadline && site.theme.gradient.animated && 'gradient-animated');
  const text = (
    <div className={cx('min-w-0', align === 'center' && 'mx-auto max-w-4xl text-center')}>
      {props.eyebrow && (
        <p data-edit={`section:${id}:eyebrow`} className="dm-mono mb-6 flex max-w-full items-center gap-2.5 uppercase">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
          <span className={cx('min-w-0', align === 'center' && 'mx-auto')}>{props.eyebrow}</span>
        </p>
      )}
      <h1 data-edit={`section:${id}:headline`} className="h-display">
        <span className={gradient}>{first}</span>
        {rest && <span className="block text-ink/45">{rest}</span>}
      </h1>
      {props.subtitle && <p data-edit={`section:${id}:subtitle`} className={cx('mt-6 max-w-xl text-base leading-relaxed text-ink/70 sm:text-lg', align === 'center' && 'mx-auto')}>{props.subtitle}</p>}
      <div className={cx('mt-8 flex flex-wrap gap-3', align === 'center' && 'justify-center')}>
        <SiteButton config={props.primaryButton} edit={`section:${id}:primaryButton`} size="lg" arrow />
        <SiteButton config={props.secondaryButton} edit={`section:${id}:secondaryButton`} size="lg" />
      </div>
    </div>
  );
  return (
    <div className={cx('relative flex flex-col justify-center', minH)}>
      {bg && <div className="absolute inset-0 -z-10 overflow-hidden rounded-[var(--dm-radius-card)]"><img src={bg} alt="" className="h-full w-full object-cover opacity-40" /><div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-[var(--dm-bg)]" /></div>}
      {props.showCursors && <DriftingCursors />}
      <div className={cx('grid w-full items-center gap-10 py-8', split ? 'lg:grid-cols-[1.25fr_1fr]' : 'grid-cols-1')}>
        <Assemble disabled={editing} seed={1}>{text}</Assemble>
        {hasVisual && (
          <motion.div initial={editing ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            className={cx('min-w-0', !split && 'mx-auto w-full max-w-3xl')} data-edit={`section:${id}:visual`}>
            {props.visual === 'sculpture' && <Sculpture />}
            {props.visual === 'devices' && <DevicesVisual />}
            {props.visual === 'orb' && (
              <div className="relative mx-auto aspect-square w-full max-w-sm" aria-hidden>
                <div className="dm-float absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_30%_25%,#fff,var(--dm-accent)_38%,#000_78%)] shadow-[0_0_120px_-10px_var(--dm-accent)]" />
                <div className="glass absolute inset-0 !rounded-full !bg-transparent" />
              </div>
            )}
            {props.visual === 'image' && image && <Glass className="overflow-hidden p-2"><img src={image} alt={props.imageAlt} className="w-full rounded-[calc(var(--dm-radius-card)-8px)] object-cover" /></Glass>}
          </motion.div>
        )}
      </div>
      {props.chips.length > 0 && (
        <ul data-edit={`section:${id}:chips`} className={cx('mt-4 grid grid-cols-2 gap-x-8 gap-y-4 border-b border-accent/70 pb-5 sm:flex sm:flex-wrap', align === 'center' ? 'sm:justify-center' : 'sm:justify-between')}>
          {props.chips.map((c, i) => (
            <li key={i}><span className="dm-mono block uppercase">{String(i + 1).padStart(2, '0')}</span><span className="mt-1 block text-lg font-semibold tracking-tight sm:text-xl">{c}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PageHeaderSection({ id, props, align }: P<'pageHeader'>) {
  return <div className="pt-6 [&>div]:mb-0"><Heading id={id} {...props} align={align} as="h1" /></div>;
}

// ───────── Services ─────────
export function ServicesSection({ id, props, align }: P<'services'>) {
  const { data, isLoading } = useServices();
  const list = props.limit > 0 ? (data ?? []).slice(0, props.limit) : data ?? [];
  return (
    <>
      <Heading id={id} {...props} align={align} />
      <div className={cx('grid gap-5 sm:grid-cols-2', props.columns === 3 && 'lg:grid-cols-3')}>
        {isLoading && <Skeletons n={props.limit || 6} className="h-64" />}
        {list.map((s) => (
          <Glass key={s.id} hover spot className="flex flex-col p-6">
            {safeImage(s.image_url) ? <img src={safeImage(s.image_url)} alt="" loading="lazy" className="mb-5 aspect-[16/9] w-full rounded-2xl object-cover" />
              : <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-gradient-to-br from-accent/35 to-accent/5 text-ink"><SiteIcon name={s.icon} className="h-6 w-6" /></span>}
            <h3 className="h-card">{s.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.short_description}</p>
            {props.showFeatures && s.features.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
                {s.features.slice(0, 5).map((f, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{f}</li>)}
              </ul>
            )}
            <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-6">
              {props.showPrices && (
                <p><span className="block text-xs uppercase tracking-wider text-muted">Starts at</span><span className="text-2xl font-semibold tracking-tight">{formatPHP(s.starting_price_centavos)}</span></p>
              )}
              <SiteLink href={`/start-a-project?service=${s.slug}`} className="btn btn-sm btn-secondary">Get started <ArrowUpRight className="h-4 w-4" aria-hidden /></SiteLink>
            </div>
          </Glass>
        ))}
      </div>
      <div className={cx('mt-10 flex', align === 'center' && 'justify-center')}><SiteButton config={props.button} edit={`section:${id}:button`} /></div>
    </>
  );
}

// ───────── Portfolio ─────────
function hue(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
function PortfolioCard({ p, onOpen }: { p: PortfolioRow; onOpen: () => void }) {
  const img = safeImage(p.image_url);
  const h = hue(p.slug);
  return (
    <Glass hover className="group overflow-hidden p-2">
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`View ${p.title}`}>
        <div className="relative aspect-[4/3] overflow-hidden rounded-[calc(var(--dm-radius-card)-8px)]">
          {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
            : <div className="h-full w-full transition-transform duration-700 group-hover:scale-105" style={{ background: `radial-gradient(120% 90% at 20% 10%, hsl(${h} 80% 62% / .7), transparent 55%), radial-gradient(90% 90% at 90% 90%, hsl(${(h + 70) % 360} 80% 55% / .55), transparent 60%), #0b0e14` }}>
                <div className="absolute inset-[14%] rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md"><div className="m-4 h-2.5 w-1/2 rounded-full bg-white/50" /><div className="mx-4 h-2 w-3/4 rounded-full bg-white/20" /></div>
              </div>}
          {p.is_concept && <span className="absolute left-3 top-3 rounded-full border border-white/25 bg-black/50 px-2.5 py-0.5 text-xs font-medium backdrop-blur-md">Concept</span>}
        </div>
        <div className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">{p.category}</p>
          <h3 className="h-card mt-1">{p.title}</h3>
          <p className="mt-1.5 line-clamp-2 text-sm text-muted">{p.summary}</p>
        </div>
      </button>
    </Glass>
  );
}
export function PortfolioSection({ id, props, align }: P<'portfolio'>) {
  const { data, isLoading } = usePortfolio();
  const [open, setOpen] = useState<PortfolioRow | null>(null);
  let list = (data ?? []).filter((p) => !props.featuredOnly || p.is_featured);
  if (props.featuredOnly && list.length === 0) list = data ?? [];
  if (props.limit > 0) list = list.slice(0, props.limit);
  return (
    <>
      <Heading id={id} {...props} align={align} />
      {!isLoading && list.length === 0 ? <p className={cx('text-muted', align === 'center' && 'text-center')}>Our portfolio is being prepared. Check back soon.</p> : (
        <div className={cx('grid gap-5 sm:grid-cols-2', props.columns === 3 && 'lg:grid-cols-3')}>
          {isLoading && <Skeletons n={3} className="h-72" />}
          {list.map((p) => <PortfolioCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
        </div>
      )}
      <div className={cx('mt-10 flex', align === 'center' && 'justify-center')}><SiteButton config={props.button} edit={`section:${id}:button`} /></div>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[90] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.div role="dialog" aria-modal="true" aria-label={open.title} onClick={(e) => e.stopPropagation()} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
              className="glass scroll-thin max-h-[88dvh] w-full max-w-2xl overflow-y-auto !bg-surface/95 p-6 text-left">
              <p className="text-xs font-medium uppercase tracking-wider text-accent">{open.category}{open.is_concept && ' · Concept project'}</p>
              <h3 className="mt-1 text-2xl font-semibold">{open.title}</h3>
              {safeImage(open.image_url) && <img src={safeImage(open.image_url)} alt="" className="mt-4 w-full rounded-2xl" />}
              <p className="mt-4 whitespace-pre-line leading-relaxed text-ink/85">{open.description || open.summary}</p>
              {open.client_name && <p className="mt-3 text-sm text-muted">Client: {open.client_name}</p>}
              {open.tech.length > 0 && <ul className="mt-4 flex flex-wrap gap-2">{open.tech.map((t, i) => <li key={i} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs">{t}</li>)}</ul>}
              <div className="mt-6 flex flex-wrap gap-3">
                {open.project_url && safeHref(open.project_url) !== '#' && <a className="btn btn-md btn-secondary" href={safeHref(open.project_url)} target="_blank" rel="noopener noreferrer">Visit project <ArrowUpRight className="h-4 w-4" /></a>}
                <Btn variant="ghost" onClick={() => setOpen(null)}>Close</Btn>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ───────── Benefits / Process ─────────
export function BenefitsSection({ id, props, align }: P<'benefits'>) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[props.columns];
  return (
    <>
      <Heading id={id} {...props} align={align} />
      <div className={cx('grid gap-5', cols)} data-edit={`section:${id}:items`}>
        {props.items.map((b) => (
          <Glass key={b.id} hover className={cx('p-6', align === 'center' && 'text-center')}>
            <span className={cx('mb-4 grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-accent', align === 'center' && 'mx-auto')}><SiteIcon name={b.icon} className="h-5 w-5" /></span>
            <h3 className="h-card">{b.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{b.text}</p>
          </Glass>
        ))}
      </div>
    </>
  );
}

export function ProcessSection({ id, props, align }: P<'process'>) {
  return (
    <>
      <Heading id={id} {...props} align={align} />
      <ol className="relative grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3" data-edit={`section:${id}:items`}>
        {props.items.map((s, i) => (
          <li key={s.id}>
            <Glass className="flex h-full gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/15 font-semibold text-ink">{i + 1}</span>
              <div className="min-w-0"><h3 className="font-semibold">{s.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p></div>
            </Glass>
          </li>
        ))}
      </ol>
    </>
  );
}

// ───────── Pricing ─────────
export function PricingSection({ id, props, align }: P<'pricing'>) {
  const services = useServices();
  const addons = useAddons();
  const promos = usePublicPromotions();
  const globalAddons = (addons.data ?? []).filter((a) => a.service_id === null);
  return (
    <>
      <Heading id={id} {...props} align={align} />
      {props.showPromotions && (promos.data ?? []).length > 0 && (
        <div className="mx-auto mb-8 flex max-w-3xl flex-col gap-3">
          {promos.data!.map((p) => (
            <Glass key={p.id} className="flex flex-wrap items-center gap-3 !border-accent/40 px-5 py-4 text-left">
              <Tag className="h-5 w-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.name} — {p.discount_type === 'percent' ? `${bpsToPercentLabel(p.percent_bps ?? 0)} off` : `${formatPHP(p.fixed_centavos ?? 0)} off`}</p>
                {p.description && <p className="text-sm text-muted">{p.description}</p>}
              </div>
              {p.code && <span className="rounded-full border border-dashed border-accent/60 bg-accent/10 px-3 py-1 font-mono text-sm">{p.code}</span>}
            </Glass>
          ))}
        </div>
      )}
      <div className="grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-3">
        {services.isLoading && <Skeletons n={6} className="h-48" />}
        {(services.data ?? []).map((s) => (
          <Glass key={s.id} hover className="flex flex-col p-6">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-accent"><SiteIcon name={s.icon} className="h-5 w-5" /></span><h3 className="h-card min-w-0">{s.name}</h3></div>
            <p className="mt-5 text-sm text-muted">Starts at</p>
            <p className="text-4xl font-semibold tracking-tight">{formatPHP(s.starting_price_centavos)}</p>
            {deliveryLabel(s.delivery_days_min, s.delivery_days_max) && <p className="mt-2 flex items-center gap-1.5 text-sm text-muted"><Clock className="h-4 w-4" aria-hidden />Estimated delivery: {deliveryLabel(s.delivery_days_min, s.delivery_days_max)}</p>}
            <ul className="mt-4 space-y-1.5 text-sm text-ink/80">{s.features.slice(0, 4).map((f, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{f}</li>)}</ul>
            <SiteLink href={`/start-a-project?service=${s.slug}`} className="btn btn-md btn-secondary mt-6 w-full">Choose {s.name}</SiteLink>
          </Glass>
        ))}
      </div>
      {props.showAddons && globalAddons.length > 0 && (
        <Glass className="mx-auto mt-8 max-w-3xl p-6 text-left">
          <h3 className="h-card">Optional add-ons</h3>
          <ul className="mt-4 divide-y divide-white/10">
            {globalAddons.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0"><p className="font-medium">{a.name}</p>{a.description && <p className="text-sm text-muted">{a.description}</p>}</div>
                <p className="shrink-0 font-semibold">+{formatPHP(a.price_centavos)}</p>
              </li>
            ))}
          </ul>
        </Glass>
      )}
      {props.note && <p className={cx('mx-auto mt-8 max-w-2xl text-sm text-muted', align === 'center' && 'text-center')} data-edit={`section:${id}:note`}>{props.note}</p>}
      <div className={cx('mt-8 flex', align === 'center' && 'justify-center')}><SiteButton config={props.button} edit={`section:${id}:button`} arrow /></div>
    </>
  );
}

// ───────── Testimonials / FAQ ─────────
export function TestimonialsSection({ id, props, align }: P<'testimonials'>) {
  return (
    <>
      <Heading id={id} {...props} align={align} />
      {props.items.length === 0 ? (
        <Glass className="mx-auto max-w-2xl p-8 text-center" data-edit={`section:${id}:items`}>
          <Quote className="mx-auto h-8 w-8 text-accent/70" aria-hidden />
          <p className="mt-4 text-muted">{props.emptyText}</p>
        </Glass>
      ) : (
        <div className="grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-3" data-edit={`section:${id}:items`}>
          {props.items.map((t) => (
            <Glass key={t.id} className="flex flex-col p-6">
              <Quote className="h-6 w-6 text-accent/70" aria-hidden />
              <blockquote className="mt-3 flex-1 leading-relaxed text-ink/90">{t.quote}</blockquote>
              <footer className="mt-5 border-t border-white/10 pt-4"><p className="font-semibold">{t.name}</p>{t.role && <p className="text-sm text-muted">{t.role}</p>}</footer>
            </Glass>
          ))}
        </div>
      )}
    </>
  );
}

export function FaqSection({ id, props, align }: P<'faq'>) {
  const [open, setOpen] = useState<string | null>(props.items[0]?.id ?? null);
  return (
    <>
      <Heading id={id} {...props} align={align} />
      <div className={cx('max-w-3xl space-y-3 text-left', align === 'center' && 'mx-auto')} data-edit={`section:${id}:items`}>
        {props.items.map((f) => {
          const isOpen = open === f.id;
          return (
            <Glass key={f.id} className="overflow-hidden !rounded-[calc(var(--dm-radius-card)*0.75)]">
              <h3>
                <button type="button" aria-expanded={isOpen} aria-controls={`faq-${id}-${f.id}`} onClick={() => setOpen(isOpen ? null : f.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium">
                  {f.question}
                  <ChevronDown className={cx('h-5 w-5 shrink-0 text-muted transition-transform duration-300', isOpen && 'rotate-180')} aria-hidden />
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div id={`faq-${id}-${f.id}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }}>
                    <p className="whitespace-pre-line px-5 pb-5 leading-relaxed text-muted">{f.answer}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Glass>
          );
        })}
      </div>
    </>
  );
}

// ───────── Contact ─────────
function ContactForm() {
  const { site, editing } = useSite();
  const started = useRef(Date.now());
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', website: '' });
  const [captcha, setCaptcha] = useState('');
  const send = useMutation({
    mutationFn: () => api('contact', { name: form.name, email: form.email, phone: form.phone, message: form.message, antispam: { website: form.website, elapsed_ms: Date.now() - started.current, turnstile_token: captcha } }),
    onSuccess: () => setForm({ name: '', email: '', phone: '', message: '', website: '' }),
  });
  const fields = (send.error as { fields?: Record<string, string> } | null)?.fields ?? {};
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  if (send.isSuccess) return <Notice tone="success" title="Message sent">{site.forms.contact.successMessage}</Notice>;
  return (
    <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!editing) send.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={fields.name}>{(p) => <input {...p} className="field" autoComplete="name" value={form.name} onChange={set('name')} required maxLength={200} />}</Field>
        <Field label="Email" required error={fields.email}>{(p) => <input {...p} className="field" type="email" autoComplete="email" value={form.email} onChange={set('email')} required maxLength={254} />}</Field>
      </div>
      <Field label="Mobile number (optional)" error={fields.phone}>{(p) => <input {...p} className="field" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} maxLength={40} />}</Field>
      <Field label="Message" required error={fields.message}>{(p) => <textarea {...p} className="field" value={form.message} onChange={set('message')} required maxLength={5000} />}</Field>
      <div className="absolute -left-[9999px]" aria-hidden><label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label></div>
      <Turnstile onToken={setCaptcha} />
      {send.isError && Object.keys(fields).length === 0 && <Notice tone="danger">{errorMessage(send.error)}</Notice>}
      <div><Btn type="submit" loading={send.isPending}>{site.forms.contact.submitLabel}</Btn></div>
    </form>
  );
}

export function ContactSection({ id, props, align }: P<'contact'>) {
  const { site } = useSite();
  const c = site.brand.contact;
  const hasDetails = props.showDetails && Boolean(c.email || c.phone || c.facebookUrl || c.address || c.hours);
  return (
    <>
      <Heading id={id} {...props} align={align} />
      <div className={cx('grid gap-6 text-left', align === 'center' && 'mx-auto', hasDetails && props.showForm ? 'max-w-5xl lg:grid-cols-[1fr_1.5fr]' : 'max-w-2xl')}>
        {hasDetails && <Glass className="p-6"><h3 className="h-card mb-4">Reach us directly</h3><ContactList /></Glass>}
        {props.showForm && <Glass className="relative overflow-hidden p-6"><ContactForm /></Glass>}
      </div>
    </>
  );
}

// ───────── CTA / rich text / image + text ─────────
export function CtaSection({ id, props, align }: P<'cta'>) {
  return (
    <div className={cx('dm-brackets', align === 'center' && 'mx-auto max-w-3xl text-center')}>
      <h2 className="h-section max-w-3xl" data-edit={`section:${id}:title`}>{props.title}</h2>
      {props.text && <p className={cx('mt-4 max-w-2xl text-lg text-muted', align === 'center' && 'mx-auto')} data-edit={`section:${id}:text`}>{props.text}</p>}
      <div className={cx('mt-8 flex flex-wrap gap-3', align === 'center' && 'justify-center')}>
        <SiteButton config={props.primaryButton} edit={`section:${id}:primaryButton`} size="lg" arrow />
        <SiteButton config={props.secondaryButton} edit={`section:${id}:secondaryButton`} size="lg" />
      </div>
    </div>
  );
}

export function RichTextSection({ id, props }: P<'richText'>) {
  return (
    <article className="mx-auto max-w-3xl text-left" data-edit={`section:${id}:blocks`}>
      {props.title && <h2 className="h-section mb-8">{props.title}</h2>}
      <div className="space-y-8">
        {props.blocks.map((b) => (
          <section key={b.id}>
            {b.heading && <h3 className="mb-2.5 text-xl font-semibold">{b.heading}</h3>}
            <p className="whitespace-pre-line leading-relaxed text-ink/80">{b.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}

export function ImageTextSection({ id, props }: P<'imageText'>) {
  const img = safeImage(props.imageUrl);
  const media: ReactNode = (
    <Glass className="overflow-hidden p-2" data-edit={`section:${id}:imageUrl`}>
      {img ? <img src={img} alt={props.imageAlt} loading="lazy" className="aspect-[4/3] w-full rounded-[calc(var(--dm-radius-card)-8px)] object-cover" />
        : <div className="aspect-[4/3] w-full rounded-[calc(var(--dm-radius-card)-8px)] bg-[radial-gradient(120%_90%_at_20%_10%,color-mix(in_srgb,var(--dm-accent)_60%,transparent),transparent_55%),radial-gradient(90%_90%_at_90%_90%,color-mix(in_srgb,var(--dm-accent2)_35%,transparent),transparent_60%)]" aria-hidden />}
    </Glass>
  );
  return (
    <div className="grid items-center gap-10 text-left lg:grid-cols-2">
      <div className={cx('min-w-0', props.imageSide === 'left' && 'lg:order-2')}>
        {props.eyebrow && <p className="eyebrow mb-3" data-edit={`section:${id}:eyebrow`}>{props.eyebrow}</p>}
        <h2 className="h-section" data-edit={`section:${id}:title`}>{props.title}</h2>
        {props.subtitle && <p className="mt-3 text-lg text-muted">{props.subtitle}</p>}
        <p className="mt-5 whitespace-pre-line leading-relaxed text-ink/80" data-edit={`section:${id}:text`}>{props.text}</p>
        <div className="mt-7"><SiteButton config={props.button} edit={`section:${id}:button`} /></div>
      </div>
      <div className="min-w-0">{media}</div>
    </div>
  );
}
