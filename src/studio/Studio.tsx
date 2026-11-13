// Branding Studio / Website Editor.
// Desktop: editor on the left, live preview on the right, adjustable divider.
// Mobile: separate Editor and Preview tabs.
// Drafts are private; nothing reaches visitors until "Publish".
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Reorder, useDragControls } from 'motion/react';
import {
  ArrowLeft, Copy, ExternalLink, Eye, EyeOff, GripVertical, History, Lock, Monitor, Plus, Redo2, RotateCcw, Save, Smartphone, Tablet,
  Trash2, Undo2, UploadCloud,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDate } from '@shared/constants';
import { DARK_THEME, DEFAULT_SITE, LIGHT_THEME, makeSection, newId } from '@shared/site/defaults';
import { normalizeSiteDoc, validateSiteDoc } from '@shared/site/parse';
import {
  LOCKED_SECTION_TYPES, PAGE_SLUGS, SECTION_LABELS, SECTION_TYPES, type PageSlug, type Section, type SectionType,
} from '@shared/site/schema';
import { PricingPage } from '@/admin/pages/catalog';
import { errorMessage } from '@/lib/api';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { cx } from '@/lib/utils';
import { Badge, Btn, Field, Modal, Notice, PageLoader, Spinner, Tabs, useToast } from '@/ui';
import { FieldsEditor } from './FieldsEditor';
import { BRAND_FIELDS, BUTTONS_FIELDS, FOOTER_FIELDS, FORMS_FIELDS, NAV_FIELDS, SECTION_FIELDS, STYLE_FIELDS, THEME_FIELDS } from './fields';
import { PREVIEW_SOURCE, STUDIO_SOURCE } from './PreviewApp';
import { useHistory } from './store';

type Tab = 'sections' | 'brand' | 'theme' | 'navigation' | 'footer' | 'buttons' | 'forms' | 'pricing';
type Device = 'desktop' | 'tablet' | 'mobile';
const DEVICE_WIDTH: Record<Device, number> = { desktop: 1440, tablet: 820, mobile: 390 };
const TABS: { id: Tab; label: string }[] = [
  { id: 'sections', label: 'Sections' }, { id: 'brand', label: 'Brand' }, { id: 'theme', label: 'Theme' }, { id: 'navigation', label: 'Navigation' },
  { id: 'footer', label: 'Footer' }, { id: 'buttons', label: 'Buttons' }, { id: 'forms', label: 'Forms' }, { id: 'pricing', label: 'Pricing' },
];
const ADDABLE = SECTION_TYPES.filter((t) => !LOCKED_SECTION_TYPES.includes(t));
const tool = 'grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/80 hover:bg-white/10 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent';

function sectionTitle(s: Section): string {
  const p = s.props as { title?: string; headline?: string };
  return (p.headline || p.title || '').trim();
}

function SectionItem({ section, selected, onSelect, onToggle, onDuplicate, onRemove }: { section: Section; selected: boolean; onSelect: () => void; onToggle: () => void; onDuplicate: () => void; onRemove: () => void }) {
  const controls = useDragControls();
  const locked = LOCKED_SECTION_TYPES.includes(section.type);
  return (
    <Reorder.Item value={section} dragListener={false} dragControls={controls} as="li"
      className={cx('flex items-center gap-1 rounded-xl border bg-surface p-1.5', selected ? 'border-accent' : 'border-white/10', !section.visible && 'opacity-60')}>
      <button type="button" aria-label={`Drag to reorder ${SECTION_LABELS[section.type]}`} className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing" onPointerDown={(e) => controls.start(e)}><GripVertical className="h-4 w-4" /></button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 px-1 py-1 text-left">
        <span className="flex items-center gap-1.5 text-sm font-medium">{SECTION_LABELS[section.type]}{locked && <Lock className="h-3 w-3 text-muted" aria-label="Built-in section" />}</span>
        {sectionTitle(section) && <span className="block truncate text-xs text-muted">{sectionTitle(section)}</span>}
      </button>
      <button type="button" className={cx(tool, '!h-8 !w-8')} aria-label={section.visible ? 'Hide section' : 'Show section'} aria-pressed={!section.visible} onClick={onToggle}>{section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
      <button type="button" className={cx(tool, '!h-8 !w-8')} aria-label="Duplicate section" disabled={locked} onClick={onDuplicate}><Copy className="h-4 w-4" /></button>
      <button type="button" className={cx(tool, '!h-8 !w-8 hover:!text-rose-300')} aria-label="Remove section" disabled={locked} onClick={onRemove}><Trash2 className="h-4 w-4" /></button>
    </Reorder.Item>
  );
}

export default function Studio({ initialTab }: { initialTab: Tab | string }) {
  const supabase = requireSupabase();
  const qc = useQueryClient();
  const toast = useToast();
  const { state, dispatch, update } = useHistory(DEFAULT_SITE);
  const doc = state.present;

  const [slug, setSlug] = useState<PageSlug>('home');
  const [tab, setTab] = useState<Tab>((TABS.some((t) => t.id === initialTab) ? initialTab : 'sections') as Tab);
  const [selected, setSelected] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'content' | 'style'>('content');
  const [device, setDevice] = useState<Device>('desktop');
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor');
  const [panelWidth, setPanelWidth] = useState(() => Number(localStorage.getItem('devmart-studio-panel')) || 400);
  const [dragging, setDragging] = useState(false);
  const [unpublished, setUnpublished] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishLabel, setPublishLabel] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const frame = useRef<HTMLIFrameElement>(null);
  const frameReady = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 1200, h: 800 });

  // ── load draft + published ──
  const loaded = useQuery({
    queryKey: ['admin', 'studio', 'load'], staleTime: Infinity, gcTime: 0,
    queryFn: async () => {
      const [draft, published] = await Promise.all([supabase.rpc('get_site_draft'), supabase.rpc('get_published_site')]);
      const rawDraft = unwrap(draft) as { theme?: unknown; pages?: Record<string, unknown> } | null;
      const publishedDoc = normalizeSiteDoc(unwrap(published));
      // a draft that was never saved has no theme and no pages → start from what is live
      const hasDraft = !!rawDraft && (rawDraft.theme !== null && rawDraft.theme !== undefined && JSON.stringify(rawDraft.theme) !== '{}' || Object.keys(rawDraft.pages ?? {}).length > 0);
      const draftDoc = hasDraft ? normalizeSiteDoc(rawDraft) : publishedDoc;
      return { draftDoc, different: JSON.stringify(draftDoc) !== JSON.stringify(publishedDoc) };
    },
  });
  useEffect(() => {
    if (loaded.data) {
      dispatch({ type: 'reset', doc: loaded.data.draftDoc });
      setUnpublished(loaded.data.different);
    }
  }, [loaded.data, dispatch]);

  const dirty = state.present !== state.saved;
  const page = doc.pages[slug];
  const selectedSectionId = selected?.startsWith('section:') ? selected.split(':')[1] : null;
  const sectionIndex = selectedSectionId ? page.sections.findIndex((s) => s.id === selectedSectionId) : -1;
  const section = sectionIndex >= 0 ? page.sections[sectionIndex] : null;
  const focusField = selected?.startsWith('section:') ? selected.split(':')[2] : undefined;

  // ── preview bridge ──
  const send = useCallback((scroll = false) => {
    if (!frameReady.current) return;
    frame.current?.contentWindow?.postMessage({ source: STUDIO_SOURCE, type: 'state', doc, slug, selected, scroll }, window.location.origin);
  }, [doc, slug, selected]);
  const scrollNext = useRef(false);
  useEffect(() => { send(scrollNext.current); scrollNext.current = false; }, [send]);

  const select = useCallback((edit: string | null, fromPreview = false) => {
    setSelected(edit);
    if (!fromPreview) scrollNext.current = true;
    if (!edit) return;
    if (edit === 'nav') setTab('navigation');
    else if (edit === 'footer') setTab('footer');
    else if (edit.startsWith('section:')) {
      setTab('sections');
      setInspectorTab('content');
    }
    if (fromPreview) setMobileView('editor');
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const data = e.data as { source?: string; type?: string; edit?: unknown; slug?: unknown };
      if (data?.source !== PREVIEW_SOURCE) return;
      if (data.type === 'ready') { frameReady.current = true; send(); }
      if (data.type === 'select' && typeof data.edit === 'string' && /^[A-Za-z0-9:_-]{1,200}$/.test(data.edit)) select(data.edit, true);
      if (data.type === 'navigate' && PAGE_SLUGS.includes(data.slug as PageSlug)) { setSlug(data.slug as PageSlug); setSelected(null); }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [send, select]);

  // ── stage size (for scaling device previews) ──
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setStageSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded.isSuccess]);

  // ── save / publish ──
  const save = useMutation({
    mutationFn: async () => {
      const problems = validateSiteDoc(doc);
      if (problems.length) throw new Error(`Please fix: ${problems[0]}`);
      unwrap(await supabase.rpc('save_site_draft', { p_doc: doc }));
    },
    onSuccess: () => { dispatch({ type: 'saved' }); setUnpublished(true); },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });
  const publish = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      return unwrap(await supabase.rpc('publish_site', { p_label: publishLabel.trim() })) as { version_number: number };
    },
    onSuccess: async (v) => {
      setUnpublished(false); setPublishOpen(false); setPublishLabel('');
      await Promise.all([qc.invalidateQueries({ queryKey: ['site', 'published'] }), qc.invalidateQueries({ queryKey: ['admin', 'website_page_versions'] })]);
      toast(`Published as version ${v.version_number}. Your changes are now live.`);
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });
  const versions = useQuery({
    queryKey: ['admin', 'website_page_versions'], enabled: historyOpen,
    queryFn: async () => unwrap(await supabase.from('website_page_versions').select('id, version_number, label, created_at').order('version_number', { ascending: false }).limit(50)) as { id: string; version_number: number; label: string; created_at: string }[],
  });
  const restore = useMutation({
    mutationFn: async (id: string) => normalizeSiteDoc(unwrap(await supabase.rpc('restore_site_version', { p_version_id: id }))),
    onSuccess: (restored) => {
      dispatch({ type: 'replace', doc: restored }); dispatch({ type: 'saved' });
      setUnpublished(true); setHistoryOpen(false); setSelected(null);
      toast('Version loaded into your draft. Review it, then publish to make it live.');
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });

  // ── keyboard shortcuts + unsaved-changes guard ──
  const saveRef = useRef(save.mutate);
  saveRef.current = save.mutate;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); saveRef.current(); }
      else if (k === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); }
      else if (k === 'y') { e.preventDefault(); dispatch({ type: 'redo' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ── section operations ──
  const sectionsPath = useMemo(() => ['pages', slug, 'sections'], [slug]);
  const setSections = (next: Section[], key: string | null = null) => update(sectionsPath, next, key);
  const addSection = (type: SectionType) => {
    const created = makeSection(type, newId('sec'));
    const at = sectionIndex >= 0 ? sectionIndex + 1 : page.sections.length;
    setSections([...page.sections.slice(0, at), created, ...page.sections.slice(at)]);
    setAddOpen(false);
    select(`section:${created.id}`);
  };
  const duplicateSection = (s: Section) => {
    const copy = { ...structuredClone(s), id: newId('sec') } as Section;
    const i = page.sections.findIndex((x) => x.id === s.id);
    setSections([...page.sections.slice(0, i + 1), copy, ...page.sections.slice(i + 1)]);
    select(`section:${copy.id}`);
  };
  const removeSection = (s: Section) => {
    setSections(page.sections.filter((x) => x.id !== s.id));
    if (selectedSectionId === s.id) setSelected(null);
  };
  const toggleSection = (s: Section) => update([...sectionsPath, page.sections.findIndex((x) => x.id === s.id), 'visible'], !s.visible, null);

  // ── resizable divider ──
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startW = panelWidth;
    const move = (ev: PointerEvent) => setPanelWidth(Math.min(640, Math.max(300, startW + ev.clientX - startX)));
    const up = () => { setDragging(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  useEffect(() => { localStorage.setItem('devmart-studio-panel', String(panelWidth)); }, [panelWidth]);

  if (loaded.isLoading) return <PageLoader />;
  if (loaded.isError) return <div className="p-6"><Notice tone="danger" title="The studio could not load">{errorMessage(loaded.error)}</Notice></div>;

  const width = DEVICE_WIDTH[device];
  const scale = Math.min(1, (stageSize.w - (device === 'desktop' ? 0 : 32)) / width);
  const frameHeight = (stageSize.h - (device === 'desktop' ? 0 : 32)) / scale;
  const onChange = (path: (string | number)[], value: unknown) => update(path, value);

  const editorBody = (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
      {tab === 'sections' && (section ? (
        <div>
          <div className="mb-3 flex items-center gap-1">
            <button type="button" className={tool} aria-label="Back to all sections" onClick={() => setSelected(null)}><ArrowLeft className="h-4 w-4" /></button>
            <h2 className="min-w-0 flex-1 truncate font-semibold">{SECTION_LABELS[section.type]}</h2>
            <button type="button" className={tool} aria-label={section.visible ? 'Hide section' : 'Show section'} onClick={() => toggleSection(section)}>{section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
            <button type="button" className={tool} aria-label="Duplicate section" disabled={LOCKED_SECTION_TYPES.includes(section.type)} onClick={() => duplicateSection(section)}><Copy className="h-4 w-4" /></button>
            <button type="button" className={cx(tool, 'hover:!text-rose-300')} aria-label="Remove section" disabled={LOCKED_SECTION_TYPES.includes(section.type)} onClick={() => removeSection(section)}><Trash2 className="h-4 w-4" /></button>
          </div>
          {!section.visible && <Notice tone="warn" className="mb-3">This section is hidden from visitors.</Notice>}
          <Tabs className="mb-4 w-fit" value={inspectorTab} onChange={setInspectorTab} tabs={[{ id: 'content', label: 'Content' }, { id: 'style', label: 'Layout & style' }]} />
          {inspectorTab === 'content' ? (
            SECTION_FIELDS[section.type].length === 0
              ? <Notice tone="info">This is a built-in part of the website. Its wording is edited under the Forms tab; here you can change its position, spacing and visibility.</Notice>
              : <FieldsEditor key={section.id} fields={SECTION_FIELDS[section.type]} value={section.props as Record<string, unknown>} path={[...sectionsPath, sectionIndex, 'props']} onChange={onChange} focus={focusField} />
          ) : <FieldsEditor key={`${section.id}-style`} fields={STYLE_FIELDS} value={section.style as unknown as Record<string, unknown>} path={[...sectionsPath, sectionIndex, 'style']} onChange={onChange} />}
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs text-muted">Click any part of the preview to edit it. Drag the handles to reorder sections.</p>
          <Reorder.Group axis="y" as="ul" values={page.sections} onReorder={(next) => setSections(next as Section[], 'reorder')} className="space-y-1.5">
            {page.sections.map((s) => (
              <SectionItem key={s.id} section={s} selected={false} onSelect={() => select(`section:${s.id}`)} onToggle={() => toggleSection(s)} onDuplicate={() => duplicateSection(s)} onRemove={() => removeSection(s)} />
            ))}
          </Reorder.Group>
          <button type="button" onClick={() => setAddOpen(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 py-3 text-sm font-medium hover:border-accent"><Plus className="h-4 w-4" aria-hidden />Add section</button>
          <Field label="Page title (browser tab)" className="mt-5">{(p) => <input {...p} className="field field-sm" value={page.title} maxLength={80} onChange={(e) => update(['pages', slug, 'title'], e.target.value)} />}</Field>
        </div>
      ))}
      {tab === 'brand' && <FieldsEditor fields={BRAND_FIELDS} value={doc.brand as unknown as Record<string, unknown>} path={['brand']} onChange={onChange} openGroups />}
      {tab === 'theme' && (
        <div>
          <FieldsEditor fields={THEME_FIELDS} value={doc.theme as unknown as Record<string, unknown>} path={['theme']} onChange={onChange} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn size="sm" variant="secondary" onClick={() => update(['theme'], structuredClone(LIGHT_THEME), null)}><RotateCcw className="h-4 w-4" aria-hidden />Light preset</Btn>
            <Btn size="sm" variant="secondary" onClick={() => update(['theme'], structuredClone(DARK_THEME), null)}><RotateCcw className="h-4 w-4" aria-hidden />Dark preset</Btn>
          </div>
          <p className="mt-3 text-[0.7rem] text-muted">Presets replace all theme settings (undo brings them back). Keep strong contrast between text and background so everything stays easy to read.</p>
        </div>
      )}
      {tab === 'navigation' && <FieldsEditor fields={NAV_FIELDS} value={doc.navigation as unknown as Record<string, unknown>} path={['navigation']} onChange={onChange} openGroups />}
      {tab === 'footer' && <FieldsEditor fields={FOOTER_FIELDS} value={doc.footer as unknown as Record<string, unknown>} path={['footer']} onChange={onChange} />}
      {tab === 'buttons' && (
        <div>
          <FieldsEditor fields={BUTTONS_FIELDS} value={doc.buttons as unknown as Record<string, unknown>} path={['buttons']} onChange={onChange} />
          <p className="mt-4 text-[0.7rem] text-muted">Button colour follows the accent colour and button roundness follows Theme → Border radius. The text and link of each button are edited on the section that contains it.</p>
        </div>
      )}
      {tab === 'forms' && <FieldsEditor fields={FORMS_FIELDS} value={doc.forms as unknown as Record<string, unknown>} path={['forms']} onChange={onChange} />}
      {tab === 'pricing' && (
        <div className="[&_h1]:!text-lg [&_.xl\:grid-cols-2]:!grid-cols-1">
          <Notice tone="warn" className="mb-4">Prices are business data, not design: they save immediately and are not part of draft / publish. Discount banners are controlled in Discounts → “Advertise on the Pricing page”.</Notice>
          <PricingPage />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
      {/* ── toolbar ── */}
      <div className="glass z-20 flex flex-wrap items-center gap-x-2 gap-y-1.5 !rounded-none !border-x-0 !border-t-0 px-3 py-2">
        <label className="flex min-w-0 items-center gap-2 text-sm"><span className="hidden text-muted sm:inline">Page</span>
          <select className="field field-sm !w-auto max-w-[11rem]" aria-label="Page being edited" value={slug} onChange={(e) => { setSlug(e.target.value as PageSlug); setSelected(null); }}>{PAGE_SLUGS.map((s) => <option key={s} value={s}>{doc.pages[s].title}</option>)}</select>
        </label>
        <div className="flex items-center">
          <button type="button" className={tool} aria-label="Undo" title="Undo (Ctrl+Z)" disabled={state.past.length === 0} onClick={() => dispatch({ type: 'undo' })}><Undo2 className="h-4 w-4" /></button>
          <button type="button" className={tool} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={state.future.length === 0} onClick={() => dispatch({ type: 'redo' })}><Redo2 className="h-4 w-4" /></button>
        </div>
        <div className="hidden items-center rounded-full border border-white/10 bg-white/5 p-0.5 lg:flex" role="group" aria-label="Preview size">
          {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
            <button key={d} type="button" aria-label={`${d} preview`} aria-pressed={device === d} onClick={() => setDevice(d)} className={cx('grid h-8 w-9 place-items-center rounded-full', device === d ? 'bg-white/15 text-ink' : 'text-muted hover:text-ink')}><Icon className="h-4 w-4" /></button>
          ))}
        </div>
        <span className="ml-auto" />
        <span aria-live="polite">{dirty ? <Badge tone="warn">Unsaved changes</Badge> : unpublished ? <Badge tone="info">Draft saved · not published</Badge> : <Badge tone="success">Published</Badge>}</span>
        <button type="button" className={tool} aria-label="Version history" title="Version history" onClick={() => setHistoryOpen(true)}><History className="h-4 w-4" /></button>
        <a className={tool} href="/__preview" target="_blank" rel="noopener" aria-label="Preview saved draft in a new tab" title="Preview saved draft in a new tab"><ExternalLink className="h-4 w-4" /></a>
        <Btn size="sm" variant="secondary" loading={save.isPending && !publish.isPending} disabled={!dirty} onClick={() => save.mutate()}><Save className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Save draft</span></Btn>
        <Btn size="sm" disabled={!dirty && !unpublished} onClick={() => setPublishOpen(true)}><UploadCloud className="h-4 w-4" aria-hidden />Publish</Btn>
      </div>

      {/* ── mobile: Editor / Preview tabs ── */}
      <div className="flex justify-center border-b border-white/10 p-2 lg:hidden">
        <Tabs value={mobileView} onChange={setMobileView} tabs={[{ id: 'editor', label: 'Editor' }, { id: 'preview', label: 'Preview' }]} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── editor panel ── */}
        <aside aria-label="Editor" style={{ '--panel': `${panelWidth}px` } as React.CSSProperties}
          className={cx('min-h-0 w-full flex-col border-r border-white/10 bg-surface/90 backdrop-blur-xl lg:flex lg:w-[var(--panel)] lg:shrink-0', mobileView === 'editor' ? 'flex' : 'hidden')}>
          <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-white/10 p-2" role="tablist" aria-label="Editor sections">
            {TABS.map((t) => (
              <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => { setTab(t.id); if (t.id !== 'sections') setSelected(t.id === 'navigation' ? 'nav' : t.id === 'footer' ? 'footer' : null); }}
                className={cx('whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium', tab === t.id ? 'bg-white/15 text-ink' : 'text-muted hover:text-ink')}>{t.label}</button>
            ))}
          </div>
          {editorBody}
        </aside>

        {/* ── divider ── */}
        <div role="separator" aria-orientation="vertical" aria-label="Resize editor panel" aria-valuemin={300} aria-valuemax={640} aria-valuenow={panelWidth} tabIndex={0}
          onPointerDown={startDrag} onDoubleClick={() => setPanelWidth(400)}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') setPanelWidth((w) => Math.max(300, w - 20)); if (e.key === 'ArrowRight') setPanelWidth((w) => Math.min(640, w + 20)); }}
          className={cx('hidden w-1.5 shrink-0 cursor-col-resize bg-white/5 transition-colors hover:bg-accent/60 focus-visible:bg-accent lg:block', dragging && '!bg-accent')} />

        {/* ── live preview ── */}
        <section aria-label="Live preview" className={cx('relative min-w-0 flex-1 bg-surface lg:block', mobileView === 'preview' ? 'block' : 'hidden')}>
          <div ref={stage} className="absolute inset-0 flex items-start justify-center overflow-hidden">
            <iframe ref={frame} title="Live website preview" src="/__preview"
              onLoad={() => { /* the preview announces itself with a "ready" message */ }}
              style={device === 'desktop' && scale === 1
                ? { width: '100%', height: '100%' }
                : { width, height: frameHeight, transform: `scale(${scale})`, transformOrigin: 'top center', marginTop: device === 'desktop' ? 0 : 16, flexShrink: 0 }}
              className={cx('border-0 bg-black', device !== 'desktop' && 'rounded-[28px] shadow-[0_0_0_10px_#1b1f27,0_30px_80px_rgba(0,0,0,.6)]')} />
            {dragging && <div className="absolute inset-0" />}
          </div>
        </section>
      </div>

      {/* ── dialogs ── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a section">
        <div className="grid grid-cols-2 gap-2">
          {ADDABLE.map((t) => <button key={t} type="button" onClick={() => addSection(t)} className="glass-soft p-3 text-left text-sm font-medium hover:!border-accent">{SECTION_LABELS[t]}</button>)}
        </div>
        <p className="mt-3 text-xs text-muted">The new section is added {section ? 'below the selected section' : 'at the end of the page'}.</p>
      </Modal>

      <Modal open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish changes"
        footer={<><Btn variant="secondary" onClick={() => setPublishOpen(false)}>Cancel</Btn><Btn loading={publish.isPending} onClick={() => publish.mutate()}><UploadCloud className="h-4 w-4" aria-hidden />Publish now</Btn></>}>
        <p className="text-sm text-ink/85">Your draft will replace the live website for all visitors. A version is saved automatically so you can roll back at any time.</p>
        <Field label="Version note (optional)" className="mt-4" hint="e.g. “New hero headline”">{(p) => <input {...p} className="field" value={publishLabel} maxLength={200} onChange={(e) => setPublishLabel(e.target.value)} />}</Field>
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Version history" wide>
        <p className="mb-4 text-sm text-muted">Every publish creates a version. Restoring loads that version into your draft — it does not go live until you publish again.</p>
        {versions.isLoading ? <Spinner /> : (versions.data ?? []).length === 0 ? <Notice tone="info">No versions yet. Publish to create the first one.</Notice> : (
          <ul className="space-y-2">
            {versions.data!.map((v, i) => (
              <li key={v.id} className="glass-soft flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">Version {v.version_number}{i === 0 && <Badge tone="success" className="ml-2">Latest published</Badge>}</p><p className="truncate text-xs text-muted">{formatDate(v.created_at, true)}{v.label && ` · ${v.label}`}</p></div>
                <Btn size="sm" variant="secondary" loading={restore.isPending && restore.variables === v.id} onClick={() => restore.mutate(v.id)}><RotateCcw className="h-4 w-4" aria-hidden />Restore to draft</Btn>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
