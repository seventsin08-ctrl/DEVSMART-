import {
  BarChart3, Bell, BookImage, Brush, CreditCard, FileSignature, FolderKanban, Gauge, Images, LayoutTemplate, LogOut, Menu,
  Package, Percent, Receipt, Settings, ShieldCheck, ShoppingCart, Tags, Users, X, type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { cx } from '@/lib/utils';
import { BrandMark } from '@/site/chrome';
import { useSite } from '@/site/SiteContext';
import { LiveSiteProvider } from '@/site/SiteProvider';
import { useDocumentTheme } from '@/site/theme';
import { PageLoader } from '@/ui';
import { AdminGate } from './auth';
import { ContractsPage, CustomersPage, MediaPage, PaymentsPage, ProjectsPage, ReceiptsPage } from './pages/business';
import { DiscountsPage, PortfolioPage, PricingPage, ServicesPage } from './pages/catalog';
import { OrderDetailPage, OrdersPage } from './pages/orders';
import { AnalyticsPage, NotificationsPage, OverviewPage, SecurityPage, SettingsPage, useUnreadCount } from './pages/system';

const Studio = lazy(() => import('@/studio/Studio'));

const NAV: { to: string; label: string; icon: LucideIcon; group: string }[] = [
  { to: '', label: 'Overview', icon: Gauge, group: 'Business' },
  { to: 'orders', label: 'Orders', icon: ShoppingCart, group: 'Business' },
  { to: 'customers', label: 'Customers', icon: Users, group: 'Business' },
  { to: 'projects', label: 'Projects', icon: FolderKanban, group: 'Business' },
  { to: 'payments', label: 'Payments', icon: CreditCard, group: 'Business' },
  { to: 'receipts', label: 'Receipts', icon: Receipt, group: 'Business' },
  { to: 'contracts', label: 'Contracts', icon: FileSignature, group: 'Business' },
  { to: 'services', label: 'Services', icon: Package, group: 'Catalogue' },
  { to: 'pricing', label: 'Pricing', icon: Tags, group: 'Catalogue' },
  { to: 'discounts', label: 'Discounts', icon: Percent, group: 'Catalogue' },
  { to: 'portfolio', label: 'Portfolio', icon: BookImage, group: 'Catalogue' },
  { to: 'studio', label: 'Branding Studio', icon: Brush, group: 'Website' },
  { to: 'editor', label: 'Website Editor', icon: LayoutTemplate, group: 'Website' },
  { to: 'media', label: 'Media Library', icon: Images, group: 'Website' },
  { to: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Insights' },
  { to: 'notifications', label: 'Notifications', icon: Bell, group: 'Insights' },
  { to: 'settings', label: 'Settings', icon: Settings, group: 'System' },
  { to: 'security', label: 'Security', icon: ShieldCheck, group: 'System' },
];

function Sidebar({ onNavigate, unread }: { onNavigate?: () => void; unread: number }) {
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <div className="flex h-full flex-col">
      <a href="/" className="px-4 py-5" aria-label="Open the public website"><BrandMark /></a>
      <nav aria-label="Admin" className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g} className="mb-4">
            <p className="px-3 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">{g}</p>
            <ul className="space-y-0.5">
              {NAV.filter((n) => n.group === g).map((n) => (
                <li key={n.to}>
                  <NavLink to={`/admin/${n.to}`} end={n.to === ''} onClick={onNavigate}
                    className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors', isActive ? 'bg-white/12 font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.12)]' : 'text-ink/70 hover:bg-white/5 hover:text-ink')}>
                    <n.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.to === 'notifications' && unread > 0 && <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-[#fff]" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button type="button" onClick={() => supabase?.auth.signOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink/70 hover:bg-white/5 hover:text-ink"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
      </div>
    </div>
  );
}

function Dashboard({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const { pathname } = useLocation();
  const fullBleed = /^\/admin\/(studio|editor)/.test(pathname);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  const current = NAV.find((n) => (n.to === '' ? pathname === '/admin' || pathname === '/admin/' : pathname.startsWith(`/admin/${n.to}`)));

  return (
    <div className="min-h-dvh lg:pl-64">
      <div className="dm-backdrop" aria-hidden><div className="dm-blob dm-blob-a !opacity-25" /><div className="dm-blob dm-blob-b !opacity-10" /></div>
      <aside className="glass fixed inset-y-0 left-0 z-40 hidden w-64 !rounded-none !border-y-0 !border-l-0 lg:block"><Sidebar unread={unread} /></aside>
      <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 !rounded-none !border-x-0 !border-t-0 px-4 lg:hidden">
        <button type="button" aria-label="Open menu" aria-expanded={open} className="grid h-10 w-10 place-items-center rounded-full bg-white/10" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
        <p className="min-w-0 flex-1 truncate font-semibold">{current?.label ?? 'Admin'}</p>
        {unread > 0 && <NavLink to="/admin/notifications" className="relative grid h-10 w-10 place-items-center rounded-full bg-white/10" aria-label={`${unread} unread notifications`}><Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-accent" /></NavLink>}
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="glass absolute inset-y-0 left-0 w-72 max-w-[85vw] !rounded-none !bg-surface/95">
            <button type="button" aria-label="Close menu" className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            <Sidebar unread={unread} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <main className={cx('relative z-10 min-w-0', fullBleed ? '' : 'mx-auto max-w-[110rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8')}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route index element={<OverviewPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="receipts" element={<ReceiptsPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="discounts" element={<DiscountsPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="studio" element={<Studio key="brand" initialTab="brand" />} />
            <Route path="editor" element={<Studio key="pages" initialTab="sections" />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="security" element={<SecurityPage email={email} />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function Themed() {
  const { site } = useSite();
  useDocumentTheme(site, 'Admin');
  return <AdminGate>{(_status, session) => <Dashboard email={session.user.email ?? ''} />}</AdminGate>;
}

export default function AdminApp() {
  return <LiveSiteProvider><Themed /></LiveSiteProvider>;
}
