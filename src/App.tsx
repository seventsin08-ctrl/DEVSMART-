import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PublicRoutes } from '@/PublicRoutes';
import { PageLoader, ToastProvider } from '@/ui';

const AdminApp = lazy(() => import('@/admin/AdminApp'));
const PreviewApp = lazy(() => import('@/studio/PreviewApp'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/admin/*" element={<AdminApp />} />
                <Route path="/__preview" element={<PreviewApp />} />
                <Route path="*" element={<PublicRoutes />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
