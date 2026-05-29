import { useEffect, useState } from 'react';
import Shell from '../components/Shell';
import { apiFetch } from '../lib/api';
import { readToken } from '../lib/session';
import { panelClass } from '../lib/ui';

type DashboardStats = {
  persons: Array<{ status: string; count: number }>;
  sightings: Array<{ status: string; count: number }>;
  alerts: Array<{ status: string; count: number }>;
  users: Array<{ role: string; count: number }>;
};

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [message, setMessage] = useState('Loading analytics...');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const token = readToken();
    if (!token) {
      setMessage('Login as admin to view analytics.');
      return;
    }
    const response = await apiFetch('/api/admin/dashboard', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to load analytics.');
    setStats(data);
    setMessage('');
  }

  return (
    <Shell title="Analytics" subtitle="Operational summary for the SafeTrace response workflow.">
      {message ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Missing persons', sum(stats?.persons)],
          ['Sightings', sum(stats?.sightings)],
          ['Alerts', sum(stats?.alerts)],
          ['Users', sum(stats?.users)],
        ].map(([label, value]) => (
          <article key={label} className={panelClass}>
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-semibold">{value}</div>
          </article>
        ))}
      </section>
      <section className={`${panelClass} mt-4`}>
        <h2 className="font-semibold">Status breakdown</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4 text-sm">
          <Breakdown title="Persons" items={stats?.persons || []} />
          <Breakdown title="Sightings" items={stats?.sightings || []} />
          <Breakdown title="Alerts" items={stats?.alerts || []} />
          <Breakdown title="Users" items={stats?.users || []} />
        </div>
      </section>
    </Shell>
  );
}

function sum(items?: Array<{ count: number }>) {
  return items?.reduce((total, item) => total + Number(item.count || 0), 0) || 0;
}

function Breakdown({ title, items }: { title: string; items: Array<{ status?: string; role?: string; count: number }> }) {
  return (
    <article className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-2 space-y-1">
        {items.map((item) => (
          <div key={`${title}-${item.status || item.role}`} className="flex items-center justify-between text-slate-600">
            <span>{item.status || item.role}</span>
            <span className="font-medium text-slate-900">{item.count}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
