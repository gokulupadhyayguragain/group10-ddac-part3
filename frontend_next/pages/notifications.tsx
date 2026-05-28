import { FormEvent, useEffect, useState } from 'react';
import Shell from '../components/Shell';
import { fileToDataUrl } from '../lib/file';
import { authHeaders, readToken, UserProfile } from '../lib/session';
import { buttonPrimary, inputClass, labelClass, panelClass } from '../lib/ui';

type NotificationPrefs = {
  sms: boolean;
  email: boolean;
  inApp: boolean;
  summary: boolean;
};

const defaultPrefs: NotificationPrefs = { sms: true, email: true, inApp: true, summary: false };

export default function NotificationsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [form, setForm] = useState({ name: '', phone: '', avatar_url: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    const token = readToken();
    if (!token) {
      setMessage('Log in first to configure notification preferences.');
      return;
    }
    const response = await fetch('/api/auth/profile', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to load profile.');
    setProfile(data);
    setForm({ name: data.name, phone: data.phone || '', avatar_url: data.avatar_url || '' });
    try {
      setPrefs({ ...defaultPrefs, ...(data.notification_prefs ? JSON.parse(data.notification_prefs) : {}) });
    } catch {
      setPrefs(defaultPrefs);
    }
    setMessage('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ ...form, notification_prefs: prefs }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Update failed.');
    setProfile(data);
    setMessage('Notification preferences saved.');
  }

  return (
    <Shell title="Notifications" subtitle="Choose how SafeTrace should alert you.">
      <form onSubmit={save} className={`${panelClass} max-w-2xl`}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelClass}>Name<input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label className={labelClass}>Phone<input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label className={labelClass}>Avatar file<input className={inputClass} type="file" accept="image/*" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setForm({ ...form, avatar_url: await fileToDataUrl(file) });
          }} /></label>
          <label className={labelClass}>Avatar URL / data URI<input className={inputClass} value={form.avatar_url} onChange={(event) => setForm({ ...form, avatar_url: event.target.value })} /></label>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <div className="text-sm font-medium text-slate-700">Alert channels</div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600">
            {([
              ['sms', 'SMS'],
              ['email', 'Email'],
              ['inApp', 'In-app'],
              ['summary', 'Daily summary'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input type="checkbox" checked={prefs[key]} onChange={(event) => setPrefs({ ...prefs, [key]: event.target.checked })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className={buttonPrimary} disabled={busy || !profile}>{busy ? 'Saving...' : 'Save preferences'}</button>
          {message ? <span className="text-sm text-slate-600">{message}</span> : null}
        </div>
      </form>
    </Shell>
  );
}
