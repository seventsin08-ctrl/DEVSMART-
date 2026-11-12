// Admin toolkit: data hooks, tables, a schema-driven CRUD page and the media picker.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Download, ImageIcon, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { centavosToInput, parsePesos } from '@shared/money';
import { isSafeImageUrl } from '@shared/site/schema';
import { errorMessage } from '@/lib/api';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { cx, downloadCsv } from '@/lib/utils';
import { Btn, EmptyState, Field, Glass, Modal, Notice, Spinner, Switch, useConfirm, useToast } from '@/ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

// ───────── data ─────────
export function useRows<T = Row>(table: string, opts: { select?: string; order?: [string, boolean]; filter?: (q: any) => any; key?: unknown[]; enabled?: boolean; limit?: number } = {}) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return useQuery({
    queryKey: ['admin', table, opts.select ?? '*', opts.order, ...(opts.key ?? [])],
    enabled: opts.enabled ?? true,
    queryFn: async (): Promise<T[]> => {
      let q = requireSupabase().from(table).select(opts.select ?? '*');
      if (opts.filter) q = opts.filter(q);
      if (opts.order) q = q.order(opts.order[0], { ascending: opts.order[1] });
      q = q.limit(opts.limit ?? 1000);
      return unwrap(await q) as T[];
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...tables: string[]) => Promise.all([
    ...tables.map((t) => qc.invalidateQueries({ queryKey: ['admin', t] })),
    qc.invalidateQueries({ queryKey: ['public'] }),
  ]);
}

// ───────── layout pieces ─────────
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>{description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'accent' | 'good' | 'warn' }) {
  return (
    <Glass className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={cx('mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl', tone === 'good' && 'text-emerald-300', tone === 'warn' && 'text-amber-300', tone === 'accent' && 'text-accent')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Glass>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="relative block w-full sm:w-64">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input className="field field-sm !pl-9" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export interface Column<T> { key: string; label: string; render?: (row: T) => ReactNode; className?: string; hideOnMobile?: boolean }

/** Responsive table: scrolls horizontally inside its own container, never the page. */
export function DataTable<T extends Row>({ rows, columns, onRowClick, rowKey = 'id', empty }: { rows: T[]; columns: Column<T>[]; onRowClick?: (row: T) => void; rowKey?: string; empty?: ReactNode }) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <Glass className="overflow-hidden p-0">
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-muted">
              {columns.map((c) => <th key={c.key} scope="col" className={cx('whitespace-nowrap px-4 py-3 font-medium', c.hideOnMobile && 'hidden md:table-cell', c.className)}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[rowKey])} className={cx('border-b border-white/5 last:border-0', onRowClick && 'cursor-pointer hover:bg-white/5')}
                onClick={onRowClick ? () => onRowClick(row) : undefined} tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}>
                {columns.map((c) => <td key={c.key} className={cx('px-4 py-3 align-middle', c.hideOnMobile && 'hidden md:table-cell', c.className)}>{c.render ? c.render(row) : String(row[c.key] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Glass>
  );
}

export function ExportButton({ rows, filename, columns }: { rows: Row[]; filename: string; columns?: { key: string; label: string }[] }) {
  return <Btn variant="secondary" size="sm" disabled={rows.length === 0} onClick={() => downloadCsv(rows, filename, columns)}><Download className="h-4 w-4" aria-hidden />Export CSV</Btn>;
}

// ───────── media ─────────
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'video/mp4', 'video/webm'];
export type MediaKind = 'image' | 'logo' | 'qr' | 'video' | 'other';

export async function uploadMedia(file: File, kind: MediaKind, replace?: { id: string; path: string }): Promise<Row> {
  const supabase = requireSupabase();
  if (!MEDIA_TYPES.includes(file.type)) throw new Error('Unsupported file type. Upload an image (JPG, PNG, WebP, GIF, SVG, ICO) or a video (MP4, WebM).');
  const limit = file.type.startsWith('video/') ? 50 : 8;
  if (file.size > limit * 1024 * 1024) throw new Error(`The file is larger than ${limit} MB.`);
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const path = `${file.type.startsWith('video/') ? 'video' : kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(error.message);
  const publicUrl = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
  const { data: user } = await supabase.auth.getUser();
  const payload = { bucket: 'media', path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size, kind: file.type.startsWith('video/') ? 'video' : kind, public_url: publicUrl, uploaded_by: user.user?.id ?? null };
  if (replace) {
    const row = unwrap(await supabase.from('media_assets').update(payload).eq('id', replace.id).select().single());
    await supabase.storage.from('media').remove([replace.path]);
    return row as unknown as Row;
  }
  return unwrap(await supabase.from('media_assets').insert(payload).select().single()) as Row;
}

export function MediaPicker({ open, onClose, onPick, kind = 'image' }: { open: boolean; onClose: () => void; onPick: (url: string) => void; kind?: MediaKind }) {
  const media = useRows('media_assets', { order: ['created_at', false], enabled: open });
  const invalidate = useInvalidate();
  const toast = useToast();
  const upload = useMutation({
    mutationFn: (file: File) => uploadMedia(file, kind),
    onSuccess: async (row) => { await invalidate('media_assets'); onPick(row.public_url); onClose(); },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });
  const images = (media.data ?? []).filter((m) => String(m.mime_type).startsWith('image/'));
  return (
    <Modal open={open} onClose={onClose} title="Choose an image" wide>
      <label className={cx('btn btn-md btn-secondary mb-4 w-full cursor-pointer', upload.isPending && 'opacity-60')}>
        <Upload className="h-4 w-4" aria-hidden />{upload.isPending ? 'Uploading…' : 'Upload new image'}
        <input type="file" accept="image/*" className="sr-only" disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
      </label>
      {media.isLoading ? <Spinner /> : images.length === 0 ? <EmptyState title="No images yet" text="Upload one to get started." /> : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((m) => (
            <button key={m.id} type="button" onClick={() => { onPick(m.public_url); onClose(); }} className="group overflow-hidden rounded-xl border border-white/10 bg-white/5 hover:border-accent" title={m.file_name}>
              <img src={m.public_url} alt={m.alt_text || m.file_name} loading="lazy" className="aspect-square w-full object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function ImageInput({ value, onChange, kind = 'image', id }: { value: string; onChange: (v: string) => void; kind?: MediaKind; id?: string }) {
  const [open, setOpen] = useState(false);
  const valid = value !== '' && isSafeImageUrl(value);
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15 bg-white/5">
          {valid ? <img src={value} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-4 w-4 text-muted" aria-hidden />}
        </span>
        <input id={id} className="field field-sm min-w-0 flex-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… or choose from library" />
        <Btn size="sm" variant="secondary" onClick={() => setOpen(true)}>Library</Btn>
        {value && <button type="button" aria-label="Remove image" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-ink" onClick={() => onChange('')}><Trash2 className="h-4 w-4" /></button>}
      </div>
      <MediaPicker open={open} onClose={() => setOpen(false)} onPick={onChange} kind={kind} />
    </div>
  );
}

// ───────── schema-driven CRUD ─────────
export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'money' | 'number' | 'percent' | 'bool' | 'select' | 'date' | 'datetime' | 'image' | 'lines' | 'multi';
  options?: { value: string; label: string }[];
  required?: boolean;
  nullable?: boolean;
  hint?: string;
  half?: boolean;
  mediaKind?: MediaKind;
  show?: (form: Row) => boolean;
  upper?: boolean;
}

/** DB row → editable form values (all strings / booleans / arrays). */
export function toForm(fields: FieldDef[], row: Row): Row {
  const form: Row = {};
  for (const f of fields) {
    const v = row[f.key];
    switch (f.type) {
      case 'money': form[f.key] = v === null || v === undefined ? '' : centavosToInput(v); break;
      case 'percent': form[f.key] = v === null || v === undefined ? '' : String(v / 100); break;
      case 'number': form[f.key] = v === null || v === undefined ? '' : String(v); break;
      case 'bool': form[f.key] = Boolean(v); break;
      case 'lines': form[f.key] = Array.isArray(v) ? v.join('\n') : ''; break;
      case 'multi': form[f.key] = Array.isArray(v) ? v : []; break;
      case 'datetime': form[f.key] = v ? new Date(new Date(v).getTime() + 8 * 3600_000).toISOString().slice(0, 16) : ''; break; // shown in Asia/Manila
      default: form[f.key] = v ?? '';
    }
  }
  return form;
}

/** Form values → DB payload. Throws a readable error for invalid input. */
export function fromForm(fields: FieldDef[], form: Row): Row {
  const out: Row = {};
  for (const f of fields) {
    if (f.show && !f.show(form)) {
      if (f.nullable) out[f.key] = null;
      continue;
    }
    const raw = form[f.key];
    const blank = raw === '' || raw === null || raw === undefined;
    if (f.required && (blank || (typeof raw === 'string' && raw.trim() === ''))) throw new Error(`${f.label} is required.`);
    switch (f.type) {
      case 'money': {
        if (blank) { out[f.key] = f.nullable ? null : 0; break; }
        const c = parsePesos(raw);
        if (c === null) throw new Error(`${f.label}: enter a valid peso amount, e.g. 5000 or 5,000.50`);
        out[f.key] = c; break;
      }
      case 'percent': {
        if (blank) { out[f.key] = null; break; }
        if (!/^\d{1,3}(\.\d{1,2})?$/.test(String(raw).trim())) throw new Error(`${f.label}: enter a percentage like 10 or 12.5`);
        const [w, d = ''] = String(raw).trim().split('.');
        const bps = Number(w) * 100 + Number(d.padEnd(2, '0'));
        if (bps < 1 || bps > 10000) throw new Error(`${f.label} must be between 0.01 and 100.`);
        out[f.key] = bps; break;
      }
      case 'number': {
        if (blank) { out[f.key] = f.nullable ? null : 0; break; }
        if (!/^-?\d{1,9}$/.test(String(raw).trim())) throw new Error(`${f.label} must be a whole number.`);
        out[f.key] = Number(raw); break;
      }
      case 'bool': out[f.key] = Boolean(raw); break;
      case 'lines': out[f.key] = String(raw ?? '').split('\n').map((s) => s.trim()).filter(Boolean); break;
      case 'multi': out[f.key] = Array.isArray(raw) ? raw : []; break;
      case 'date': out[f.key] = blank ? null : raw; break;
      case 'datetime': out[f.key] = blank ? null : new Date(`${raw}:00+08:00`).toISOString(); break;
      case 'image':
        if (!blank && !isSafeImageUrl(String(raw))) throw new Error(`${f.label}: use an https:// URL or pick a file from the media library.`);
        out[f.key] = blank ? null : String(raw).trim(); break;
      default: {
        const s = String(raw ?? '').trim();
        out[f.key] = s === '' && f.nullable ? null : f.upper ? s.toUpperCase() : s;
      }
    }
  }
  return out;
}

export function FormFields({ fields, form, setForm }: { fields: FieldDef[]; form: Row; setForm: (updater: (f: Row) => Row) => void }) {
  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.filter((f) => !f.show || f.show(form)).map((f) => (
        <div key={f.key} className={cx(!f.half && 'sm:col-span-2')}>
          {f.type === 'bool' ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div><p className="text-sm font-medium">{f.label}</p>{f.hint && <p className="text-xs text-muted">{f.hint}</p>}</div>
              <Switch checked={Boolean(form[f.key])} onChange={(v) => set(f.key, v)} label={f.label} />
            </div>
          ) : (
            <Field label={f.label} required={f.required} hint={f.hint}>{(p) => {
              const common = { ...p, value: form[f.key] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(f.key, e.target.value) };
              switch (f.type) {
                case 'textarea': case 'lines': return <textarea {...common} className="field" rows={f.type === 'lines' ? 5 : 4} />;
                case 'select': return <select {...common} className="field">{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
                case 'money': return <input {...common} className="field" inputMode="decimal" placeholder="0.00" />;
                case 'percent': return <input {...common} className="field" inputMode="decimal" placeholder="10" />;
                case 'number': return <input {...common} className="field" inputMode="numeric" />;
                case 'date': return <input {...common} className="field" type="date" />;
                case 'datetime': return <input {...common} className="field" type="datetime-local" />;
                case 'image': return <ImageInput id={p.id} value={form[f.key] ?? ''} onChange={(v) => set(f.key, v)} kind={f.mediaKind} />;
                case 'multi': return (
                  <div id={p.id} className="flex flex-wrap gap-2">
                    {f.options!.map((o) => {
                      const on = (form[f.key] as string[]).includes(o.value);
                      return <button key={o.value} type="button" aria-pressed={on} onClick={() => set(f.key, on ? form[f.key].filter((x: string) => x !== o.value) : [...form[f.key], o.value])}
                        className={cx('rounded-full border px-3 py-1.5 text-sm', on ? 'border-accent bg-accent/20' : 'border-white/15 bg-white/5 text-muted')}>{o.label}</button>;
                    })}
                  </div>
                );
                default: return <input {...common} className={cx('field', f.upper && 'uppercase')} />;
              }
            }}</Field>
          )}
        </div>
      ))}
    </div>
  );
}

export interface ResourceConfig {
  table: string;
  singular: string;
  order?: [string, boolean];
  columns: Column<Row>[];
  fields: FieldDef[];
  defaults: Row;
  searchKeys?: string[];
  reorderable?: boolean;
  filter?: (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  filterKey?: string;
  /** adjust the payload before insert/update */
  transform?: (payload: Row, isNew: boolean) => Row;
  deleteLabel?: string;
  /** when set, "delete" archives instead (soft delete) */
  archive?: { column: string; value: unknown };
  empty?: string;
}

/** List + create / edit / delete for one table, driven by a field schema. All writes go through RLS. */
export function ResourceList({ config, toolbar }: { config: ResourceConfig; toolbar?: ReactNode }) {
  const supabase = requireSupabase();
  const rows = useRows(config.table, { order: config.order ?? (config.reorderable ? ['sort_order', true] : ['created_at', false]), filter: config.filter, key: [config.filterKey] });
  const invalidate = useInvalidate();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; form: Row } | null>(null);
  const [formError, setFormError] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      let payload = fromForm(config.fields, editing!.form);
      if (config.transform) payload = config.transform(payload, editing!.id === null);
      if (editing!.id === null) {
        if (config.reorderable) payload.sort_order = (rows.data?.length ?? 0) + 1;
        unwrap(await supabase.from(config.table).insert(payload).select('id').single());
      } else unwrap(await supabase.from(config.table).update(payload).eq('id', editing!.id).select('id').single());
    },
    onSuccess: async () => { await invalidate(config.table); toast(`${config.singular} saved`); setEditing(null); },
    onError: (e) => setFormError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (config.archive) unwrap(await supabase.from(config.table).update({ [config.archive.column]: config.archive.value }).eq('id', id).select('id').single());
      else unwrap(await supabase.from(config.table).delete().eq('id', id).select('id'));
    },
    onSuccess: async () => { await invalidate(config.table); toast(`${config.singular} ${config.archive ? 'archived' : 'deleted'}`); },
    onError: (e) => toast(errorMessage(e), 'danger'),
  });
  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = [...(rows.data ?? [])];
      const [item] = list.splice(index, 1);
      list.splice(index + dir, 0, item);
      await Promise.all(list.map((r, i) => (r.sort_order === i + 1 ? null : supabase.from(config.table).update({ sort_order: i + 1 }).eq('id', r.id))));
    },
    onSuccess: () => invalidate(config.table),
    onError: (e) => toast(errorMessage(e), 'danger'),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !config.searchKeys) return rows.data ?? [];
    return (rows.data ?? []).filter((r) => config.searchKeys!.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
  }, [rows.data, search, config.searchKeys]);

  const columns: Column<Row>[] = [
    ...config.columns,
    {
      key: '_actions', label: '', className: 'text-right',
      render: (row) => {
        const index = (rows.data ?? []).findIndex((r) => r.id === row.id);
        return (
          <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {config.reorderable && !search && (<>
              <button type="button" aria-label="Move up" disabled={index === 0 || move.isPending} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30" onClick={() => move.mutate({ index, dir: -1 })}><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label="Move down" disabled={index === (rows.data?.length ?? 0) - 1 || move.isPending} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30" onClick={() => move.mutate({ index, dir: 1 })}><ArrowDown className="h-4 w-4" /></button>
            </>)}
            <button type="button" aria-label={`Edit ${config.singular}`} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" onClick={() => { setFormError(''); setEditing({ id: row.id, form: toForm(config.fields, row) }); }}><Pencil className="h-4 w-4" /></button>
            <button type="button" aria-label={`${config.archive ? 'Archive' : 'Delete'} ${config.singular}`} className="grid h-8 w-8 place-items-center rounded-full text-rose-300 hover:bg-rose-400/15"
              onClick={async () => { if (await confirm(config.deleteLabel ?? `${config.archive ? 'Archive' : 'Delete'} this ${config.singular.toLowerCase()}? ${config.archive ? 'It will be hidden from customers but kept for past orders.' : 'This cannot be undone.'}`)) remove.mutate(row.id); }}><Trash2 className="h-4 w-4" /></button>
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">{config.searchKeys && <SearchBox value={search} onChange={setSearch} />}{toolbar}</div>
        <Btn size="sm" onClick={() => { setFormError(''); setEditing({ id: null, form: toForm(config.fields, config.defaults) }); }}><Plus className="h-4 w-4" aria-hidden />Add {config.singular.toLowerCase()}</Btn>
      </div>
      {rows.isLoading ? <Spinner /> : rows.isError ? <Notice tone="danger">{errorMessage(rows.error)}</Notice> : (
        <DataTable rows={filtered} columns={columns} onRowClick={(row) => { setFormError(''); setEditing({ id: row.id, form: toForm(config.fields, row) }); }}
          empty={<EmptyState title={config.empty ?? `No ${config.singular.toLowerCase()}s yet`} />} />
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`${editing?.id ? 'Edit' : 'Add'} ${config.singular.toLowerCase()}`} wide
        footer={<><Btn variant="secondary" onClick={() => setEditing(null)}>Cancel</Btn><Btn loading={save.isPending} onClick={() => { setFormError(''); save.mutate(); }}>Save</Btn></>}>
        {editing && <FormFields fields={config.fields} form={editing.form} setForm={(u) => setEditing((e) => (e ? { ...e, form: u(e.form) } : e))} />}
        {formError && <Notice tone="danger" className="mt-4">{formError}</Notice>}
      </Modal>
      {confirmNode}
    </div>
  );
}
