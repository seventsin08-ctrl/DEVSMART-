import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { PAGE_PATHS, PAGE_SLUGS, type PageSlug } from '@shared/site/schema';
import { PageView } from '@/site/PageView';
import { useSite } from '@/site/SiteContext';
import { LiveSiteProvider } from '@/site/SiteProvider';
import { useDocumentTheme } from '@/site/theme';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function PublicPage({ slug }: { slug: PageSlug }) {
  const { site } = useSite();
  useDocumentTheme(site, slug === 'home' ? undefined : site.pages[slug].title);
  return <PageView slug={slug} />;
}

function NotFound() {
  const { site } = useSite();
  useDocumentTheme(site, 'Page not found');
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="h-section mt-3">This page does not exist</h1>
        <p className="mt-3 text-muted">The link may be broken or the page may have moved.</p>
        <a href="/" className="btn btn-md btn-primary btn-style-gradient mt-8">Back to home</a>
      </div>
    </div>
  );
}

export function PublicRoutes() {
  return (
    <LiveSiteProvider>
      <ScrollToTop />
      <Routes>
        {PAGE_SLUGS.map((slug) => <Route key={slug} path={PAGE_PATHS[slug]} element={<PublicPage slug={slug} />} />)}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </LiveSiteProvider>
  );
}

