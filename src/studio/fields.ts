// Declarative description of every editable property. The inspector UI is generated from
// these descriptors, and every value is still validated by the zod schemas before saving.
import { FONT_OPTIONS, ICON_NAMES, PAGE_PATHS, type SectionType } from '@shared/site/schema';
import { newId } from '@shared/site/defaults';

export interface F {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'bool' | 'select' | 'range' | 'color' | 'image' | 'href' | 'button' | 'list' | 'strings' | 'group';
  options?: { value: string | number; label: string }[];
  min?: number; max?: number; step?: number; unit?: string;
  fields?: F[];
  itemLabel?: string;       // key used as the collapsed title of a list item
  itemName?: string;        // "question", "step"…
  newItem?: () => Record<string, unknown>;
  maxItems?: number;
  hint?: string;
  rows?: number;
  allowEmptyColor?: boolean;
  mediaKind?: 'image' | 'logo';
}

const opt = (...values: (string | number)[]) => values.map((v) => ({ value: v, label: String(v).replace(/^./, (c) => c.toUpperCase()) }));
const heading: F[] = [
  { key: 'eyebrow', label: 'Small label above title', type: 'text' },
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'subtitle', label: 'Subtitle', type: 'textarea', rows: 2 },
];
const button = (key: string, label: string): F => ({ key, label, type: 'button' });
const columns = (...n: number[]): F => ({ key: 'columns', label: 'Columns', type: 'select', options: n.map((v) => ({ value: v, label: `${v} columns` })) });
const iconOptions = ICON_NAMES.map((i) => ({ value: i, label: i }));

export const PAGE_LINK_OPTIONS = Object.entries(PAGE_PATHS).map(([slug, path]) => ({ value: path, label: slug }));

export const SECTION_FIELDS: Record<SectionType, F[]> = {
  hero: [
    { key: 'eyebrow', label: 'Badge text', type: 'text' },
    { key: 'headline', label: 'Headline', type: 'textarea', rows: 2 },
    { key: 'gradientHeadline', label: 'Gradient headline', type: 'bool' },
    { key: 'twoTone', label: 'Two-tone headline', type: 'bool', hint: 'First sentence bright, the rest muted.' },
    { key: 'showCursors', label: 'Floating cursors', type: 'bool' },
    { key: 'subtitle', label: 'Subtitle', type: 'textarea', rows: 3 },
    button('primaryButton', 'Primary button'),
    button('secondaryButton', 'Secondary button'),
    { key: 'chips', label: 'Highlights under the buttons', type: 'strings', maxItems: 8 },
    { key: 'visual', label: 'Hero visual', type: 'select', options: [{ value: 'sculpture', label: '3D glass sculpture' }, { value: 'devices', label: 'Floating devices' }, { value: 'orb', label: 'Glass orb' }, { value: 'image', label: 'Your image' }, { value: 'none', label: 'None' }] },
    { key: 'imageUrl', label: 'Hero image', type: 'image', hint: 'Used when "Your image" is selected.' },
    { key: 'imageAlt', label: 'Image description', type: 'text' },
    { key: 'backgroundImageUrl', label: 'Background image', type: 'image' },
    { key: 'height', label: 'Section height', type: 'select', options: [{ value: 'auto', label: 'Fit content' }, { value: 'tall', label: 'Tall' }, { value: 'screen', label: 'Full screen' }] },
  ],
  pageHeader: heading,
  services: [
    ...heading,
    { key: 'limit', label: 'How many services to show (0 = all)', type: 'range', min: 0, max: 24, step: 1 },
    columns(2, 3),
    { key: 'showPrices', label: 'Show starting prices', type: 'bool' },
    { key: 'showFeatures', label: 'Show feature lists', type: 'bool' },
    button('button', 'Button under the list'),
  ],
  portfolio: [
    ...heading,
    { key: 'featuredOnly', label: 'Featured projects only', type: 'bool' },
    { key: 'limit', label: 'How many projects to show (0 = all)', type: 'range', min: 0, max: 24, step: 1 },
    columns(2, 3),
    button('button', 'Button under the list'),
  ],
  benefits: [
    ...heading, columns(2, 3, 4),
    {
      key: 'items', label: 'Benefits', type: 'list', itemLabel: 'title', itemName: 'benefit', maxItems: 12,
      newItem: () => ({ id: newId('b'), icon: 'Sparkles', title: 'New benefit', text: 'Describe this benefit.' }),
      fields: [{ key: 'icon', label: 'Icon', type: 'select', options: iconOptions }, { key: 'title', label: 'Title', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea', rows: 2 }],
    },
  ],
  process: [
    ...heading,
    {
      key: 'items', label: 'Steps', type: 'list', itemLabel: 'title', itemName: 'step', maxItems: 8,
      newItem: () => ({ id: newId('p'), title: 'New step', text: 'Describe this step.' }),
      fields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea', rows: 2 }],
    },
  ],
  pricing: [
    ...heading,
    { key: 'showAddons', label: 'Show add-on prices', type: 'bool' },
    { key: 'showPromotions', label: 'Show advertised discounts', type: 'bool', hint: 'Displays promotions marked "Advertise on the Pricing page".' },
    { key: 'note', label: 'Pricing note', type: 'textarea', rows: 3 },
    button('button', 'Button'),
  ],
  testimonials: [
    ...heading,
    { key: 'emptyText', label: 'Text shown when there are no testimonials', type: 'textarea', rows: 2 },
    {
      key: 'items', label: 'Testimonials', type: 'list', itemLabel: 'name', itemName: 'testimonial', maxItems: 12,
      hint: 'Only add real feedback from real clients.',
      newItem: () => ({ id: newId('t'), quote: '', name: 'Client name', role: '' }),
      fields: [{ key: 'quote', label: 'Quote', type: 'textarea', rows: 3 }, { key: 'name', label: 'Name', type: 'text' }, { key: 'role', label: 'Role / business', type: 'text' }],
    },
  ],
  faq: [
    ...heading,
    {
      key: 'items', label: 'Questions', type: 'list', itemLabel: 'question', itemName: 'question', maxItems: 30,
      newItem: () => ({ id: newId('f'), question: 'New question', answer: 'Write the answer here.' }),
      fields: [{ key: 'question', label: 'Question', type: 'text' }, { key: 'answer', label: 'Answer', type: 'textarea', rows: 4 }],
    },
  ],
  contact: [...heading, { key: 'showForm', label: 'Show contact form', type: 'bool' }, { key: 'showDetails', label: 'Show contact details', type: 'bool', hint: 'Details come from Brand → Contact.' }],
  cta: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea', rows: 2 }, button('primaryButton', 'Primary button'), button('secondaryButton', 'Secondary button')],
  richText: [
    { key: 'title', label: 'Title', type: 'text' },
    {
      key: 'blocks', label: 'Text blocks', type: 'list', itemLabel: 'heading', itemName: 'block', maxItems: 40,
      newItem: () => ({ id: newId('r'), heading: 'Heading', body: 'Write your content here.' }),
      fields: [{ key: 'heading', label: 'Heading', type: 'text' }, { key: 'body', label: 'Body', type: 'textarea', rows: 6 }],
    },
  ],
  imageText: [
    ...heading,
    { key: 'text', label: 'Body text', type: 'textarea', rows: 6 },
    { key: 'imageUrl', label: 'Image', type: 'image' },
    { key: 'imageAlt', label: 'Image description', type: 'text' },
    { key: 'imageSide', label: 'Image position', type: 'select', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    button('button', 'Button'),
  ],
  orderForm: [], trackOrder: [], payment: [],
};

export const STYLE_FIELDS: F[] = [
  { key: 'align', label: 'Alignment', type: 'select', options: [{ value: 'center', label: 'Centered' }, { value: 'left', label: 'Left' }] },
  { key: 'paddingY', label: 'Vertical spacing', type: 'select', options: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large' }] },
  { key: 'width', label: 'Content width', type: 'select', options: [{ value: 'narrow', label: 'Narrow' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }] },
  { key: 'background', label: 'Section background', type: 'select', options: [{ value: 'none', label: 'Transparent' }, { value: 'glass', label: 'Glass panel' }, { value: 'tint', label: 'Colour tint' }, { value: 'glow', label: 'Glow' }] },
  { key: 'animation', label: 'Entrance animation', type: 'select', options: [{ value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' }, { value: 'rise', label: 'Rise' }, { value: 'scale', label: 'Scale' }, { value: 'blur', label: 'Blur in' }, { value: 'assemble', label: 'Arrow builder (cursors draw each part)' }] },
  { key: 'accent', label: 'Accent colour for this section', type: 'color', allowEmptyColor: true, hint: 'Leave empty to use the brand accent.' },
];

const fontOptions = Object.entries(FONT_OPTIONS).map(([value, f]) => ({ value, label: f.label }));
const group = (key: string, label: string, fields: F[]): F => ({ key, label, type: 'group', fields });

export const THEME_FIELDS: F[] = [
  group('motion', 'Arrow builder animation', [
    { key: 'build', label: 'Build every part with cursors', type: 'bool', hint: 'Cursors fly in and drag out the box of each heading, button, card, image and stat as visitors scroll. Switched off automatically for visitors who prefer reduced motion.' },
    { key: 'speed', label: 'Build speed', type: 'range', min: 0.5, max: 3, step: 0.25, unit: '×' },
    { key: 'pill', label: 'Show the builder bar', type: 'bool', hint: 'Agents and layers counter with Replay, Tour and speed controls.' },
  ]),
  { key: 'mode', label: 'Appearance', type: 'select', options: [{ value: 'light', label: 'Light (dark text on light backgrounds)' }, { value: 'dark', label: 'Dark (light text on dark backgrounds)' }], hint: 'Tells buttons, panels and status colours which way to contrast. Use a preset below to switch everything at once.' },
  group('colors', 'Colours', [
    { key: 'accent', label: 'Accent (buttons, links, highlights)', type: 'color' },
    { key: 'accent2', label: 'Secondary light', type: 'color' },
    { key: 'background', label: 'Page background', type: 'color' },
    { key: 'surface', label: 'Glass surface tint', type: 'color' },
    { key: 'text', label: 'Text', type: 'color' },
    { key: 'muted', label: 'Muted text', type: 'color' },
  ]),
  group('gradient', 'Heading gradient', [
    { key: 'from', label: 'Start', type: 'color' }, { key: 'via', label: 'Middle', type: 'color' }, { key: 'to', label: 'End', type: 'color' },
    { key: 'angle', label: 'Angle', type: 'range', min: 0, max: 360, step: 5, unit: '°' },
    { key: 'animated', label: 'Animate gradient', type: 'bool' },
  ]),
  group('labels', 'Section labels & rules', [
    { key: 'mono', label: 'Monospace labels', type: 'bool' },
    { key: 'numbered', label: 'Number the sections', type: 'bool' },
    { key: 'rules', label: 'Thin accent lines between sections', type: 'bool' },
  ]),
  group('background', 'Background', [
    { key: 'style', label: 'Style', type: 'select', options: [{ value: 'aurora', label: 'Aurora glow' }, { value: 'mesh', label: 'Mesh glow' }, { value: 'grid', label: 'Grid' }, { value: 'spotlight', label: 'Spotlight' }, { value: 'solid', label: 'Solid colour' }] },
    { key: 'intensity', label: 'Light intensity', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'animated', label: 'Animate background', type: 'bool', hint: 'Automatically paused for visitors who prefer reduced motion.' },
  ]),
  group('fonts', 'Fonts', [{ key: 'heading', label: 'Heading font', type: 'select', options: fontOptions }, { key: 'body', label: 'Body font', type: 'select', options: fontOptions }]),
  group('scale', 'Text sizes', [
    { key: 'base', label: 'Body text size', type: 'range', min: 14, max: 20, step: 1, unit: 'px' },
    { key: 'heading', label: 'Heading scale', type: 'range', min: 0.7, max: 1.4, step: 0.05, unit: '×' },
  ]),
  group('glass', 'Liquid glass', [
    { key: 'opacity', label: 'Glass opacity', type: 'range', min: 0, max: 40, step: 1, unit: '%' },
    { key: 'blur', label: 'Blur intensity', type: 'range', min: 0, max: 60, step: 2, unit: 'px' },
    { key: 'border', label: 'Edge highlight', type: 'range', min: 0, max: 40, step: 1, unit: '%' },
    { key: 'saturation', label: 'Saturation', type: 'range', min: 100, max: 220, step: 10, unit: '%' },
  ]),
  group('radius', 'Border radius', [
    { key: 'card', label: 'Cards & panels', type: 'range', min: 0, max: 48, step: 2, unit: 'px' },
    { key: 'button', label: 'Buttons (999 = pill)', type: 'range', min: 0, max: 999, step: 1, unit: 'px' },
  ]),
  group('shadow', 'Shadows', [{ key: 'intensity', label: 'Shadow strength', type: 'range', min: 0, max: 100, step: 5, unit: '%' }]),
];

export const BRAND_FIELDS: F[] = [
  { key: 'name', label: 'Business name', type: 'text' },
  { key: 'tagline', label: 'Tagline', type: 'text' },
  { key: 'description', label: 'Brand description', type: 'textarea', rows: 3 },
  { key: 'logoUrl', label: 'Logo', type: 'image', mediaKind: 'logo', hint: 'Leave empty to use the monogram.' },
  { key: 'logoHeight', label: 'Logo height', type: 'range', min: 16, max: 72, step: 2, unit: 'px' },
  { key: 'showName', label: 'Show business name next to the logo', type: 'bool' },
  { key: 'faviconUrl', label: 'Favicon (browser tab icon)', type: 'image', mediaKind: 'logo' },
  group('contact', 'Contact details', [
    { key: 'email', label: 'Email', type: 'text' }, { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'facebookUrl', label: 'Facebook page link', type: 'href' }, { key: 'address', label: 'Address', type: 'text' },
    { key: 'hours', label: 'Business hours', type: 'text' },
  ]),
];

export const NAV_FIELDS: F[] = [
  {
    key: 'items', label: 'Menu links', type: 'list', itemLabel: 'label', itemName: 'link', maxItems: 10,
    newItem: () => ({ id: newId('n'), label: 'New link', href: '/' }),
    fields: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'href', label: 'Destination', type: 'href' }],
  },
  { key: 'style', label: 'Header appearance', type: 'select', options: [{ value: 'floating', label: 'Floating glass pill' }, { value: 'bar', label: 'Full-width bar' }] },
  { key: 'align', label: 'Menu alignment', type: 'select', options: opt('left', 'center', 'right') },
  { key: 'sticky', label: 'Stay visible while scrolling', type: 'bool' },
  button('cta', 'Header button'),
  group('mobile', 'Mobile navigation', [
    { key: 'style', label: 'Menu style', type: 'select', options: [{ value: 'sheet', label: 'Dropdown sheet' }, { value: 'fullscreen', label: 'Full screen' }] },
    { key: 'showCta', label: 'Show the header button in the menu', type: 'bool' },
  ]),
];

export const FOOTER_FIELDS: F[] = [
  { key: 'text', label: 'Footer text', type: 'textarea', rows: 2 },
  { key: 'showContact', label: 'Show contact details', type: 'bool' },
  {
    key: 'columns', label: 'Link columns', type: 'list', itemLabel: 'title', itemName: 'column', maxItems: 4,
    newItem: () => ({ id: newId('fc'), title: 'New column', links: [] }),
    fields: [
      { key: 'title', label: 'Column title', type: 'text' },
      {
        key: 'links', label: 'Links', type: 'list', itemLabel: 'label', itemName: 'link', maxItems: 10,
        newItem: () => ({ id: newId('fl'), label: 'New link', href: '/' }),
        fields: [{ key: 'label', label: 'Label', type: 'text' }, { key: 'href', label: 'Destination', type: 'href' }],
      },
    ],
  },
  { key: 'copyright', label: 'Copyright line', type: 'text', hint: '{year} is replaced with the current year.' },
];

export const BUTTONS_FIELDS: F[] = [
  { key: 'size', label: 'Default size', type: 'select', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
  { key: 'style', label: 'Primary button style', type: 'select', options: [{ value: 'white', label: 'White' }, { value: 'gradient', label: 'Gradient' }, { value: 'solid', label: 'Solid' }, { value: 'glass', label: 'Glass' }] },
  { key: 'hover', label: 'Hover effect', type: 'select', options: [{ value: 'glow', label: 'Glow' }, { value: 'lift', label: 'Lift' }, { value: 'scale', label: 'Scale' }, { value: 'none', label: 'None' }] },
  { key: 'animation', label: 'Animation', type: 'select', options: [{ value: 'none', label: 'None' }, { value: 'shine', label: 'Shine sweep' }, { value: 'pulse', label: 'Pulse' }] },
  { key: 'uppercase', label: 'Uppercase labels', type: 'bool' },
];

const t = (key: string, label: string, rows?: number): F => ({ key, label, type: rows ? 'textarea' : 'text', rows });
export const FORMS_FIELDS: F[] = [
  group('order', 'Order form', [
    { key: 'stepLabels', label: 'Step names (5)', type: 'strings', maxItems: 5, hint: 'Keep exactly five steps.' },
    t('serviceHeading', 'Step 1 heading'), t('serviceHelp', 'Step 1 instructions', 2), t('packageHeading', 'Packages heading'), t('addonsHeading', 'Add-ons heading'), t('promoLabel', 'Promo code label'),
    t('requirementsHeading', 'Step 2 heading'), t('requirementsHelp', 'Step 2 instructions', 2),
    t('customerHeading', 'Step 3 heading'), t('contactNotice', 'Why we ask for contact details', 4), t('consentLabel', 'Privacy consent checkbox', 2),
    t('reviewHeading', 'Step 4 heading'), t('estimateNote', 'Estimate disclaimer', 3), t('submitLabel', 'Submit button'),
    group('labels', 'Field labels', [
      t('projectName', 'Project name'), t('projectDescription', 'Project description'), t('features', 'Requested features'), t('preferredDesign', 'Preferred design'),
      t('referenceWebsites', 'Reference websites'), t('deadline', 'Target deadline'), t('budget', 'Budget range'), t('notes', 'Additional notes'),
      t('fullName', 'Full name'), t('email', 'Email'), t('phone', 'Mobile number'), t('facebook', 'Facebook contact'),
    ]),
    t('confirmationTitle', 'Confirmation title'), t('confirmationMessage', 'Confirmation message', 4),
  ]),
  group('payment', 'Payment page', [t('intro', 'Introduction', 3), t('proofHelp', 'Upload instructions', 2), t('successTitle', 'Success title'), t('successMessage', 'Success message', 4)]),
  group('track', 'Track order page', [t('intro', 'Introduction', 2), t('requestHelp', 'New link instructions', 3)]),
  group('contact', 'Contact form', [t('submitLabel', 'Submit button'), t('successMessage', 'Success message', 2)]),
];
