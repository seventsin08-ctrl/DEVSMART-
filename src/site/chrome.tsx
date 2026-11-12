// Site chrome: links, buttons, navigation and footer. Rendered identically on the public
// site and inside the Branding Studio preview.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Mail, MapPin, Menu, Phone, X } from 'lucide-react';
import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PAGE_PATHS, safeHref, safeImage, type ButtonConfig, type PageSlug } from '@shared/site/schema';
import { cx } from '@/lib/utils';
import { useSite } from './SiteContext';


const SLUG_BY_PATH = Object.fromEntries(Object.entries(PAGE_PATHS).map(([slug, path]) => [path, slug])) as Record<string, PageSlug>;
export function slugForHref(href: string): PageSlug | null {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return SLUG_BY_PATH[path] ?? null;
}

export function SiteLink({ href, children, edit, ...rest }: { href: string; edit?: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { editing, onNavigate } = useSite();
  const safe = safeHref(href);
  const editAttr = edit ? { 'data-edit': edit } : {};
  if (editing) {
    return (
      <a href={safe} {...rest} {...editAttr} onClick={(e) => {
        e.preventDefault();
        if (edit) return; // selectable element: the preview's click handler selects it
        e.stopPropagation();
        const slug = slugForHref(safe);
        if (slug) onNavigate?.(slug);
      }}>{children}</a>
    );
  }
  if (safe.startsWith('/')) return <Link to={safe} {...rest}>{children}</Link>;
  const external = /^https?:/i.test(safe);
  return <a href={safe} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>{children}</a>;
}

export function useButtonClass() {
  const { site } = useSite();
  const b = site.buttons;
  return (variant: ButtonConfig['variant'], size: 'sm' | 'md' | 'lg' = b.size) =>
    cx('btn', `btn-${size}`, `btn-${variant}`, b.uppercase && 'btn-upper',
      variant === 'primary' && `btn-style-${b.style}`,
      variant === 'primary' && b.hover !== 'none' && `btn-hover-${b.hover}`,
      variant === 'primary' && b.animation !== 'none' && `btn-anim-${b.animation}`);
}

export function SiteButton({ config, edit, size, arrow }: { config: ButtonConfig; edit?: string; size?: 'sm' | 'md' | 'lg'; arrow?: boolean }) {
  const cls = useButtonClass();
  if (!config.show || !config.label.trim()) return null;
  return (
    <SiteLink href={config.href} edit={edit} className={cls(config.variant, size)}>
      {config.label}
      {arrow && <ArrowRight className="h-4 w-4" aria-hidden />}
    </SiteLink>
  );
}

export function BrandMark({ className }: { className?: string }) {
  const { site } = useSite();
  const logo = safeImage(site.brand.logoUrl);
  return (
    <span className={cx('flex min-w-0 items-center gap-2.5', className)}>
      {logo ? (
        <img src={logo} alt={site.brand.showName ? '' : site.brand.name} style={{ height: site.brand.logoHeight }} className="w-auto shrink-0 object-contain" />
      ) : (
        <span className="grid shrink-0 place-items-center rounded-[30%] border border-white/25 bg-gradient-to-br from-white/25 to-white/5 font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.4)]"
          style={{ height: site.brand.logoHeight, width: site.brand.logoHeight, fontSize: site.brand.logoHeight * 0.5 }} aria-hidden>
          {site.brand.name.trim().charAt(0).toUpperCase() || 'D'}
        </span>
      )}
      {site.brand.showName && <span className="truncate text-[1.05rem] font-semibold tracking-tight">{site.brand.name}</span>}
    </span>
  );
}

export function Nav({ currentSlug }: { currentSlug?: PageSlug }) {
  const { site, editing } = useSite();
  const nav = site.navigation;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const cls = useButtonClass();

  useEffect(() => setOpen(false), [location.pathname, currentSlug]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const floating = nav.style === 'floating';
  const isActive = (href: string) => slugForHref(href) !== null && slugForHref(href) === currentSlug;
  const justify = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[nav.align];

  return (
    <header data-edit="nav" className={cx('inset-x-0 top-0 z-50', nav.sticky ? 'sticky' : 'relative', floating ? 'px-3 pt-3 sm:px-5 sm:pt-4' : '')}>
      <nav aria-label="Main" className={cx('glass mx-auto flex items-center gap-3 px-4 transition-all duration-300',
        floating ? 'h-14 max-w-6xl !rounded-full sm:px-5' : 'h-16 max-w-none !rounded-none !border-x-0 !border-t-0 sm:px-8',
        scrolled && '!bg-black/55')}>
        <SiteLink href="/" aria-label={`${site.brand.name} home`} className="shrink-0"><BrandMark /></SiteLink>
        <ul className={cx('hidden min-w-0 flex-1 items-center gap-1 lg:flex', justify)}>
          {nav.items.map((item) => (
            <li key={item.id}>
              <SiteLink href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}
                className={cx('rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10 hover:text-ink', isActive(item.href) ? 'bg-white/10 text-ink' : 'text-ink/75')}>
                {item.label}
              </SiteLink>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          {nav.cta.show && nav.cta.label && (
            <SiteLink href={nav.cta.href} className={cx(cls(nav.cta.variant, 'sm'), 'hidden sm:inline-flex')}>{nav.cta.label}</SiteLink>
          )}
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-menu"
            onClick={(e) => { if (editing) e.stopPropagation(); setOpen((o) => !o); }}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div id="mobile-menu" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
            className={cx('lg:hidden', nav.mobile.style === 'fullscreen'
              ? 'fixed inset-0 top-0 z-[-1] flex flex-col bg-black/90 px-6 pb-8 pt-24 backdrop-blur-2xl'
              : cx('glass absolute inset-x-3 top-full mt-2 !bg-black/80 p-3 sm:inset-x-5', !floating && 'mx-3'))}>
            <ul className={cx('flex flex-col', nav.mobile.style === 'fullscreen' ? 'gap-1 text-2xl font-semibold' : 'gap-0.5')}>
              {nav.items.map((item) => (
                <li key={item.id}>
                  <SiteLink href={item.href} className={cx('block rounded-2xl px-4 py-3 hover:bg-white/10', isActive(item.href) && 'bg-white/10')}>{item.label}</SiteLink>
                </li>
              ))}
            </ul>
            {nav.mobile.showCta && nav.cta.show && nav.cta.label && (
              <SiteLink href={nav.cta.href} className={cx(cls(nav.cta.variant, 'md'), 'mt-3 w-full')}>{nav.cta.label}</SiteLink>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function ContactRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <li className="flex items-start gap-2.5 text-sm text-ink/80 [overflow-wrap:anywhere]">{icon}<span className="min-w-0">{children}</span></li>;
}

export function ContactList({ className }: { className?: string }) {
  const { site } = useSite();
  const c = site.brand.contact;
  const ic = 'mt-0.5 h-4 w-4 shrink-0 text-accent';
  if (!c.email && !c.phone && !c.facebookUrl && !c.address && !c.hours) return null;
  return (
    <ul className={cx('space-y-2.5', className)}>
      {c.email && <ContactRow icon={<Mail className={ic} aria-hidden />}><a className="hover:text-ink" href={`mailto:${c.email}`}>{c.email}</a></ContactRow>}
      {c.phone && <ContactRow icon={<Phone className={ic} aria-hidden />}><a className="hover:text-ink" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></ContactRow>}
      {c.facebookUrl && <ContactRow icon={<span className={cx(ic, 'grid place-items-center text-[11px] font-bold')} aria-hidden>f</span>}><SiteLink href={c.facebookUrl} className="hover:text-ink">Message us on Facebook</SiteLink></ContactRow>}
      {c.address && <ContactRow icon={<MapPin className={ic} aria-hidden />}>{c.address}</ContactRow>}
      {c.hours && <ContactRow icon={<span className={cx(ic, 'grid place-items-center')} aria-hidden>◷</span>}>{c.hours}</ContactRow>}
    </ul>
  );
}

export function Footer() {
  const { site } = useSite();
  const f = site.footer;
  return (
    <footer data-edit="footer" className="relative z-10 mt-16 border-t border-white/10 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_2fr]">
        <div className="min-w-0">
          <BrandMark />
          {f.text && <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">{f.text}</p>}
          {f.showContact && <ContactList className="mt-5" />}
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {f.columns.map((col) => (
            <div key={col.id} className="min-w-0">
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.id}><SiteLink href={l.href} className="text-sm text-muted transition-colors hover:text-ink">{l.label}</SiteLink></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/5 px-5 py-5 text-center text-xs text-muted">
        {f.copyright.replace('{year}', String(new Date().getFullYear()))}
      </div>
    </footer>
  );
}
