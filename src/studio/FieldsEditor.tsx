// Generic property editor generated from field descriptors (see fields.ts).
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { newId } from '@shared/site/defaults';
import { isSafeHref } from '@shared/site/schema';
import { ImageInput } from '@/admin/kit';
import { cx } from '@/lib/utils';
import { Switch } from '@/ui';
import { PAGE_LINK_OPTIONS, type F } from './fields';

type Obj = Record<string, unknown>;
type OnChange = (path: (string | number)[], value: unknown) => void;

const iconBtn = 'grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-ink disabled:opacity-30';

function Labelled({ label, hint, htmlFor, children, focused }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode; focused?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focused]);
  return (
    <div ref={ref} className={cx('rounded-xl transition-shadow', focused && 'shadow-[0_0_0_2px_var(--dm-accent)] p-2 -m-2')}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink/80">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[0.7rem] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

function HrefInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const listId = `${id}-pages`;
  const bad = !isSafeHref(value);
  return (
    <>
      <input id={id} list={listId} className="field field-sm" aria-invalid={bad || undefined} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/pricing, #section or https://…" />
      <datalist id={listId}>{PAGE_LINK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>
      {bad && <p className="mt-1 text-[0.7rem] text-rose-300">Use a page path, #anchor, https://, mailto: or tel: link.</p>}
    </>
  );
}

function ColorInput({ id, value, onChange, allowEmpty }: { id: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = /^#[0-9a-fA-F]{6}$/.test(text);
  return (
    <div className="flex items-center gap-2">
      <input type="color" aria-label="Pick colour" className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-transparent p-0.5" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#3b9eff'} onChange={(e) => onChange(e.target.value)} />
      <input id={id} className="field field-sm font-mono" value={text} maxLength={7} placeholder={allowEmpty ? 'Default' : '#000000'} aria-invalid={(!valid && !(allowEmpty && text === '')) || undefined}
        onChange={(e) => { const v = e.target.value.trim(); setText(v); if (/^#[0-9a-fA-F]{6}$/.test(v) || (allowEmpty && v === '')) onChange(v); }} />
      {allowEmpty && value !== '' && <button type="button" className={iconBtn} aria-label="Clear colour" onClick={() => onChange('')}><Trash2 className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

function ListEditor({ field, value, path, onChange, focus }: { field: F; value: Obj[]; path: (string | number)[]; onChange: OnChange; focus?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const items = Array.isArray(value) ? value : [];
  const max = field.maxItems ?? 50;
  const replace = (next: Obj[]) => onChange(path, next);
  const move = (i: number, dir: -1 | 1) => { const next = items.slice(); const [it] = next.splice(i, 1); next.splice(i + dir, 0, it); replace(next); };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between"><span className="text-xs font-medium text-ink/80">{field.label} <span className="text-muted">({items.length})</span></span></div>
      {field.hint && <p className="mb-2 text-[0.7rem] text-muted">{field.hint}</p>}
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const key = String(item.id ?? i);
          const isOpen = open === key;
          return (
            <li key={key} className="rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-0.5 p-1.5">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left text-sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                  <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} aria-hidden />
                  <span className="truncate">{String(item[field.itemLabel ?? 'title'] ?? '') || `Untitled ${field.itemName ?? 'item'}`}</span>
                </button>
                <button type="button" className={iconBtn} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" className={iconBtn} aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" className={iconBtn} aria-label={`Duplicate ${field.itemName ?? 'item'}`} disabled={items.length >= max} onClick={() => { const next = items.slice(); next.splice(i + 1, 0, { ...structuredClone(item), id: newId('i') }); replace(next); }}><Copy className="h-3.5 w-3.5" /></button>
                <button type="button" className={cx(iconBtn, 'hover:!text-rose-300')} aria-label={`Remove ${field.itemName ?? 'item'}`} onClick={() => replace(items.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {isOpen && <div className="border-t border-white/10 p-3"><FieldsEditor fields={field.fields ?? []} value={item} path={[...path, i]} onChange={onChange} focus={focus} /></div>}
            </li>
          );
        })}
      </ul>
      <button type="button" disabled={items.length >= max} onClick={() => { const item = field.newItem?.() ?? { id: newId('i') }; replace([...items, item]); setOpen(String(item.id)); }}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-2 text-xs font-medium text-ink/80 hover:border-accent hover:text-ink disabled:opacity-40">
        <Plus className="h-3.5 w-3.5" aria-hidden />Add {field.itemName ?? 'item'}
      </button>
    </div>
  );
}

function StringsEditor({ field, value, path, onChange }: { field: F; value: string[]; path: (string | number)[]; onChange: OnChange }) {
  const items = Array.isArray(value) ? value : [];
  const fixed = field.key === 'stepLabels';
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-ink/80">{field.label}</span>
      <ul className="space-y-1.5">
        {items.map((v, i) => (
          <li key={i} className="flex gap-1.5">
            <input className="field field-sm" aria-label={`${field.label} ${i + 1}`} value={v} onChange={(e) => onChange([...path, i], e.target.value)} />
            {!fixed && <button type="button" className={iconBtn} aria-label="Remove" onClick={() => onChange(path, items.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></button>}
          </li>
        ))}
      </ul>
      {!fixed && <button type="button" disabled={items.length >= (field.maxItems ?? 10)} onClick={() => onChange(path, [...items, ''])} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-1.5 text-xs text-ink/80 hover:border-accent disabled:opacity-40"><Plus className="h-3.5 w-3.5" aria-hidden />Add</button>}
      {field.hint && <p className="mt-1 text-[0.7rem] text-muted">{field.hint}</p>}
    </div>
  );
}

function Group({ field, children, defaultOpen }: { field: F; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-semibold">
        {field.label}<ChevronDown className={cx('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="border-t border-white/10 p-3.5">{children}</div>}
    </div>
  );
}

/**
 * Renders editors for `fields` of the object `value`. `path` is the location of `value`
 * inside the site document; every change is reported as (absolute path, new value).
 * `focus` is the field key that was clicked in the live preview.
 */
export function FieldsEditor({ fields, value, path, onChange, focus, openGroups }: { fields: F[]; value: Obj; path: (string | number)[]; onChange: OnChange; focus?: string; openGroups?: boolean }) {
  const uid = useId();
  return (
    <div className="space-y-3.5">
      {fields.map((f) => {
        const id = `${uid}-${f.key}`;
        const v = value?.[f.key];
        const p = [...path, f.key];
        const focused = focus === f.key;
        switch (f.type) {
          case 'group':
            return <Group key={f.key} field={f} defaultOpen={openGroups || focused}><FieldsEditor fields={f.fields ?? []} value={(v ?? {}) as Obj} path={p} onChange={onChange} focus={focus} /></Group>;
          case 'list':
            return <ListEditor key={f.key} field={f} value={v as Obj[]} path={p} onChange={onChange} focus={focus} />;
          case 'strings':
            return <StringsEditor key={f.key} field={f} value={v as string[]} path={p} onChange={onChange} />;
          case 'button': {
            const b = (v ?? {}) as { label: string; href: string; variant: string; show: boolean };
            return (
              <Labelled key={f.key} label={f.label} focused={focused}>
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted">Show this button</span><Switch checked={!!b.show} onChange={(x) => onChange([...p, 'show'], x)} label={`Show ${f.label}`} /></div>
                  <input className="field field-sm" aria-label={`${f.label} text`} placeholder="Button text" value={b.label ?? ''} onChange={(e) => onChange([...p, 'label'], e.target.value)} />
                  <HrefInput id={`${id}-href`} value={b.href ?? ''} onChange={(x) => onChange([...p, 'href'], x)} />
                  <select className="field field-sm" aria-label={`${f.label} style`} value={b.variant} onChange={(e) => onChange([...p, 'variant'], e.target.value)}><option value="primary">Primary (accent)</option><option value="secondary">Secondary (glass)</option><option value="ghost">Ghost (text only)</option></select>
                </div>
              </Labelled>
            );
          }
          case 'bool':
            return (
              <div key={f.key} className={cx('flex items-center justify-between gap-3 rounded-xl', focused && 'shadow-[0_0_0_2px_var(--dm-accent)] p-2 -m-2')}>
                <div><p className="text-xs font-medium text-ink/80">{f.label}</p>{f.hint && <p className="text-[0.7rem] text-muted">{f.hint}</p>}</div>
                <Switch checked={!!v} onChange={(x) => onChange(p, x)} label={f.label} />
              </div>
            );
          case 'range':
            return (
              <Labelled key={f.key} label={`${f.label}: ${v}${f.unit ?? ''}`} hint={f.hint} htmlFor={id} focused={focused}>
                <input id={id} type="range" className="w-full accent-[var(--dm-accent)]" min={f.min} max={f.max} step={f.step} value={Number(v ?? f.min ?? 0)} onChange={(e) => onChange(p, Number(e.target.value))} />
              </Labelled>
            );
          case 'select':
            return (
              <Labelled key={f.key} label={f.label} hint={f.hint} htmlFor={id} focused={focused}>
                <select id={id} className="field field-sm" value={String(v)} onChange={(e) => { const o = f.options!.find((x) => String(x.value) === e.target.value); onChange(p, o ? o.value : e.target.value); }}>
                  {f.options!.map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
                </select>
              </Labelled>
            );
          case 'color':
            return <Labelled key={f.key} label={f.label} hint={f.hint} htmlFor={id} focused={focused}><ColorInput id={id} value={String(v ?? '')} onChange={(x) => onChange(p, x)} allowEmpty={f.allowEmptyColor} /></Labelled>;
          case 'image':
            return <Labelled key={f.key} label={f.label} hint={f.hint} htmlFor={id} focused={focused}><ImageInput id={id} value={String(v ?? '')} onChange={(x) => onChange(p, x)} kind={f.mediaKind ?? 'image'} /></Labelled>;
          case 'href':
            return <Labelled key={f.key} label={f.label} hint={f.hint} htmlFor={id} focused={focused}><HrefInput id={id} value={String(v ?? '')} onChange={(x) => onChange(p, x)} /></Labelled>;
          case 'textarea':
            return <Labelled key={f.key} label={f.label} hint={f.hint} htmlFor={id} focused={focused}><textarea id={id} className="field field-sm !min-h-0" rows={f.rows ?? 3} value={String(v ?? '')} onChange={(e) => onChange(p, e.target.value)} /></Labelled>;
          default:
            return <Labelled key={f.key} label={f.label} hint={f.hint} htmlFor={id} focused={focused}><input id={id} className="field field-sm" value={String(v ?? '')} onChange={(e) => onChange(p, e.target.value)} /></Labelled>;
        }
      })}
    </div>
  );
}
