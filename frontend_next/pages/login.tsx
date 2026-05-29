import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useState } from 'react';
import Shell from '../components/Shell';
import { apiFetch } from '../lib/api';
import { saveToken } from '../lib/session';
import { buttonPrimary, inputClass, labelClass, panelClass } from '../lib/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Login failed');
    saveToken(data.token);
    router.push('/profile');
  }

  return (
    <Shell title="Login" subtitle="Access caregiver, community, and admin workflows.">
      <form onSubmit={handleSubmit} className={`${panelClass} max-w-md`}>
        <div className="grid gap-3">
          <label className={labelClass}>Email<input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className={labelClass}>Password<input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className={buttonPrimary} disabled={busy}>{busy ? 'Signing in...' : 'Login'}</button>
          {message ? <p className="text-sm text-red-700">{message}</p> : null}
          <p className="text-sm text-slate-500">Need an account? <Link href="/register" className="font-medium text-teal-700">Register</Link></p>
        </div>
      </form>
    </Shell>
  );
}
