// Multi-step ordering flow. Prices shown here are estimates for display only — the server
// recomputes everything from the database when the order is submitted.
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Copy, Download, FileText, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import { BUDGET_RANGES, manilaToday } from '@shared/constants';
import { formatPHP } from '@shared/money';
import { buildOrderItems } from '@shared/pricing';
import { customerSchema, requirementsSchema } from '@shared/schemas';
import { api, ApiError, errorMessage } from '@/lib/api';
import { deliveryLabel, isSupabaseConfigured, useAddons, usePackages, useServices } from '@/lib/catalog';
import { saveOrder } from '@/lib/savedOrders';
import { copyText, cx } from '@/lib/utils';
import { Btn, Field, Glass, Notice, Spinner } from '@/ui';
import { SiteLink } from '../chrome';
import { SiteIcon } from '../icons';
import { useSite } from '../SiteContext';
import { Turnstile } from '../Turnstile';

type Requirements = z.input<typeof requirementsSchema>;
type Customer = z.input<typeof customerSchema>;

interface Quote {
  items: { kind: string; name: string; quantity: number; total_centavos: number }[];
  subtotal_centavos: number;
  discount_centavos: number;
  discount_label: string | null;
  total_centavos: number;
  code_message: string | null;
}
interface Created {
  reference: string;
  tracking_url: string;
  tracking_expires_at: string;
  summary_url: string | null;
  email_sent: boolean;
  totals: { subtotal_centavos: number; discount_centavos: number; discount_label: string | null; total_centavos: number };
}

function Stepper({ labels, step }: { labels: string[]; step: number }) {
  return (
    <ol className="mb-8 flex items-center gap-1.5 sm:gap-2" aria-label="Order progress">
      {labels.map((label, i) => (
        <li key={i} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2" aria-current={i === step ? 'step' : undefined}>
          <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors',
            i < step ? 'border-accent bg-accent text-[#fff]' : i === step ? 'border-accent bg-accent/20 text-ink' : 'border-white/15 bg-white/5 text-muted')}>
            {i < step ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
          </span>
          <span className={cx('hidden truncate text-sm md:block', i === step ? 'font-medium text-ink' : 'text-muted')}>{label}</span>
          {i < labels.length - 1 && <span className={cx('h-px min-w-2 flex-1', i < step ? 'bg-accent' : 'bg-white/15')} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={cx('flex items-baseline justify-between gap-4', strong ? 'text-lg font-semibold' : 'text-sm')}>
    <span className={strong ? '' : 'text-muted'}>{label}</span><span className="text-right">{value}</span>
  </div>
);
const Detail = ({ label, value }: { label: string; value: string }) =>
  value ? <div className="min-w-0"><dt className="text-xs uppercase tracking-wider text-muted">{label}</dt><dd className="mt-0.5 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{value}</dd></div> : null;

export function OrderFormSection() {
  const { site, editing } = useSite();
  const f = site.forms.order;
  const [params] = useSearchParams();
  const services = useServices();
  const addons = useAddons();
  const packages = usePackages();
  const started = useRef(Date.now());
  const topRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [promo, setPromo] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  // preselect ?service=slug
  useEffect(() => {
    const slug = params.get('service');
    if (!serviceId && slug && services.data) {
      const match = services.data.find((s) => s.slug === slug);
      if (match) setServiceId(match.id);
    }
  }, [params, services.data, serviceId]);

  const service = services.data?.find((s) => s.id === serviceId) ?? null;
  const servicePackages = useMemo(() => (packages.data ?? []).filter((p) => p.service_id === serviceId), [packages.data, serviceId]);
  const availableAddons = useMemo(() => (addons.data ?? []).filter((a) => a.service_id === null || a.service_id === serviceId), [addons.data, serviceId]);
  const pkg = servicePackages.find((p) => p.id === packageId) ?? null;
  const chosenAddons = availableAddons.filter((a) => addonIds.includes(a.id));

  const estimate = useMemo(() => {
    if (!service) return null;
    try {
      return buildOrderItems(service, pkg, chosenAddons);
    } catch {
      return null;
    }
  }, [service, pkg, chosenAddons]);

  const selection = { service_id: serviceId, package_id: packageId, addon_ids: addonIds, promo_code: promo.trim() };

  const quote = useQuery({
    queryKey: ['quote', selection, customer?.email],
    enabled: step === 3 && !!serviceId && isSupabaseConfigured && !editing,
    retry: false,
    queryFn: () => api<Quote>('order-quote', { ...selection, email: customer?.email ?? '' }),
  });

  const submit = useMutation({
    mutationFn: () => api<Created>('order-create', {
      selection, project: requirements, customer,
      antispam: { website: honeypot, elapsed_ms: Date.now() - started.current, turnstile_token: captcha },
    }),
    onSuccess: (data) => {
      setCreated(data);
      saveOrder({ reference: data.reference, url: data.tracking_url, project: requirements?.name ?? '', created_at: new Date().toISOString() });
      setStep(4);
    },
  });

  const go = (n: number) => {
    setStep(n);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const reqForm = useForm<Requirements>({
    resolver: zodResolver(requirementsSchema),
    defaultValues: { name: '', description: '', features: '', preferred_design: '', reference_websites: '', target_deadline: '', budget_range: '', additional_notes: '' },
  });
  const custForm = useForm<Customer>({
    resolver: zodResolver(customerSchema),
    defaultValues: { full_name: '', email: '', phone: '', facebook: '', privacy_consent: false as unknown as true },
  });
  const re = reqForm.formState.errors;
  const ce = custForm.formState.errors;

  const subtotal = quote.data?.subtotal_centavos ?? estimate?.subtotal ?? 0;
  const discount = quote.data?.discount_centavos ?? 0;
  const total = quote.data?.total_centavos ?? subtotal;
  const lines = quote.data?.items ?? estimate?.items.map((i) => ({ kind: i.kind, name: i.name, quantity: i.quantity, total_centavos: i.unit_price_centavos * i.quantity })) ?? [];
  const submitError = submit.error instanceof ApiError ? submit.error : null;

  return (
    <div ref={topRef} className="mx-auto max-w-4xl scroll-mt-28 text-left">
      {!isSupabaseConfigured && <Notice tone="warn" title="Ordering is not connected yet" className="mb-6">The site owner still needs to connect the database. You can browse the form, but orders cannot be submitted.</Notice>}
      <Stepper labels={f.stepLabels} step={step} />
      <Glass className="relative overflow-hidden p-5 sm:p-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.25 }}>
            {/* ── Step 1: service ── */}
            {step === 0 && (
              <div>
                <h2 className="text-2xl font-semibold">{f.serviceHeading}</h2>
                <p className="mt-1.5 text-muted">{f.serviceHelp}</p>
                {services.isLoading ? <Spinner label="Loading services" /> : services.isError ? <Notice tone="danger" className="mt-5">Services could not be loaded. Please refresh the page.</Notice> : (
                  <div role="radiogroup" aria-label="Service" className="mt-6 grid gap-3 sm:grid-cols-2">
                    {services.data!.map((s) => {
                      const active = s.id === serviceId;
                      return (
                        <button key={s.id} type="button" role="radio" aria-checked={active}
                          onClick={() => { setServiceId(s.id); setPackageId(null); setAddonIds((ids) => ids.filter((id) => (addons.data ?? []).some((a) => a.id === id && (a.service_id === null || a.service_id === s.id)))); }}
                          className={cx('glass-soft flex items-start gap-3 p-4 text-left transition-all', active ? '!border-accent !bg-accent/15 shadow-[0_0_0_4px_color-mix(in_srgb,var(--dm-accent)_18%,transparent)]' : 'hover:!border-white/30')}>
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-accent"><SiteIcon name={s.icon} className="h-5 w-5" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{s.name}</span>
                            <span className="mt-0.5 block text-sm text-muted">{s.short_description}</span>
                            <span className="mt-2 block text-sm"><span className="text-muted">Starts at </span><span className="font-semibold">{formatPHP(s.starting_price_centavos)}</span>{deliveryLabel(s.delivery_days_min, s.delivery_days_max) && <span className="text-muted"> · {deliveryLabel(s.delivery_days_min, s.delivery_days_max)}</span>}</span>
                          </span>
                          <span className={cx('mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border', active ? 'border-accent bg-accent' : 'border-white/30')}>{active && <Check className="h-3 w-3 text-[#fff]" aria-hidden />}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {service && servicePackages.length > 0 && (
                  <fieldset className="mt-8">
                    <legend className="text-lg font-semibold">{f.packageHeading}</legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {[{ id: null as string | null, name: 'Standard', description: 'The base service at its starting price.', price_centavos: service.starting_price_centavos }, ...servicePackages].map((p) => (
                        <label key={p.id ?? 'base'} className={cx('glass-soft flex cursor-pointer items-start gap-3 p-4', packageId === p.id && '!border-accent !bg-accent/15')}>
                          <input type="radio" name="package" className="mt-1 accent-[var(--dm-accent)]" checked={packageId === p.id} onChange={() => setPackageId(p.id)} />
                          <span className="min-w-0 flex-1"><span className="block font-medium">{p.name}</span><span className="block text-sm text-muted">{p.description}</span></span>
                          <span className="shrink-0 font-semibold">{formatPHP(p.price_centavos)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {service && availableAddons.length > 0 && (
                  <fieldset className="mt-8">
                    <legend className="text-lg font-semibold">{f.addonsHeading}</legend>
                    <div className="mt-3 grid gap-2.5">
                      {availableAddons.map((a) => {
                        const on = addonIds.includes(a.id);
                        return (
                          <label key={a.id} className={cx('glass-soft flex cursor-pointer items-start gap-3 p-3.5', on && '!border-accent/70 !bg-accent/10')}>
                            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--dm-accent)]" checked={on} onChange={() => setAddonIds((ids) => (on ? ids.filter((i) => i !== a.id) : [...ids, a.id]))} />
                            <span className="min-w-0 flex-1"><span className="block font-medium">{a.name}</span>{a.description && <span className="block text-sm text-muted">{a.description}</span>}</span>
                            <span className="shrink-0 font-semibold">+{formatPHP(a.price_centavos)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                {service && (
                  <div className="mt-8 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field label={f.promoLabel}>{(p) => <input {...p} className="field uppercase placeholder:normal-case" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase().slice(0, 40))} placeholder="e.g. WELCOME10" autoComplete="off" />}</Field>
                    <div className="glass-soft px-5 py-3 text-right"><p className="text-xs uppercase tracking-wider text-muted">Estimated subtotal</p><p className="text-2xl font-semibold">{formatPHP(estimate?.subtotal ?? 0)}</p></div>
                  </div>
                )}
                <div className="mt-8 flex justify-end"><Btn disabled={!service} onClick={() => go(1)}>Continue <ArrowRight className="h-4 w-4" aria-hidden /></Btn></div>
              </div>
            )}

            {/* ── Step 2: requirements ── */}
            {step === 1 && (
              <form noValidate onSubmit={reqForm.handleSubmit((v) => { setRequirements(v); go(2); })}>
                <h2 className="text-2xl font-semibold">{f.requirementsHeading}</h2>
                <p className="mt-1.5 text-muted">{f.requirementsHelp}</p>
                <div className="mt-6 grid gap-4">
                  <Field label={f.labels.projectName} required error={re.name?.message}>{(p) => <input {...p} className="field" maxLength={200} {...reqForm.register('name')} />}</Field>
                  <Field label={f.labels.projectDescription} required error={re.description?.message} hint="What is it for? Who will use it?">{(p) => <textarea {...p} className="field" maxLength={5000} {...reqForm.register('description')} />}</Field>
                  <Field label={f.labels.features} error={re.features?.message} hint="List the features you need, one per line.">{(p) => <textarea {...p} className="field" maxLength={5000} {...reqForm.register('features')} />}</Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={f.labels.preferredDesign} error={re.preferred_design?.message} hint="Colours, mood, style…">{(p) => <textarea {...p} className="field !min-h-[88px]" maxLength={2000} {...reqForm.register('preferred_design')} />}</Field>
                    <Field label={f.labels.referenceWebsites} error={re.reference_websites?.message} hint="Links to sites or apps you like.">{(p) => <textarea {...p} className="field !min-h-[88px]" maxLength={2000} {...reqForm.register('reference_websites')} />}</Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={f.labels.deadline} error={re.target_deadline?.message}>{(p) => <input {...p} type="date" min={manilaToday()} className="field" {...reqForm.register('target_deadline')} />}</Field>
                    <Field label={f.labels.budget} error={re.budget_range?.message}>{(p) => (
                      <select {...p} className="field" {...reqForm.register('budget_range')}><option value="">Select a range</option>{BUDGET_RANGES.map((b) => <option key={b} value={b}>{b}</option>)}</select>
                    )}</Field>
                  </div>
                  <Field label={f.labels.notes} error={re.additional_notes?.message}>{(p) => <textarea {...p} className="field !min-h-[88px]" maxLength={5000} {...reqForm.register('additional_notes')} />}</Field>
                </div>
                <div className="mt-8 flex justify-between gap-3"><Btn variant="secondary" onClick={() => go(0)}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Btn><Btn type="submit">Continue <ArrowRight className="h-4 w-4" aria-hidden /></Btn></div>
              </form>
            )}

            {/* ── Step 3: customer ── */}
            {step === 2 && (
              <form noValidate onSubmit={custForm.handleSubmit((v) => { setCustomer(v); go(3); })}>
                <h2 className="text-2xl font-semibold">{f.customerHeading}</h2>
                <Notice tone="info" className="mt-4"><span className="flex gap-2"><ShieldCheck className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden />{f.contactNotice}</span></Notice>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Field label={f.labels.fullName} required error={ce.full_name?.message}>{(p) => <input {...p} className="field" autoComplete="name" maxLength={200} {...custForm.register('full_name')} />}</Field>
                  <Field label={f.labels.email} required error={ce.email?.message}>{(p) => <input {...p} className="field" type="email" inputMode="email" autoComplete="email" maxLength={254} {...custForm.register('email')} />}</Field>
                  <Field label={f.labels.phone} required error={ce.phone?.message} hint="Philippine mobile number, e.g. 0917 123 4567">{(p) => <input {...p} className="field" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} {...custForm.register('phone')} />}</Field>
                  <Field label={f.labels.facebook} required error={ce.facebook?.message} hint="Profile link or the name you use on Facebook. Never share your password.">{(p) => <input {...p} className="field" maxLength={300} autoComplete="off" {...custForm.register('facebook')} />}</Field>
                </div>
                <label className="mt-6 flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--dm-accent)]" aria-invalid={ce.privacy_consent ? true : undefined} {...custForm.register('privacy_consent')} />
                  <span className="text-sm leading-relaxed text-ink/90">{f.consentLabel} <SiteLink href="/privacy-policy" className="text-accent underline underline-offset-2" target="_blank">Read the Privacy Policy</SiteLink></span>
                </label>
                {ce.privacy_consent && <p className="mt-1.5 text-sm text-rose-300" role="alert">{ce.privacy_consent.message}</p>}
                <div className="mt-8 flex justify-between gap-3"><Btn variant="secondary" onClick={() => go(1)}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Btn><Btn type="submit">Review order <ArrowRight className="h-4 w-4" aria-hidden /></Btn></div>
              </form>
            )}

            {/* ── Step 4: review ── */}
            {step === 3 && requirements && customer && (
              <div>
                <h2 className="text-2xl font-semibold">{f.reviewHeading}</h2>
                <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
                  <div className="space-y-5">
                    <div className="glass-soft p-5">
                      <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Project details</h3><button type="button" className="text-sm text-accent hover:underline" onClick={() => go(1)}>Edit</button></div>
                      <dl className="grid gap-3">
                        <Detail label={f.labels.projectName} value={requirements.name} />
                        <Detail label={f.labels.projectDescription} value={requirements.description} />
                        <Detail label={f.labels.features} value={requirements.features ?? ''} />
                        <Detail label={f.labels.preferredDesign} value={requirements.preferred_design ?? ''} />
                        <Detail label={f.labels.referenceWebsites} value={requirements.reference_websites ?? ''} />
                        <Detail label={f.labels.deadline} value={requirements.target_deadline ?? ''} />
                        <Detail label={f.labels.budget} value={requirements.budget_range ?? ''} />
                        <Detail label={f.labels.notes} value={requirements.additional_notes ?? ''} />
                      </dl>
                    </div>
                    <div className="glass-soft p-5">
                      <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Your information</h3><button type="button" className="text-sm text-accent hover:underline" onClick={() => go(2)}>Edit</button></div>
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <Detail label={f.labels.fullName} value={customer.full_name} />
                        <Detail label={f.labels.email} value={customer.email} />
                        <Detail label={f.labels.phone} value={customer.phone} />
                        <Detail label={f.labels.facebook} value={customer.facebook} />
                      </dl>
                    </div>
                  </div>
                  <div className="glass-soft h-fit p-5">
                    <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Order summary</h3><button type="button" className="text-sm text-accent hover:underline" onClick={() => go(0)}>Edit</button></div>
                    {quote.isLoading ? <Spinner label="Calculating" /> : (
                      <>
                        <ul className="space-y-2 border-b border-white/10 pb-3">
                          {lines.map((l, i) => (
                            <li key={i} className="flex justify-between gap-3 text-sm"><span className="min-w-0">{l.kind === 'addon' && <span className="text-muted">+ </span>}{l.name}</span><span className="shrink-0">{formatPHP(l.total_centavos)}</span></li>
                          ))}
                        </ul>
                        <div className="space-y-2 pt-3">
                          <Row label="Subtotal" value={formatPHP(subtotal)} />
                          {discount > 0 && <Row label={`Discount${quote.data?.discount_label ? ` — ${quote.data.discount_label}` : ''}`} value={`− ${formatPHP(discount)}`} />}
                          <Row label="Estimated total" value={formatPHP(total)} strong />
                        </div>
                        {discount === 0 && <p className="mt-2 text-xs text-muted">No discount applied.</p>}
                        {quote.data?.code_message && <Notice tone="warn" className="mt-3">{quote.data.code_message} <button type="button" className="underline" onClick={() => setPromo('')}>Remove code</button></Notice>}
                        {quote.isError && <Notice tone="warn" className="mt-3">We could not confirm the price right now. {errorMessage(quote.error)}</Notice>}
                        <p className="mt-4 text-xs leading-relaxed text-muted">{f.estimateNote}</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="absolute -left-[9999px]" aria-hidden><label>Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label></div>
                <div className="mt-5"><Turnstile onToken={setCaptcha} /></div>
                {submitError && <Notice tone="danger" className="mt-5" title={submitError.message}>{submitError.fields && <ul className="list-disc pl-5">{Object.values(submitError.fields).map((m, i) => <li key={i}>{m}</li>)}</ul>}</Notice>}
                <div className="mt-8 flex justify-between gap-3">
                  <Btn variant="secondary" onClick={() => go(2)}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Btn>
                  <Btn loading={submit.isPending} disabled={editing || !isSupabaseConfigured || quote.isLoading || !!quote.data?.code_message} onClick={() => submit.mutate()}>{f.submitLabel}</Btn>
                </div>
              </div>
            )}

            {/* ── Step 5: confirmation ── */}
            {step === 4 && created && (
              <div className="text-center">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }} className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400/20 text-emerald-300"><Check className="h-8 w-8" aria-hidden /></motion.span>
                <h2 className="mt-5 text-3xl font-semibold">{f.confirmationTitle}</h2>
                <p className="mt-2 text-muted">Order reference</p>
                <p className="font-mono text-2xl font-semibold tracking-wider" data-testid="order-reference">{created.reference}</p>
                <p className="mt-1"><span className="rounded-full border border-amber-300/30 bg-amber-400/15 px-3 py-0.5 text-sm text-amber-200">Pending Review</span></p>
                <p className="mx-auto mt-5 max-w-xl leading-relaxed text-ink/85">{f.confirmationMessage}</p>
                <div className="glass-soft mx-auto mt-6 max-w-xl p-4 text-left">
                  <p className="text-sm font-medium">Your private tracking link</p>
                  <p className="mt-1 break-all rounded-xl bg-black/40 p-3 font-mono text-xs text-ink/80" data-testid="tracking-url">{created.tracking_url}</p>
                  <p className="mt-2 text-xs text-muted">Anyone with this link can view your order, so keep it private. {created.email_sent ? 'We also emailed it to you.' : 'Copy it now — it will not be shown again.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Btn size="sm" variant="secondary" onClick={async () => { setCopied(await copyText(created.tracking_url)); }}><Copy className="h-4 w-4" aria-hidden />{copied ? 'Copied!' : 'Copy link'}</Btn>
                    <a className="btn btn-sm btn-secondary" href={created.tracking_url}>Open tracking page</a>
                  </div>
                </div>
                <div className="mx-auto mt-4 max-w-xl space-y-1.5 text-left"><Row label="Estimated total" value={formatPHP(created.totals.total_centavos)} strong />{created.totals.discount_centavos > 0 && <Row label={`Discount applied — ${created.totals.discount_label ?? ''}`} value={`− ${formatPHP(created.totals.discount_centavos)}`} />}</div>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {created.summary_url
                    ? <a className="btn btn-md btn-primary btn-style-gradient" href={created.summary_url} target="_blank" rel="noopener noreferrer" download><Download className="h-4 w-4" aria-hidden />Download order summary (PDF)</a>
                    : <span className="flex items-center gap-2 text-sm text-muted"><FileText className="h-4 w-4" aria-hidden />Your order summary PDF will be available on the tracking page.</span>}
                </div>
                <p className="mt-3 text-xs text-muted">The order summary is not a payment receipt. No payment has been made yet.</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Glass>
    </div>
  );
}
