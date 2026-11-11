// Payment instructions + proof upload. Uploading a proof never marks anything as paid.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Download, QrCode, Upload } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PAYMENT_TYPES, PAYMENT_TYPE_LABELS, PROOF_MAX_BYTES, PROOF_MIME_TYPES, type PaymentType, type ProofMime } from '@shared/constants';
import { formatPHP } from '@shared/money';
import { safeImage } from '@shared/site/schema';
import { api, ApiError, errorMessage } from '@/lib/api';
import { usePaymentMethods } from '@/lib/catalog';
import { copyText, cx, fileToBase64 } from '@/lib/utils';
import { Badge, Btn, Field, Glass, Notice, Spinner } from '@/ui';
import { SiteLink } from '../chrome';
import { useSite } from '../SiteContext';
import { useTrackData } from './TrackOrder';

export function PaymentSection() {
  const { site, editing } = useSite();
  const f = site.forms.payment;
  const [params] = useSearchParams();
  const token = editing ? null : params.get('t');
  const methods = usePaymentMethods();
  const track = useTrackData(token);
  const qc = useQueryClient();
  const [methodId, setMethodId] = useState<string | null>(null);
  const [type, setType] = useState<PaymentType>('deposit');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [copied, setCopied] = useState(false);

  const method = methods.data?.find((m) => m.id === methodId) ?? null;
  const qr = safeImage(method?.qr_image_url);

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new ApiError(422, 'VALIDATION_FAILED', 'Please attach your proof of payment.', { file: 'Attach a JPG, PNG or PDF file.' });
      return api<{ id: string; status: string; acknowledgment_url: string | null }>('payment-submit', {
        token, payment_method_id: methodId, payment_type: type, amount, transaction_reference: reference,
        file: { name: file.name, type: file.type, data: await fileToBase64(file) },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['track', token] }),
  });
  const fields = submit.error instanceof ApiError ? submit.error.fields ?? {} : {};

  const pickFile = (picked: File | null) => {
    setFileError('');
    if (picked && !(PROOF_MIME_TYPES as readonly string[]).includes(picked.type as ProofMime)) {
      setFile(null);
      return setFileError('Only JPG, PNG or PDF files are accepted.');
    }
    if (picked && picked.size > PROOF_MAX_BYTES) {
      setFile(null);
      return setFileError('The file is larger than 4 MB. Please choose a smaller file.');
    }
    setFile(picked);
  };

  if (submit.isSuccess) {
    return (
      <Glass className="mx-auto max-w-2xl p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sky-400/20 text-sky-300"><Check className="h-7 w-7" aria-hidden /></span>
        <h2 className="mt-4 text-2xl font-semibold">{f.successTitle}</h2>
        <p className="mt-1"><Badge tone="info">Proof Submitted — awaiting verification</Badge></p>
        <p className="mx-auto mt-4 max-w-lg leading-relaxed text-ink/85">{f.successMessage}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {submit.data.acknowledgment_url && <a className="btn btn-md btn-secondary" href={submit.data.acknowledgment_url} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" aria-hidden />Download acknowledgment (PDF)</a>}
          <a className="btn btn-md btn-primary btn-style-gradient" href={`/track-order?t=${token}`}>Back to my order</a>
        </div>
        <p className="mt-3 text-xs text-muted">The acknowledgment confirms we received your proof. It is not a payment receipt.</p>
      </Glass>
    );
  }

  const order = track.data?.order;
  return (
    <div className="mx-auto max-w-5xl space-y-6 text-left">
      <p className="mx-auto max-w-3xl text-center text-muted">{f.intro}</p>
      {token && track.isError && <Notice tone="danger" title="This payment link is not valid">{errorMessage(track.error)} <SiteLink href="/track-order" className="underline">Request a new link</SiteLink></Notice>}
      {order && (
        <Glass className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div><p className="text-sm text-muted">Paying for order</p><p className="font-mono text-lg font-semibold">{order.reference}</p><p className="text-sm text-ink/80">{order.project_name}</p></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">{order.quoted_total_centavos !== null ? 'Quoted total' : 'Estimated total'}</dt><dd className="text-right font-medium">{formatPHP(order.quoted_total_centavos ?? order.estimate_centavos)}</dd>
            {order.deposit_due_centavos !== null && (<><dt className="text-muted">Deposit to start</dt><dd className="text-right font-medium">{formatPHP(order.deposit_due_centavos)}</dd></>)}
            <dt className="text-muted">Remaining balance</dt><dd className="text-right font-semibold">{formatPHP(order.balance_centavos)}</dd>
          </dl>
        </Glass>
      )}
      {order && order.quoted_total_centavos === null && <Notice tone="warn">Your quotation is not final yet. Please wait for our confirmation of the amount before sending a payment.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Glass className="p-6">
          <h2 className="text-lg font-semibold">1. Choose a payment method</h2>
          {methods.isLoading ? <Spinner /> : (methods.data ?? []).length === 0 ? (
            <Notice tone="info" className="mt-4">Payment details are not published yet. Please contact us and we will send them to you directly.</Notice>
          ) : (
            <div role="radiogroup" aria-label="Payment method" className="mt-4 grid gap-2.5">
              {methods.data!.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={m.id === methodId} onClick={() => setMethodId(m.id)}
                  className={cx('glass-soft flex items-center gap-3 p-4 text-left', m.id === methodId ? '!border-accent !bg-accent/15' : 'hover:!border-white/30')}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-sm font-bold uppercase text-accent">{m.name.slice(0, 2)}</span>
                  <span className="min-w-0 flex-1 font-medium">{m.name}</span>
                  <span className={cx('grid h-5 w-5 place-items-center rounded-full border', m.id === methodId ? 'border-accent bg-accent' : 'border-white/30')}>{m.id === methodId && <Check className="h-3 w-3 text-white" aria-hidden />}</span>
                </button>
              ))}
            </div>
          )}
          {method && (
            <div className="mt-6 border-t border-white/10 pt-5">
              <h3 className="font-semibold">2. Pay using {method.name}</h3>
              <dl className="mt-3 space-y-2 text-sm">
                {method.account_holder && <div className="flex justify-between gap-4"><dt className="text-muted">Account name</dt><dd className="text-right font-medium">{method.account_holder}</dd></div>}
                {method.account_number && (
                  <div className="flex items-center justify-between gap-4"><dt className="text-muted">Account number</dt>
                    <dd className="flex items-center gap-2 font-mono font-semibold">{method.account_number}
                      <button type="button" aria-label="Copy account number" className="grid h-7 w-7 place-items-center rounded-full bg-white/10 hover:bg-white/20" onClick={async () => { setCopied(await copyText(method.account_number)); setTimeout(() => setCopied(false), 2000); }}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
                    </dd>
                  </div>
                )}
              </dl>
              {method.instructions && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/85">{method.instructions}</p>}
              {qr ? (
                <div className="mt-4 text-center">
                  <img src={qr} alt={`${method.name} QR code`} className="mx-auto w-full max-w-[240px] rounded-2xl bg-white p-2" />
                  <a href={qr} download target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary mt-3"><Download className="h-4 w-4" aria-hidden />View / download QR code</a>
                </div>
              ) : <p className="mt-4 flex items-center gap-2 text-xs text-muted"><QrCode className="h-4 w-4" aria-hidden />No QR code for this method — use the account details above.</p>}
            </div>
          )}
        </Glass>

        <Glass className="p-6">
          <h2 className="text-lg font-semibold">3. Upload your proof of payment</h2>
          {!token ? (
            <Notice tone="info" className="mt-4" title="Open this page from your tracking link">To attach a payment to your order securely, open the Payment button on your private tracking page. <SiteLink href="/track-order" className="underline">Go to Track Order</SiteLink></Notice>
          ) : track.isLoading ? <Spinner /> : !order ? null : (
            <form className="mt-4 grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
              <Field label="What is this payment for?" required>{(p) => (
                <select {...p} className="field" value={type} onChange={(e) => setType(e.target.value as PaymentType)}>{PAYMENT_TYPES.map((t) => <option key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</option>)}</select>
              )}</Field>
              <Field label="Amount you sent (₱)" error={fields.amount} hint="Optional, helps us verify faster.">{(p) => <input {...p} className="field" inputMode="decimal" placeholder="e.g. 2,500.00" value={amount} onChange={(e) => setAmount(e.target.value)} maxLength={20} />}</Field>
              <Field label="Transaction / reference number" required error={fields.transaction_reference} hint="Shown on your GCash, Maya or bank confirmation.">{(p) => <input {...p} className="field font-mono" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} autoComplete="off" />}</Field>
              <Field label="Proof of payment" required error={fileError || fields.file || fields['file.type']} hint={f.proofHelp}>{(p) => (
                <label className={cx('glass-soft flex cursor-pointer flex-col items-center gap-2 border-dashed p-5 text-center hover:!border-accent/60', file && '!border-accent/60')}>
                  <Upload className="h-6 w-6 text-accent" aria-hidden />
                  <span className="max-w-full truncate text-sm font-medium">{file ? file.name : 'Choose a file'}</span>
                  <span className="text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'JPG, PNG or PDF · up to 4 MB'}</span>
                  <input {...p} type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                </label>
              )}</Field>
              {submit.isError && <Notice tone="danger">{errorMessage(submit.error)}</Notice>}
              <Btn type="submit" loading={submit.isPending} disabled={!methodId || !file || reference.trim().length < 4}>Submit for verification</Btn>
              <p className="text-xs text-muted">Your proof is stored privately and reviewed by our team. Submitting it does not mark your order as paid.</p>
            </form>
          )}
        </Glass>
      </div>
    </div>
  );
}
