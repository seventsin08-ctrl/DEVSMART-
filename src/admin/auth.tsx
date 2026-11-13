// Admin authentication: Supabase Auth (email + password) → owner allowlist → mandatory TOTP MFA.
// The UI gate is a convenience only; the real enforcement is RLS + is_admin() in the database
// and requireAdmin() in the serverless functions.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { BrandMark } from '@/site/chrome';
import { Btn, Field, Glass, Notice, PageLoader } from '@/ui';

export interface AdminStatus { allowlisted: boolean; role: string | null; aal: string; is_admin: boolean }

export function useSession(): { session: Session | null; loading: boolean } {
  const [state, setState] = useState<{ session: Session | null; loading: boolean }>({ session: null, loading: true });
  useEffect(() => {
    if (!supabase) return setState({ session: null, loading: false });
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}

function Shell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="dm-backdrop dm-animated" aria-hidden><div className="dm-blob dm-blob-a" /><div className="dm-blob dm-blob-b" /></div>
      <Glass className="relative z-10 w-full max-w-md p-7">
        <BrandMark />
        <h1 className="mt-6 text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Glass>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    // Deliberately generic: never reveal whether the e-mail exists.
    if (error) setError(/rate|too many/i.test(error.message) ? 'Too many attempts. Please wait a few minutes.' : 'Incorrect email or password.');
    setBusy(false);
  };
  return (
    <Shell title="Admin sign in" subtitle="Authorised DevMart staff only.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Email">{(p) => <input {...p} className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
        <Field label="Password">{(p) => <input {...p} className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Btn type="submit" loading={busy} disabled={!email || !password}><KeyRound className="h-4 w-4" aria-hidden />Sign in</Btn>
        <p className="text-center text-xs text-muted">There is no public registration. Accounts are created by the owner in Supabase.</p>
      </form>
    </Shell>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="6-digit code from your authenticator app">{(p) => (
      <input {...p} className="field text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
    )}</Field>
  );
}

function Mfa({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'loading' | 'enroll' | 'verify'>('loading');
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase!.auth.mfa.listFactors();
      if (cancelled) return;
      if (error) return setError(error.message);
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        return setMode('verify');
      }
      // clear abandoned enrolments, then start a fresh one
      for (const stale of data.all.filter((f) => f.status !== 'verified')) await supabase!.auth.mfa.unenroll({ factorId: stale.id });
      const enrolled = await supabase!.auth.mfa.enroll({ factorType: 'totp', friendlyName: `DevMart ${new Date().toISOString().slice(0, 10)}` });
      if (cancelled) return;
      if (enrolled.error) return setError(enrolled.error.message);
      setFactorId(enrolled.data.id);
      setQr(enrolled.data.totp.qr_code);
      setSecret(enrolled.data.totp.secret);
      setMode('enroll');
    })();
    return () => { cancelled = true; };
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) {
      setCode('');
      return setError('That code is not correct. Check your authenticator app and try again.');
    }
    onDone();
  };

  if (mode === 'loading') return <Shell title="Two-step verification">{error ? <Notice tone="danger">{error}</Notice> : <PageLoader />}</Shell>;
  return (
    <Shell title={mode === 'enroll' ? 'Set up two-step verification' : 'Two-step verification'}
      subtitle={mode === 'enroll' ? 'Required for all admin accounts. Scan the QR code with Google Authenticator, Authy, 1Password or a similar app.' : 'Enter the current code from your authenticator app.'}>
      <form onSubmit={verify} className="grid gap-4" noValidate>
        {mode === 'enroll' && (
          <div className="text-center">
            <img src={qr} alt="Authenticator QR code" className="mx-auto h-48 w-48 rounded-2xl bg-[#fff] p-2" />
            <p className="mt-3 text-xs text-muted">Can’t scan? Enter this key manually:</p>
            <p className="mt-1 break-all rounded-xl bg-black/40 p-2 font-mono text-xs" data-testid="totp-secret">{secret}</p>
          </div>
        )}
        <CodeInput value={code} onChange={setCode} />
        {error && <Notice tone="danger">{error}</Notice>}
        <Btn type="submit" loading={busy} disabled={code.length !== 6}><ShieldCheck className="h-4 w-4" aria-hidden />Verify</Btn>
        <Btn variant="ghost" size="sm" onClick={() => supabase!.auth.signOut()}><LogOut className="h-4 w-4" aria-hidden />Sign out</Btn>
      </form>
    </Shell>
  );
}

/** Renders children only for an allowlisted, MFA-verified admin. */
export function AdminGate({ children }: { children: (status: AdminStatus, session: Session) => ReactNode }) {
  const { session, loading } = useSession();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['admin-status', session?.user.id, session?.access_token],
    enabled: !!session,
    queryFn: async (): Promise<AdminStatus> => {
      const { data, error } = await supabase!.rpc('admin_status');
      if (error) throw new Error(error.message);
      return data as AdminStatus;
    },
  });

  if (!isSupabaseConfigured) {
    return <Shell title="Backend not configured" subtitle="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy. See the README for setup steps."><Notice tone="warn">The admin dashboard needs a Supabase project.</Notice></Shell>;
  }
  if (loading || (session && status.isLoading)) return <PageLoader />;
  if (!session) return <Login />;
  if (status.isError) return <Shell title="Something went wrong"><Notice tone="danger">{errorMessage(status.error)}</Notice><Btn className="mt-4" variant="secondary" onClick={() => supabase!.auth.signOut()}>Sign out</Btn></Shell>;
  if (!status.data?.allowlisted) {
    return (
      <Shell title="Access denied" subtitle="This account is not on the DevMart admin allowlist.">
        <Notice tone="danger">If you believe this is a mistake, ask the owner to add your email to the allowlist.</Notice>
        <Btn className="mt-4" variant="secondary" onClick={() => supabase!.auth.signOut()}><LogOut className="h-4 w-4" aria-hidden />Sign out</Btn>
      </Shell>
    );
  }
  if (!status.data.is_admin) {
    return <Mfa onDone={async () => { await supabase!.auth.refreshSession(); await qc.invalidateQueries({ queryKey: ['admin-status'] }); }} />;
  }
  return <>{children(status.data, session)}</>;
}
