import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { DEFAULT_SITE } from '@shared/site/defaults';
import { normalizeSiteDoc } from '@shared/site/parse';
import type { SiteDoc } from '@shared/site/schema';
import { supabase } from '@/lib/supabase';
import { SiteContext } from './SiteContext';

const CACHE_KEY = 'devmart-site-cache';

function cachedSite(): SiteDoc | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalizeSiteDoc(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

/** Loads the PUBLISHED site (never drafts). Falls back to built-in defaults on any failure. */
export function usePublishedSite() {
  return useQuery({
    queryKey: ['site', 'published'],
    staleTime: 60_000,
    placeholderData: cachedSite,
    queryFn: async (): Promise<SiteDoc> => {
      if (!supabase) return DEFAULT_SITE;
      const { data, error } = await supabase.rpc('get_published_site');
      if (error) return cachedSite() ?? DEFAULT_SITE;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch { /* ignore */ }
      return normalizeSiteDoc(data);
    },
  });
}

export function LiveSiteProvider({ children }: { children: ReactNode }) {
  const { data } = usePublishedSite();
  const value = useMemo(() => ({ site: data ?? DEFAULT_SITE, editing: false }), [data]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}
