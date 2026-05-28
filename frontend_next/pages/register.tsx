import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useState } from 'react';
import Shell from '../components/Shell';
import { buttonPrimary, buttonSecondary, inputClass, labelClass, panelClass } from '../lib/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'family' });
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Registration failed');
    setStep('verify');
    setDevCode(data.devVerificationCode || '');
    setMessage(`Verification code sent to ${data.email}.`);
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email, code }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Verification failed');
    setMessage('Email verified. Redirecting to login.');
    setTimeout(() => router.push('/login'), 700);
  }

  async function resendCode() {
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Unable to resend code');
    setDevCode(data.devVerificationCode || '');
    setMessage(data.verified ? 'This email is already verified.' : 'A new verification code was sent.');
  }

  return (
    <Shell title="Register" subtitle="Create family caregiver or community volunteer accounts.">
      {step === 'details' ? (
        <form onSubmit={handleSubmit} className={`${panelClass} max-w-xl`}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelClass}>Name<input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label className={labelClass}>Email<input className={inputClass} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
            <label className={labelClass}>Password<input className={inputClass} type="password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
            <label className={labelClass}>Phone<input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label className={labelClass}>Role<select className={inputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="family">family caregiver</option>
              <option value="community">community volunteer</option>
            </select></label>
          </div>
          <div className="mt-4 grid gap-3">
            <button className={buttonPrimary} disabled={busy}>{busy ? 'Creating...' : 'Register'}</button>
            {message ? <p className="text-sm text-red-700">{message}</p> : null}
            <p className="text-sm text-slate-500">Already registered? <Link href="/login" className="font-medium text-teal-700">Login</Link></p>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerify} className={`${panelClass} max-w-md`}>
          <div className="grid gap-3">
            <p className="text-sm text-slate-600">Enter the 6-digit code sent to <span className="font-semibold text-slate-800">{form.email}</span>.</p>
            <label className={labelClass}>Verification code<input className={inputClass} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
            {devCode ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Development code: <span className="font-semibold tracking-widest">{devCode}</span></p> : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <button className={buttonPrimary} disabled={busy || code.length !== 6}>{busy ? 'Checking...' : 'Verify email'}</button>
              <button type="button" className={buttonSecondary} onClick={resendCode} disabled={busy}>Resend code</button>
            </div>
            {message ? <p className={`text-sm ${message.includes('failed') || message.includes('Invalid') || message.includes('Unable') ? 'text-red-700' : 'text-teal-700'}`}>{message}</p> : null}
            <button type="button" className="text-left text-sm font-medium text-slate-500" onClick={() => setStep('details')}>Change registration details</button>
          </div>
        </form>
      )}
    </Shell>
  );
}
