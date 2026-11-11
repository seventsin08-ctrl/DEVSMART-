// Small Liquid Glass UI kit shared by the public site, the admin dashboard and the studio.
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/lib/utils';

// ───────── Button ─────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}
export function btnClass(variant: Variant = 'primary', size: 'sm' | 'md' | 'lg' = 'md', extra = ''): string {
  return cx('btn', `btn-${size}`, `btn-${variant}`, variant === 'primary' && 'btn-style-gradient btn-hover-glow', extra);
}
export function Btn({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={btnClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="dm-spinner !h-4 !w-4" aria-hidden />}
      {children}
    </button>
  );
}

// ───────── Glass card ─────────
export function Glass({ className, hover, spot, children, ...rest }: HTMLAttributes<HTMLDivElement> & { hover?: boolean; spot?: boolean }) {
  const onMove = spot
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
    : undefined;
  return (
    <div className={cx('glass', hover && 'glass-hover', spot && 'glass-spot', className)} onPointerMove={onMove} {...rest}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted" role="status">
      <span className="dm-spinner" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="grid min-h-[60dvh] place-items-center" role="status" aria-label="Loading">
      <motion.div
        className="h-12 w-12 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl"
        animate={{ rotate: [0, 90, 180, 270, 360], borderRadius: ['30%', '50%', '30%', '50%', '30%'] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'info' | 'success' | 'warn' | 'danger'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-white/10 text-ink border-white/15',
    info: 'bg-sky-400/15 text-sky-200 border-sky-300/25',
    success: 'bg-emerald-400/15 text-emerald-200 border-emerald-300/25',
    warn: 'bg-amber-400/15 text-amber-200 border-amber-300/25',
    danger: 'bg-rose-400/15 text-rose-200 border-rose-300/25',
  } as const;
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Notice({ tone = 'info', title, children, className }: { tone?: 'info' | 'success' | 'warn' | 'danger'; title?: string; children?: ReactNode; className?: string }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle;
  const color = { info: 'text-sky-300 border-sky-300/25 bg-sky-400/10', success: 'text-emerald-300 border-emerald-300/25 bg-emerald-400/10', warn: 'text-amber-300 border-amber-300/25 bg-amber-400/10', danger: 'text-rose-300 border-rose-300/25 bg-rose-400/10' }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-2xl border p-4 text-sm', color, className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 text-ink/90">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className={cx(title && 'mt-1', 'leading-relaxed [overflow-wrap:anywhere]')}>{children}</div>}
      </div>
    </div>
  );
}

// ───────── Form field wrapper ─────────
export function Field({ label, error, hint, required, children, className }: { label: string; error?: string; hint?: string; required?: boolean; children: (p: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode; className?: string }) {
  const id = useId();
  const describedBy = error ? `${id}-e` : hint ? `${id}-h` : undefined;
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink/90">
        {label} {required && <span className="text-accent" aria-hidden>*</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? <p id={`${id}-e`} className="mt-1.5 text-sm text-rose-300" role="alert">{error}</p>
        : hint ? <p id={`${id}-h`} className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ───────── Modal / drawer ─────────
export function Modal({ open, onClose, title, children, footer, wide, side }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; side?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className={cx('fixed inset-0 z-[100] flex bg-black/60 backdrop-blur-sm', side ? 'justify-end' : 'items-end justify-center p-0 sm:items-center sm:p-6')}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
            className={cx('glass flex max-h-[100dvh] w-full flex-col outline-none !bg-[#0b0e14]/95',
              side ? 'h-full max-w-xl !rounded-none sm:!rounded-l-3xl' : cx('max-h-[92dvh] !rounded-b-none sm:!rounded-b-[var(--dm-radius-card)]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'))}
            initial={side ? { x: 40, opacity: 0 } : { y: 24, opacity: 0, scale: 0.98 }} animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            exit={side ? { x: 40, opacity: 0 } : { y: 24, opacity: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 340 }}>
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <h2 className="truncate text-lg font-semibold">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && <div className="safe-b flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 pt-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ───────── Toasts ─────────
type Toast = { id: number; tone: 'success' | 'danger' | 'info'; text: string };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'danger' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4" aria-live="polite">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div key={t.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
                className={cx('glass pointer-events-auto flex max-w-md items-center gap-2 !rounded-full !bg-[#10141c]/95 px-4 py-2.5 text-sm', t.tone === 'danger' && '!border-rose-400/40')}>
                {t.tone === 'danger' ? <AlertCircle className="h-4 w-4 shrink-0 text-rose-300" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />}
                <span>{t.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

// ───────── Tabs ─────────
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('scroll-thin flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 p-1', className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors', value === t.id ? 'bg-white/15 text-ink shadow-inner' : 'text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && t.count > 0 && <span className="ml-1.5 rounded-full bg-accent/30 px-1.5 text-xs text-ink">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="glass-soft grid place-items-center gap-2 px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full border border-white/15 transition-colors disabled:opacity-50', checked ? 'bg-accent' : 'bg-white/10')}>
      <span className={cx('absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function useConfirm(): [(message: string) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((message: string) => new Promise<boolean>((resolve) => setState({ message, resolve })), []);
  const close = useCallback((v: boolean) => setState((s) => { s?.resolve(v); return null; }), []);
  const node = useMemo(() => (
    <Modal open={!!state} onClose={() => close(false)} title="Please confirm"
      footer={<><Btn variant="secondary" onClick={() => close(false)}>Cancel</Btn><Btn variant="danger" onClick={() => close(true)}>Confirm</Btn></>}>
      <p className="text-ink/90">{state?.message}</p>
    </Modal>
  ), [state, close]);
  return [confirm, node];
}
