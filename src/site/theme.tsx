import { useEffect, type CSSProperties } from 'react';
import { FONT_OPTIONS, safeImage, type SiteDoc, type Theme } from '@shared/site/schema';

/** Maps the validated theme to CSS custom properties. Only numbers, hex colours and allowlisted font stacks get through. */
export function themeVars(theme: Theme): CSSProperties {
  return {
    '--dm-overlay': theme.mode === 'light' ? theme.colors.text : '#ffffff',
    '--dm-bg': theme.colors.background,
    '--dm-surface': theme.colors.surface,
    '--dm-text': theme.colors.text,
    '--dm-muted': theme.colors.muted,
    '--dm-accent': theme.colors.accent,
    '--dm-accent2': theme.colors.accent2,
    '--dm-grad-from': theme.gradient.from,
    '--dm-grad-via': theme.gradient.via,
    '--dm-grad-to': theme.gradient.to,
    '--dm-grad-angle': `${theme.gradient.angle}deg`,
    '--dm-glass-opacity': `${theme.glass.opacity}%`,
    '--dm-glass-blur': `${theme.glass.blur}px`,
    '--dm-glass-border': `${theme.glass.border}%`,
    '--dm-glass-sat': `${theme.glass.saturation}%`,
    '--dm-radius-card': `${theme.radius.card}px`,
    '--dm-radius-btn': `${theme.radius.button}px`,
    '--dm-shadow': String(theme.shadow.intensity / 100),
    '--dm-heading-scale': String(theme.scale.heading),
    '--dm-bg-intensity': String(theme.background.intensity / 100),
    '--dm-font-heading': FONT_OPTIONS[theme.fonts.heading].stack,
    '--dm-font-body': FONT_OPTIONS[theme.fonts.body].stack,
  } as CSSProperties;
}

/** Applies document-level effects of the theme & brand: root variables, font files, favicon, title. */
export function useDocumentTheme(site: SiteDoc, pageTitle?: string): void {
  const { theme, brand } = site;
  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(themeVars(theme))) root.style.setProperty(k, String(v));
    root.style.fontSize = `${theme.scale.base}px`;
    root.dataset.dmMode = theme.mode;
    root.style.colorScheme = theme.mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.background);
  }, [theme]);

  useEffect(() => {
    const families = [...new Set([theme.fonts.heading, theme.fonts.body])].map((k) => FONT_OPTIONS[k].google).filter(Boolean);
    const id = 'dm-fonts';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (families.length === 0) {
      link?.remove();
      return;
    }
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
  }, [theme.fonts.heading, theme.fonts.body]);

  useEffect(() => {
    const href = safeImage(brand.faviconUrl) ?? '/favicon.svg';
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link && link.getAttribute('href') !== href) {
      link.href = href;
      if (!href.endsWith('.svg')) link.removeAttribute('type');
    }
  }, [brand.faviconUrl]);

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} — ${brand.name}` : `${brand.name} — ${brand.tagline}`;
  }, [brand.name, brand.tagline, pageTitle]);
}

export function Backdrop({ theme }: { theme: Theme }) {
  const { style, animated } = theme.background;
  return (
    <div className={`dm-backdrop ${animated ? 'dm-animated' : ''}`} aria-hidden>
      {(style === 'aurora' || style === 'mesh') && (<><div className="dm-blob dm-blob-a" /><div className="dm-blob dm-blob-b" />{style === 'mesh' && <div className="dm-blob dm-blob-c" />}</>)}
      {style === 'grid' && (<><div className="dm-spot" /><div className="dm-grid" /></>)}
      {style === 'spotlight' && <div className="dm-spot" />}
      {style !== 'solid' && <div className="dm-noise" />}
    </div>
  );
}
