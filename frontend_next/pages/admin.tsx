import { FormEvent, useEffect, useState } from 'react';
import Modal from '../components/Modal';
import Shell from '../components/Shell';
import { apiFetch } from '../lib/api';
import { authHeaders, readToken } from '../lib/session';
import { User } from '../lib/types';
import { buttonPrimary, buttonSecondary, inputClass, labelClass, panelClass } from '../lib/ui';

type DashboardStats = {
  persons: Array<{ status: string; count: number }>;
  sightings: Array<{ status: string; count: number }>;
  alerts: Array<{ status: string; count: number }>;
  users: Array<{ role: string; count: number }>;
};

type CloudStatus = {
  queue: {
    configured: boolean;
    visible: number;
    inFlight: number;
    delayed: number;
    oldestAgeSeconds: number | null;
    receiveWaitSeconds: number | null;
    visibilityTimeoutSeconds: number | null;
    mode: 'aws' | 'local';
    message?: string;
  };
  s3: { configured: boolean; bucket: string | null };
  sns: { configured: boolean; topicArn: string | null };
  secretsManager: { configured: boolean };
  email: { resendConfigured: boolean; from: string | null };
};

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'family', phone: '' });
  const [cloud, setCloud] = useState<CloudStatus | null>(null);

  useEffect(() => {
    void loadAdmin();
  }, []);

  async function loadAdmin() {
    const token = readToken();
    if (!token) {
      setMessage('Login as admin@example.com / password, then open Admin.');
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    const [usersResponse, statsResponse, cloudResponse] = await Promise.all([
      apiFetch('/api/admin/users', { headers }),
      apiFetch('/api/admin/dashboard', { headers }),
      apiFetch('/api/admin/cloud-status', { headers }),
    ]);
    const usersData = await usersResponse.json();
    const statsData = await statsResponse.json();
    const cloudData = await cloudResponse.json();
    if (!usersResponse.ok) return setMessage(usersData.error || 'Unable to load users.');
    if (!statsResponse.ok) return setMessage(statsData.error || 'Unable to load dashboard.');
    setUsers(usersData);
    setStats(statsData);
    setCloud(cloudResponse.ok ? cloudData : null);
    setMessage('');
  }

  async function seedDatabase() {
    setBusy(true);
    const response = await apiFetch('/api/admin/seed', { method: 'POST', headers: authHeaders() });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Seed failed.');
    setMessage('Seed data is ready. Login with admin@example.com / password.');
    await loadAdmin();
  }

  function openEditor(user: User) {
    setSelected(user);
    setEditForm({ name: user.name, role: user.role || 'family', phone: user.phone || '' });
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    const response = await apiFetch(`/api/admin/users/${selected.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(editForm),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Update failed.');
    setMessage(`User ${data.name} updated.`);
    setSelected(null);
    await loadAdmin();
  }

  const cards = [
    ['Missing persons', sum(stats?.persons)],
    ['Sightings', sum(stats?.sightings)],
    ['Alerts', sum(stats?.alerts)],
    ['Users', sum(stats?.users)],
  ];

  return (
    <Shell
      title="Admin"
      subtitle="Admin analytics, user overview, and demo data setup."
      actions={<button type="button" className={buttonPrimary} onClick={seedDatabase} disabled={busy}>{busy ? 'Seeding...' : 'Seed demo data'}</button>}
    >
      {message ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className={panelClass}>
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-semibold">{value}</div>
          </article>
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
        <article className={panelClass}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">System users</h2>
            <button type="button" className={buttonSecondary} onClick={loadAdmin}>Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Verified</th>
                  <th className="py-2">Phone</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="py-2 pr-3 font-medium">{user.name}</td>
                    <td className="py-2 pr-3 text-slate-600">{user.email}</td>
                    <td className="py-2 pr-3 text-slate-600">{user.role || 'family'}</td>
                    <td className="py-2 pr-3 text-slate-600">{user.email_verified ? 'yes' : 'pending'}</td>
                    <td className="py-2 text-slate-600">{user.phone || '-'}</td>
                    <td className="py-2 text-right">
                      <button type="button" className={buttonSecondary} onClick={() => openEditor(user)}>Edit</button>
                    </td>
                  </tr>
                ))}
                {!users.length ? (
                  <tr>
                    <td className="py-8 text-center text-slate-500" colSpan={6}>No users loaded.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className={panelClass}>
          <h2 className="font-semibold">AWS queue status</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <Metric label="Visible" value={cloud?.queue.visible ?? 0} />
            <Metric label="In flight" value={cloud?.queue.inFlight ?? 0} />
            <Metric label="Delayed" value={cloud?.queue.delayed ?? 0} />
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>Mode: <strong>{cloud?.queue.mode || 'local'}</strong></p>
            <p>Oldest message age: <strong>{cloud?.queue.oldestAgeSeconds ?? 'n/a'}s</strong></p>
            <p>Receive wait time: <strong>{cloud?.queue.receiveWaitSeconds ?? 'n/a'}s</strong></p>
            <p>Visibility timeout: <strong>{cloud?.queue.visibilityTimeoutSeconds ?? 'n/a'}s</strong></p>
            {cloud?.queue.message ? <p className="rounded-lg bg-slate-50 p-2">{cloud.queue.message}</p> : null}
          </div>
          <h2 className="mt-5 font-semibold">Task 2 cloud integration</h2>
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            <p>The admin panel reads SQS/CloudWatch when AWS env values are configured; otherwise it shows local mode.</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>S3 configured: {cloud?.s3.configured ? 'yes' : 'no'}</li>
              <li>SNS configured: {cloud?.sns.configured ? 'yes' : 'no'}</li>
              <li>Resend email configured: {cloud?.email.resendConfigured ? 'yes' : 'no'}</li>
              <li>Secrets Manager configured: {cloud?.secretsManager.configured ? 'yes' : 'no'}</li>
              <li>Queue target: {cloud?.queue.configured ? 'SQS' : 'local database alert fallback'}</li>
            </ul>
          </div>
        </article>
      </section>

      {selected ? (
        <Modal title={`Edit ${selected.name}`} onClose={() => setSelected(null)}>
          <form onSubmit={saveUser} className="grid gap-3">
            <label className={labelClass}>Name<input className={inputClass} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required /></label>
            <label className={labelClass}>Role<select className={inputClass} value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}>
              <option value="admin">admin</option>
              <option value="family">family</option>
              <option value="community">community</option>
              <option value="responder">responder</option>
            </select></label>
            <label className={labelClass}>Phone<input className={inputClass} value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></label>
            <button className={buttonPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save user'}</button>
          </form>
        </Modal>
      ) : null}
    </Shell>
  );
}

function sum(items?: Array<{ count: number }>) {
  return items?.reduce((total, item) => total + Number(item.count || 0), 0) || 0;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
