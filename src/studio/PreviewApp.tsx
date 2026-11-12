// The live preview. It renders the SAME <PageView> the public site uses, fed with the draft
// document the studio sends over postMessage (same-origin only, re-validated on arrival).
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeSiteDoc } from '@shared/site/parse';
import { PAGE_SLUGS, type PageSlug, type SiteDoc } from '@shared/site/schema';
import { supabase } from '@/lib/supabase';
import { PageView } from '@/site/PageView';
import { SiteContext } from '@/site/SiteContext';
import { useDocumentTheme } from '@/site/theme';
import { Notice, PageLoader } from '@/ui';

export const STUDIO_SOURCE = 'devmart-studio';
export const PREVIEW_SOURCE = 'devmart-preview';
const isSlug = (v: unknown): v is PageSlug => PAGE_SLUGS.includes(v as PageSlug);

function Themed({ site, slug }: { site: SiteDoc; slug: PageSlug }) {
  useDocumentTheme(site, `Preview · ${site.pages[slug].title}`);
  return <PageView slug={slug} />;
}

function EmbeddedPreview() {
  const [site, setSite] = useState<SiteDoc | null>(null);
  const [slug, setSlug] = useState<PageSlug>('home');
  const [selected, setSelected] = useState<string | null>(null);
  const scrollTo = useRef<string | null>(null);
  const post = useCallback((message: Record<string, unknown>) => {
    window.parent.postMessage({ source: PREVIEW_SOURCE, ...message }, window.location.origin);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const data = e.data as { source?: string; type?: string; doc?: unknown; slug?: unknown; selected?: unknown; scroll?: unknown };
      if (data?.source !== STUDIO_SOURCE || data.type !== 'state') return;
      setSite(normalizeSiteDoc(data.doc)); // never trust the payload shape
      if (isSlug(data.slug)) setSlug(data.slug);
      const sel = typeof data.selected === 'string' ? data.selected : null;
      setSelected(sel);
      if (data.scroll && sel) scrollTo.current = sel;
    };
    window.addEventListener('message', onMessage);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  // selection outline + scroll into view
  useEffect(() => {
    document.querySelectorAll('.dm-selected').forEach((el) => el.classList.remove('dm-selected'));
    if (!selected) return;
    const find = (key: string) => document.querySelector<HTMLElement>(`[data-edit="${CSS.escape(key)}"]`);
    const el = find(selected) ?? find(selected.split(':').slice(0, 2).join(':'));
    if (!el) return;
    el.classList.add('dm-selected');
    if (scrollTo.current === selected) {
      scrollTo.current = null;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  const value = useMemo(() => ({
    site: site!, editing: true,
    onNavigate: (next: PageSlug) => post({ type: 'navigate', slug: next }),
  }), [site, post]);

  if (!site) return <PageLoader />;
  return (
    <div onClick={(e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-edit]');
      if (!target) return;
      e.preventDefault();
      post({ type: 'select', edit: target.dataset.edit });
    }}>
      <SiteContext.Provider value={value}><Themed site={site} slug={slug} /></SiteContext.Provider>
    </div>
  );
}

/** Opened in its own tab ("Preview draft"): loads the saved draft for a signed-in admin. */
function StandalonePreview() {
  const [slug, setSlug] = useState<PageSlug>('home');
  const draft = useQuery({
    queryKey: ['site', 'draft-preview'], retry: false,
    queryFn: async () => {
      if (!supabase) throw new Error('The backend is not configured.');
      const { data, error } = await supabase.rpc('get_site_draft');
      if (error) throw new Error('Sign in to the admin dashboard to preview drafts.');
      return normalizeSiteDoc(data);
    },
  });
  const value = useMemo(() => ({ site: draft.data!, editing: true, onNavigate: (s: PageSlug) => { setSlug(s); window.scrollTo(0, 0); } }), [draft.data]);
  if (draft.isLoading) return <PageLoader />;
  if (draft.isError || !draft.data) return <div className="mx-auto max-w-md p-8"><Notice tone="danger" title="Draft preview unavailable">{(draft.error as Error)?.message}</Notice></div>;
  return (
    <SiteContext.Provider value={value}>
      {/* editing=true keeps links inside the preview; the class below removes editor outlines */}
      <div className="[&_.dm-editing_[data-edit]]:!cursor-auto [&_.dm-editing_[data-edit]]:!outline-none"><Themed site={draft.data} slug={slug} /></div>
      <p className="glass fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 !rounded-full !bg-black/80 px-4 py-2 text-xs font-medium">Draft preview — visitors do not see this until you publish</p>
    </SiteContext.Provider>
  );
}

export default function PreviewApp() {
  return window.parent !== window ? <EmbeddedPreview /> : <StandalonePreview />;
}
