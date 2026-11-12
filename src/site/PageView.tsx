// Renders a page from validated site data. Used by the public site AND the studio preview,
// so what the admin sees while editing is exactly what visitors get after publishing.
import { motion } from 'motion/react';
import { Suspense, type ComponentType, type ReactNode } from 'react';
import type { PageSlug, Section, SectionStyle, SectionType } from '@shared/site/schema';
import { cx } from '@/lib/utils';
import { Spinner } from '@/ui';
import { Footer, Nav } from './chrome';
import { Assemble } from './fx';
import { useSite } from './SiteContext';
import {
  BenefitsSection, ContactSection, CtaSection, FaqSection, HeroSection, ImageTextSection, PageHeaderSection,
  PortfolioSection, PricingSection, ProcessSection, RichTextSection, ServicesSection, TestimonialsSection,
} from './sections/content';
import { OrderFormSection } from './sections/OrderForm';
import { PaymentSection } from './sections/Payment';
import { TrackOrderSection } from './sections/TrackOrder';
import { Backdrop, themeVars } from './theme';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COMPONENTS: Record<SectionType, ComponentType<any>> = {
  hero: HeroSection, pageHeader: PageHeaderSection, services: ServicesSection, portfolio: PortfolioSection,
  benefits: BenefitsSection, process: ProcessSection, pricing: PricingSection, testimonials: TestimonialsSection,
  faq: FaqSection, contact: ContactSection, cta: CtaSection, richText: RichTextSection, imageText: ImageTextSection,
  orderForm: OrderFormSection, trackOrder: TrackOrderSection, payment: PaymentSection,
};

const PAD: Record<SectionStyle['paddingY'], string> = { none: 'py-0', sm: 'py-6 sm:py-8', md: 'py-10 sm:py-14', lg: 'py-14 sm:py-20', xl: 'py-16 sm:py-28' };
const WIDTH: Record<SectionStyle['width'], string> = { narrow: 'max-w-3xl', normal: 'max-w-6xl', wide: 'max-w-[88rem]' };
const ANIM = {
  none: null,
  fade: { hidden: { opacity: 0 }, show: { opacity: 1 } },
  rise: { hidden: { opacity: 0, y: 36 }, show: { opacity: 1, y: 0 } },
  scale: { hidden: { opacity: 0, scale: 0.94 }, show: { opacity: 1, scale: 1 } },
  blur: { hidden: { opacity: 0, filter: 'blur(14px)' }, show: { opacity: 1, filter: 'blur(0px)' } },
  assemble: null,
} as const;

function SectionShell({ section, children, index }: { section: Section; children: ReactNode; index: number }) {
  const { editing } = useSite();
  const { style } = section;
  const anim = section.type === 'hero' ? null : ANIM[style.animation];
  const accent = style.accent ? ({ '--dm-accent': style.accent } as React.CSSProperties) : undefined;
  const inner = (
    <div className={cx('mx-auto w-full', WIDTH[style.width], style.align === 'center' ? 'text-center' : 'text-left',
      style.background === 'glass' && 'glass px-5 py-10 sm:px-10 sm:py-14',
      style.background === 'tint' && 'rounded-[var(--dm-radius-card)] bg-[color-mix(in_srgb,var(--dm-accent)_8%,transparent)] px-5 py-10 sm:px-10 sm:py-14',
      style.background === 'glow' && 'relative')}>
      {style.background === 'glow' && <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 mx-auto h-72 max-w-3xl rounded-full bg-[color-mix(in_srgb,var(--dm-accent)_22%,transparent)] blur-[90px]" />}
      {style.animation === 'assemble' && section.type !== 'hero' && !['orderForm', 'trackOrder', 'payment'].includes(section.type)
        ? <Assemble disabled={editing} seed={index}>{children}</Assemble> : children}
    </div>
  );
  return (
    <section id={section.id} data-edit={`section:${section.id}`} data-section-type={section.type} style={accent}
      className={cx('relative px-4 sm:px-6 lg:px-8', PAD[style.paddingY], !section.visible && 'dm-hidden-section')}>
      {anim ? (
        <motion.div key={style.animation} variants={anim} initial={editing ? false : 'hidden'} whileInView="show" viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
          {inner}
        </motion.div>
      ) : inner}
    </section>
  );
}

export function SectionList({ sections }: { sections: Section[] }) {
  const { editing } = useSite();
  return (
    <>
      {sections.filter((s) => s.visible || editing).map((s, index) => {
        const Component = COMPONENTS[s.type];
        return (
          <SectionShell key={s.id} section={s} index={index}>
            <Suspense fallback={<Spinner />}><Component id={s.id} props={s.props} align={s.style.align} /></Suspense>
          </SectionShell>
        );
      })}
    </>
  );
}

/** Full page: ambient background, navigation, sections, footer. */
export function PageView({ slug }: { slug: PageSlug }) {
  const { site, editing } = useSite();
  const page = site.pages[slug];
  return (
    <div className={cx('relative min-h-dvh overflow-x-clip', editing && 'dm-editing', site.theme.labels.mono && 'dm-mono-labels', site.theme.labels.numbered && 'dm-numbered', site.theme.labels.rules && 'dm-rules')} style={themeVars(site.theme)}>
      <Backdrop theme={site.theme} />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">Skip to content</a>
        <Nav currentSlug={slug} />
        <main id="main" className="flex-1"><SectionList sections={page.sections} /></main>
        <Footer />
      </div>
    </div>
  );
}
