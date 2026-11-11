import { createContext, useContext } from 'react';
import { DEFAULT_SITE } from '@shared/site/defaults';
import type { PageSlug, SiteDoc } from '@shared/site/schema';

export interface SiteContextValue {
  site: SiteDoc;
  /** true inside the Branding Studio preview: links don't navigate, elements are selectable */
  editing: boolean;
  /** preview only: called when an internal link is clicked */
  onNavigate?: (slug: PageSlug) => void;
}

export const SiteContext = createContext<SiteContextValue>({ site: DEFAULT_SITE, editing: false });
export const useSite = () => useContext(SiteContext);
