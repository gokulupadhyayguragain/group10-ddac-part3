import { FormEvent, useEffect, useState } from 'react';
import Shell from '../components/Shell';
import { fileToDataUrl } from '../lib/file';
import { authHeaders, clearToken, readToken, UserProfile } from '../lib/session';
import { buttonPrimary, buttonSecondary, inputClass, labelClass, panelClass } from '../lib/ui';

type NotificationPrefs = {
  sms: boolean;
  email: boolean;
  inApp: boolean;
  summary: boolean;
};

const defaultPrefs: NotificationPrefs = {
  sms: true,
  email: true,
  inApp: true,
  summary: false,
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', avatar_url: '', current_password: '', new_password: '' });
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [message, setMessage] = useState('Loading profile...');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    const token = readToken();
    if (!token) {
      setMessage('No token stored. Please log in first.');
      return;
    }
    try {
      const response = await fetch('/api/auth/profile', { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load profile');
      setProfile(data);
      setForm({
        name: data.name,
        phone: data.phone || '',
        avatar_url: data.avatar_url || '',
        current_password: '',
        new_password: '',
      });
      try {
        setPrefs({ ...defaultPrefs, ...(data.notification_prefs ? JSON.parse(data.notification_prefs) : {}) });
      } catch {
        setPrefs(defaultPrefs);
      }
      setMessage('');
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        ...form,
        notification_prefs: prefs,
      }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Profile update failed.');
    setProfile(data);
    setMessage('Profile updated.');
    setForm({ ...form, current_password: '', new_password: '' });
  }

  function logout() {
    clearToken();
    window.location.href = '/login';
  }

  return (
    <Shell
      title="Profile"
      subtitle="Signed-in account used for reporting, sightings, alerts, and admin access."
      actions={profile ? <button type="button" className={buttonSecondary} onClick={logout}>Logout</button> : null}
    >
      {message ? <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{message}</div> : null}
      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <form onSubmit={saveProfile} className={panelClass}>
          <h2 className="font-semibold">Account details</h2>
          <div className="mt-3 grid gap-3">
            <label className={labelClass}>Name<input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label className={labelClass}>Phone<input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label className={labelClass}>Avatar file<input className={inputClass} type="file" accept="image/*" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setForm({ ...form, avatar_url: await fileToDataUrl(file) });
            }} /></label>
            <label className={labelClass}>Avatar URL / data URI<input className={inputClass} value={form.avatar_url} onChange={(event) => setForm({ ...form, avatar_url: event.target.value })} /></label>
            <label className={labelClass}>Current password<input className={inputClass} type="password" value={form.current_password} onChange={(event) => setForm({ ...form, current_password: event.target.value })} placeholder="Required when changing password" /></label>
            <label className={labelClass}>New password<input className={inputClass} type="password" value={form.new_password} onChange={(event) => setForm({ ...form, new_password: event.target.value })} placeholder="Leave blank to keep current password" /></label>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-medium text-slate-700">Notification preferences</div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                {([
                  ['sms', 'SMS alerts'],
                  ['email', 'Email alerts'],
                  ['inApp', 'In-app alerts'],
                  ['summary', 'Daily summary'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prefs[key]}
                      onChange={(event) => setPrefs({ ...prefs, [key]: event.target.checked })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button className={buttonPrimary} disabled={busy || !profile}>{busy ? 'Saving...' : 'Save profile'}</button>
          </div>
        </form>

        <article className={panelClass}>
          <h2 className="font-semibold">Role context</h2>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <Info label="Email" value={profile?.email || '-'} />
            <Info label="Role" value={profile?.role || '-'} />
            <Info label="User ID" value={profile ? String(profile.id) : '-'} />
            <Info label="Phone" value={profile?.phone || '-'} />
            <Info label="Avatar" value={profile?.avatar_url ? 'Attached' : '-'} />
          </dl>
        </article>
      </section>
    </Shell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-slate-800">{value}</dd>
    </div>
  );
}
