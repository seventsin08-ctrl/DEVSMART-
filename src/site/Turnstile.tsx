// Optional Cloudflare Turnstile widget. Renders nothing unless VITE_TURNSTILE_SITE_KEY is set.
import { useEffect, useRef } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}
let loader: Promise<void> | null = null;
function load(): Promise<void> {
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('captcha failed to load'));
    document.head.appendChild(s);
  });
  return loader;
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let widget: string | undefined;
    let cancelled = false;
    load().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widget = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY, theme: 'dark',
        callback: (t: string) => cb.current(t), 'expired-callback': () => cb.current(''),
      });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, []);
  if (!SITE_KEY) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
