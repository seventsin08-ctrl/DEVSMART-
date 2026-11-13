// Built-in default content. The database only stores what the admin has changed;
// anything missing or invalid falls back to these values.
import type {
  ButtonConfig, Page, PageSlug, Section, SectionProps, SectionStyle, SectionType, SiteDoc,
} from './schema';

const btn = (label: string, href: string, variant: ButtonConfig['variant'] = 'primary', show = true): ButtonConfig => ({
  label, href, variant, show,
});

export const DEFAULT_SECTION_STYLE: SectionStyle = {
  paddingY: 'lg', background: 'none', align: 'left', width: 'normal', animation: 'assemble', accent: '',
};

export const DEFAULT_SECTION_PROPS: { [K in SectionType]: SectionProps<K> } = {
  hero: {
    eyebrow: 'Independent software studio · Philippines',
    headline: 'Your ideas. Beautifully built.',
    gradientHeadline: false,
    twoTone: true,
    showCursors: true,
    subtitle:
      'DevMart designs and develops affordable custom websites, mobile applications, booking systems and business software for Filipino entrepreneurs, creators and growing teams.',
    primaryButton: btn('Start a Project', '/start-a-project'),
    secondaryButton: btn('Explore Portfolio', '/portfolio', 'secondary'),
    chips: ['From ₱5,000', 'Websites & apps', 'Mobile-first', 'Made in PH'],
    visual: 'sculpture',
    imageUrl: '',
    imageAlt: '',
    backgroundImageUrl: '',
    height: 'tall',
  },
  pageHeader: { eyebrow: '', title: 'Page title', subtitle: '' },
  services: {
    eyebrow: 'Services',
    title: 'Everything you need to go digital',
    subtitle: 'Pick a starting point. Every project is tailored to your business and your budget.',
    limit: 6,
    columns: 3,
    showPrices: true,
    showFeatures: true,
    button: btn('View all services', '/services', 'secondary'),
  },
  portfolio: {
    eyebrow: 'Portfolio',
    title: 'Featured work',
    subtitle: 'A look at the kind of products we design and build.',
    featuredOnly: true,
    limit: 3,
    columns: 3,
    button: btn('Explore Portfolio', '/portfolio', 'secondary'),
  },
  benefits: {
    eyebrow: 'Why DevMart',
    title: 'Premium quality without the premium price',
    subtitle: '',
    columns: 3,
    items: [
      { id: 'b1', icon: 'Wallet', title: 'Honest, affordable pricing', text: 'Clear starting prices in pesos and a written quotation before any work begins.' },
      { id: 'b2', icon: 'MonitorSmartphone', title: 'Designed for every screen', text: 'Every build is tested on phones, tablets and desktops so it looks right everywhere.' },
      { id: 'b3', icon: 'MessageCircle', title: 'Direct communication', text: 'Talk to the people building your project through Messenger, email or phone.' },
      { id: 'b4', icon: 'ShieldCheck', title: 'Secure by default', text: 'Modern hosting, encrypted connections and protected customer data from day one.' },
      { id: 'b5', icon: 'Gauge', title: 'Fast and lightweight', text: 'Optimised pages that load quickly even on mobile data.' },
      { id: 'b6', icon: 'HeartHandshake', title: 'Support after launch', text: 'We stay available for fixes, updates and improvements after your project goes live.' },
    ],
  },
  process: {
    eyebrow: 'How ordering works',
    title: 'From idea to launch in five steps',
    subtitle: '',
    items: [
      { id: 'p1', title: 'Tell us about your project', text: 'Choose a service and describe what you need using the Start a Project form.' },
      { id: 'p2', title: 'Get a quotation', text: 'We review your request, contact you and send a clear quotation and timeline.' },
      { id: 'p3', title: 'Confirm with a deposit', text: 'Send your deposit through GCash, Maya or bank transfer and upload your proof of payment.' },
      { id: 'p4', title: 'We design and build', text: 'Follow milestones on your tracking page and request revisions along the way.' },
      { id: 'p5', title: 'Launch and handover', text: 'Settle the balance, receive your project and get support after launch.' },
    ],
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Simple starting prices',
    subtitle: 'Final pricing depends on your requirements. You always receive a quotation before paying anything.',
    showAddons: true,
    showPromotions: true,
    note: 'Prices are starting estimates in Philippine pesos. Third-party costs such as domains, hosting and app store fees are not included unless stated.',
    button: btn('Get an estimate', '/start-a-project'),
  },
  testimonials: {
    eyebrow: 'Testimonials',
    title: 'What clients say',
    subtitle: '',
    emptyText: 'Client stories will appear here as projects are completed. Yours could be the first.',
    items: [],
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Frequently asked questions',
    subtitle: '',
    items: [
      { id: 'f1', question: 'How much does a project cost?', answer: 'Each service has a starting price shown on our Pricing page. The final amount depends on the features you need. We send a written quotation for your approval before any payment is made.' },
      { id: 'f2', question: 'How do I pay?', answer: 'We accept GCash, Maya and bank transfer. After paying, upload your proof of payment on the Payment page. Payments are confirmed manually by our team — you will see the status change on your tracking page.' },
      { id: 'f3', question: 'How long does a project take?', answer: 'Simple websites usually take one to two weeks. Systems and mobile apps take longer depending on complexity. Your quotation includes an estimated timeline.' },
      { id: 'f4', question: 'Do I need to pay everything upfront?', answer: 'No. Projects normally start with a deposit, with the remaining balance due before final handover. The exact terms are stated in your quotation.' },
      { id: 'f5', question: 'Can I request changes during development?', answer: 'Yes. Revisions within the agreed scope are included. Larger changes or new features may be quoted separately.' },
      { id: 'f6', question: 'How do I track my order?', answer: 'After ordering you receive a private tracking link. Keep it safe — it shows your order status, milestones, payments and documents.' },
    ],
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Let’s talk about your project',
    subtitle: 'Send us a message and we will get back to you as soon as we can.',
    showForm: true,
    showDetails: true,
  },
  cta: {
    title: 'Ready to build something great?',
    text: 'Tell us what you have in mind and get a free estimate.',
    primaryButton: btn('Start a Project', '/start-a-project'),
    secondaryButton: btn('Contact us', '/contact', 'secondary'),
  },
  richText: { title: '', blocks: [{ id: 'r1', heading: 'Heading', body: 'Write your content here.' }] },
  imageText: {
    eyebrow: '',
    title: 'Section title',
    subtitle: '',
    text: 'Describe this section.',
    imageUrl: '',
    imageAlt: '',
    imageSide: 'right',
    button: btn('Learn more', '/services', 'secondary', false),
  },
  orderForm: {},
  trackOrder: {},
  payment: {},
};

let counter = 0;
export function newId(prefix = 's'): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function makeSection<T extends SectionType>(
  type: T,
  id: string,
  props: Partial<SectionProps<T>> = {},
  style: Partial<SectionStyle> = {},
): Section {
  return {
    id, type, visible: true,
    style: { ...DEFAULT_SECTION_STYLE, ...style },
    props: { ...structuredClone(DEFAULT_SECTION_PROPS[type]), ...props },
  } as Section;
}

const header = (id: string, eyebrow: string, title: string, subtitle: string) =>
  makeSection('pageHeader', id, { eyebrow, title, subtitle }, { paddingY: 'md', animation: 'assemble' });

const PRIVACY_BLOCKS = [
  { id: 'pp1', heading: 'Who we are', body: 'DevMart is a Philippines-based provider of custom websites, mobile applications, booking systems and business software. This policy explains how we collect, use and protect your personal information in line with the Data Privacy Act of 2012 (Republic Act No. 10173).' },
  { id: 'pp2', heading: 'Information we collect', body: 'When you start a project or contact us we collect your full name, email address, mobile number, Facebook profile link or contact name, and the project details you provide. When you pay, we collect the payment reference number and the proof of payment you upload. We never ask for your Facebook password or any account password.' },
  { id: 'pp3', heading: 'How we use your information', body: 'We use your information to review your request, contact you about your order, prepare quotations and agreements, verify payments, deliver your project and provide support. We do not sell your personal information.' },
  { id: 'pp4', heading: 'Storage and security', body: 'Order records are stored in a secured database with strict access controls. Payment proofs and documents are kept in private storage and are only accessible to authorised DevMart staff and to you through your private tracking link.' },
  { id: 'pp5', heading: 'Sharing', body: 'We only share information with service providers that help us operate (for example hosting, database and email delivery providers) and when required by law.' },
  { id: 'pp6', heading: 'Retention', body: 'We keep order and payment records for as long as needed to deliver your project and to meet legal, accounting and tax obligations. You may ask us to delete information that we are not required to keep.' },
  { id: 'pp7', heading: 'Your rights', body: 'You have the right to be informed, to access, to correct, to object, and to request erasure or blocking of your personal data, as provided by the Data Privacy Act. Contact us using the details on our Contact page to exercise these rights.' },
  { id: 'pp8', heading: 'Updates to this policy', body: 'We may update this policy from time to time. The latest version is always available on this page.' },
];

const TERMS_BLOCKS = [
  { id: 'tc1', heading: 'Scope', body: 'These terms apply to all projects ordered through DevMart. A project-specific quotation or service agreement, once accepted, forms part of these terms.' },
  { id: 'tc2', heading: 'Orders and quotations', body: 'Submitting the Start a Project form is a request for a quotation, not a binding contract. Prices shown on the website are starting estimates. The final price, scope and timeline are stated in your quotation.' },
  { id: 'tc3', heading: 'Payments', body: 'Work begins once the agreed deposit is verified. Payments are made through the payment methods listed on our Payment page and are confirmed manually by DevMart. An uploaded proof of payment is not a confirmation of payment until it has been verified. Official receipts are issued only for verified payments.' },
  { id: 'tc4', heading: 'Revisions', body: 'Revisions within the agreed scope are included as stated in your quotation. Requests outside the agreed scope may require a separate quotation.' },
  { id: 'tc5', heading: 'Client responsibilities', body: 'You agree to provide accurate information, the content needed for the project (such as text, images and logos) and timely feedback. Delays in providing these may move the delivery date.' },
  { id: 'tc6', heading: 'Third-party costs', body: 'Unless stated in your quotation, third-party costs such as domain names, hosting plans, paid plugins, SMS credits and app store developer fees are not included.' },
  { id: 'tc7', heading: 'Ownership', body: 'Upon full payment, you own the final deliverables created specifically for your project. DevMart may reuse general-purpose code, tools and know-how, and may show the finished work in its portfolio unless you ask us not to.' },
  { id: 'tc8', heading: 'Cancellations and refunds', body: 'You may cancel a project at any time. Refunds, if any, depend on the work already completed and are handled as stated in your quotation or service agreement.' },
  { id: 'tc9', heading: 'Liability', body: 'DevMart delivers projects with reasonable skill and care. To the extent allowed by law, DevMart is not liable for indirect or consequential losses arising from the use of delivered work.' },
  { id: 'tc10', heading: 'Governing law', body: 'These terms are governed by the laws of the Republic of the Philippines.' },
];

const PAGES: Record<PageSlug, Page> = {
  home: {
    title: 'Home',
    sections: [
      makeSection('hero', 'home-hero', {}, { paddingY: 'md', animation: 'assemble' }),
      makeSection('services', 'home-services'),
      makeSection('portfolio', 'home-portfolio'),
      makeSection('benefits', 'home-benefits'),
      makeSection('process', 'home-process'),
      makeSection('pricing', 'home-pricing', { showAddons: false }),
      makeSection('testimonials', 'home-testimonials'),
      makeSection('faq', 'home-faq', {}, { width: 'narrow' }),
      makeSection('contact', 'home-contact'),
    ],
  },
  services: {
    title: 'Services',
    sections: [
      header('services-header', 'Services', 'What we build', 'Websites, systems and mobile apps designed around how your business actually works.'),
      makeSection('services', 'services-grid', { eyebrow: '', title: '', subtitle: '', limit: 0, button: btn('', '', 'secondary', false) }, { paddingY: 'sm' }),
      makeSection('process', 'services-process'),
      makeSection('cta', 'services-cta'),
    ],
  },
  pricing: {
    title: 'Pricing',
    sections: [
      header('pricing-header', 'Pricing', 'Clear starting prices', 'No hidden fees. You get a written quotation before you pay anything.'),
      makeSection('pricing', 'pricing-table', { eyebrow: '', title: '', subtitle: '' }, { paddingY: 'sm' }),
      makeSection('faq', 'pricing-faq', {}, { width: 'narrow' }),
      makeSection('cta', 'pricing-cta'),
    ],
  },
  portfolio: {
    title: 'Portfolio',
    sections: [
      header('portfolio-header', 'Portfolio', 'Our work', 'Projects and concept builds that show what we can create for you.'),
      makeSection('portfolio', 'portfolio-grid', { eyebrow: '', title: '', subtitle: '', featuredOnly: false, limit: 0, button: btn('', '', 'secondary', false) }, { paddingY: 'sm' }),
      makeSection('cta', 'portfolio-cta'),
    ],
  },
  about: {
    title: 'About DevMart',
    sections: [
      header('about-header', 'About DevMart', 'Technology that feels within reach', 'We believe every Filipino business deserves software that looks great and works well.'),
      makeSection('imageText', 'about-story', {
        eyebrow: 'Our story',
        title: 'Built for small businesses and big ideas',
        text: 'DevMart is a Philippines-based studio that designs and develops custom websites, mobile applications, booking systems and business software.\n\nWe focus on clear pricing, direct communication and careful craftsmanship — so you get a product you are proud to show your customers, at a price that makes sense.',
        imageSide: 'right',
      }),
      makeSection('benefits', 'about-benefits'),
      makeSection('cta', 'about-cta'),
    ],
  },
  'start-a-project': {
    title: 'Start a Project',
    sections: [
      header('order-header', 'Start a Project', 'Tell us what you want to build', 'Answer a few questions and get an estimate. No payment is needed to submit a request.'),
      makeSection('orderForm', 'order-form', {}, { paddingY: 'sm', animation: 'none' }),
    ],
  },
  'track-order': {
    title: 'Track Order',
    sections: [
      header('track-header', 'Track Order', 'Follow your project', 'Open your private tracking link to see your order status, milestones, payments and documents.'),
      makeSection('trackOrder', 'track-order', {}, { paddingY: 'sm', animation: 'none' }),
    ],
  },
  payment: {
    title: 'Payment',
    sections: [
      header('payment-header', 'Payment', 'Send your payment', 'Pay through any of the methods below, then upload your proof of payment for verification.'),
      makeSection('payment', 'payment-flow', {}, { paddingY: 'sm', animation: 'none' }),
    ],
  },
  faq: {
    title: 'FAQ',
    sections: [
      header('faq-header', 'FAQ', 'Questions, answered', 'Everything you need to know before starting a project with us.'),
      makeSection('faq', 'faq-list', { eyebrow: '', title: '', subtitle: '' }, { paddingY: 'sm', width: 'narrow' }),
      makeSection('cta', 'faq-cta', { title: 'Still have questions?', text: 'Send us a message and we will help you out.', primaryButton: btn('Contact us', '/contact') , secondaryButton: btn('', '', 'secondary', false) }, {}),
    ],
  },
  contact: {
    title: 'Contact',
    sections: [
      header('contact-header', 'Contact', 'Get in touch', 'Questions, ideas or a project in mind? We would love to hear from you.'),
      makeSection('contact', 'contact-form', { eyebrow: '', title: '', subtitle: '' }, { paddingY: 'sm' }),
    ],
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    sections: [
      header('privacy-header', 'Legal', 'Privacy Policy', 'How DevMart collects, uses and protects your personal information.'),
      makeSection('richText', 'privacy-body', { title: '', blocks: PRIVACY_BLOCKS }, { paddingY: 'sm', align: 'left', width: 'narrow', animation: 'fade' }),
    ],
  },
  'terms-and-conditions': {
    title: 'Terms and Conditions',
    sections: [
      header('terms-header', 'Legal', 'Terms and Conditions', 'The terms that apply when you work with DevMart.'),
      makeSection('richText', 'terms-body', { title: '', blocks: TERMS_BLOCKS }, { paddingY: 'sm', align: 'left', width: 'narrow', animation: 'fade' }),
    ],
  },
};

const THEME_BASE = {
  labels: { mono: true, numbered: true, rules: true },
  fonts: { heading: 'system', body: 'system' },
  scale: { base: 16, heading: 1 },
  radius: { card: 18, button: 10 },
} as const;

/** Default look: white background, dark text, high contrast. */
export const LIGHT_THEME: SiteDoc['theme'] = {
  ...THEME_BASE,
  mode: 'light',
  colors: { background: '#ffffff', surface: '#ffffff', text: '#0b1020', muted: '#4b5565', accent: '#1f4fd8', accent2: '#64748b' },
  gradient: { from: '#0b1020', via: '#1f4fd8', to: '#3b82f6', angle: 100, animated: true },
  background: { style: 'spotlight', intensity: 30, animated: true },
  glass: { opacity: 0, blur: 20, border: 14, saturation: 140 },
  shadow: { intensity: 18 },
};

/** Optional dark look (Theme → Appearance in the studio). */
export const DARK_THEME: SiteDoc['theme'] = {
  ...THEME_BASE,
  mode: 'dark',
  colors: { background: '#000000', surface: '#0a0c11', text: '#f5f7fa', muted: '#9aa4b2', accent: '#2f6bff', accent2: '#c7d2e3' },
  gradient: { from: '#ffffff', via: '#9cc9ff', to: '#2f6bff', angle: 100, animated: true },
  background: { style: 'spotlight', intensity: 35, animated: true },
  glass: { opacity: 6, blur: 24, border: 12, saturation: 160 },
  shadow: { intensity: 55 },
};

export const DEFAULT_SITE: SiteDoc = {
  theme: LIGHT_THEME,
  brand: {
    name: 'DevMart',
    tagline: 'Your ideas. Beautifully built.',
    description:
      'Affordable custom websites, mobile applications, booking systems and business software — made in the Philippines.',
    logoUrl: '',
    logoHeight: 28,
    showName: true,
    faviconUrl: '',
    contact: { email: '', phone: '', facebookUrl: '', address: 'Philippines', hours: 'Monday – Saturday, 9:00 AM – 6:00 PM (PHT)' },
  },
  navigation: {
    items: [
      { id: 'n1', label: 'Services', href: '/services' },
      { id: 'n2', label: 'Pricing', href: '/pricing' },
      { id: 'n3', label: 'Portfolio', href: '/portfolio' },
      { id: 'n4', label: 'About', href: '/about' },
      { id: 'n5', label: 'Track Order', href: '/track-order' },
      { id: 'n6', label: 'Contact', href: '/contact' },
    ],
    align: 'center',
    style: 'floating',
    sticky: true,
    cta: btn('Start a Project', '/start-a-project'),
    mobile: { style: 'sheet', showCta: true },
  },
  footer: {
    text: 'Affordable custom websites, mobile apps and business software for Filipino businesses.',
    columns: [
      {
        id: 'fc1', title: 'Company',
        links: [
          { id: 'fl1', label: 'About DevMart', href: '/about' },
          { id: 'fl2', label: 'Services', href: '/services' },
          { id: 'fl3', label: 'Portfolio', href: '/portfolio' },
          { id: 'fl4', label: 'Pricing', href: '/pricing' },
        ],
      },
      {
        id: 'fc2', title: 'Customers',
        links: [
          { id: 'fl5', label: 'Start a Project', href: '/start-a-project' },
          { id: 'fl6', label: 'Track Order', href: '/track-order' },
          { id: 'fl7', label: 'Payment', href: '/payment' },
          { id: 'fl8', label: 'FAQ', href: '/faq' },
        ],
      },
      {
        id: 'fc3', title: 'Legal',
        links: [
          { id: 'fl9', label: 'Privacy Policy', href: '/privacy-policy' },
          { id: 'fl10', label: 'Terms and Conditions', href: '/terms-and-conditions' },
          { id: 'fl11', label: 'Contact', href: '/contact' },
        ],
      },
    ],
    copyright: '© {year} DevMart. All rights reserved.',
    showContact: true,
  },
  buttons: { size: 'md', style: 'white', hover: 'lift', animation: 'none', uppercase: false },
  forms: {
    order: {
      stepLabels: ['Service', 'Requirements', 'Your details', 'Review', 'Done'],
      serviceHeading: 'What would you like us to build?',
      serviceHelp: 'Choose one service. You can add optional extras below.',
      addonsHeading: 'Optional add-ons',
      packageHeading: 'Choose a package',
      promoLabel: 'Promo or referral code (optional)',
      requirementsHeading: 'Tell us about your project',
      requirementsHelp: 'The more detail you share, the more accurate your quotation will be.',
      customerHeading: 'How can we reach you?',
      contactNotice:
        'DevMart uses your email, mobile number and Facebook contact only to reach you about this order — for questions, quotations and updates. We will never ask for your Facebook password.',
      consentLabel: 'I agree to the Privacy Policy and allow DevMart to contact me about this order.',
      reviewHeading: 'Review your order',
      estimateNote:
        'This is an estimate based on starting prices. Your final price will be confirmed in a written quotation after we review your requirements.',
      submitLabel: 'Submit order',
      labels: {
        projectName: 'Project name', projectDescription: 'Project description', features: 'Requested features',
        preferredDesign: 'Preferred design or style', referenceWebsites: 'Reference websites or apps',
        deadline: 'Target deadline', budget: 'Budget range', notes: 'Additional notes',
        fullName: 'Full name', email: 'Email address', phone: 'Personal mobile number',
        facebook: 'Facebook profile link or name',
      },
      confirmationTitle: 'Order received!',
      confirmationMessage:
        'Thank you. Your order is now pending review. We will contact you through your email, mobile number or Facebook. Save your tracking link below — it is the secure way to follow your order.',
    },
    payment: {
      intro: 'Choose a payment method, pay the amount stated in your quotation, then upload your proof of payment. Our team verifies every payment manually.',
      proofHelp: 'Upload a clear screenshot or photo of your payment confirmation (JPG, PNG or PDF, up to 4 MB).',
      successTitle: 'Payment proof submitted',
      successMessage: 'Thank you. Your payment is now waiting for verification. Uploading a proof does not confirm the payment yet — you will see the status change on your tracking page once we have checked it.',
    },
    track: {
      intro: 'For your privacy, order details can only be opened with your private tracking link.',
      requestHelp: 'Lost your link? Enter your order reference and the email you used. If they match, we will send you a new link.',
    },
    contact: { submitLabel: 'Send message', successMessage: 'Thanks for reaching out. We will get back to you soon.' },
  },
  pages: PAGES,
};

export function defaultPage(slug: PageSlug): Page {
  return structuredClone(DEFAULT_SITE.pages[slug]);
}
