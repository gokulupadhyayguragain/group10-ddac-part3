import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Shell from '../components/Shell';
import { apiFetch } from '../lib/api';
import { Alert, Person, Sighting } from '../lib/types';
import { buttonPrimary, buttonSecondary, formatDate, panelClass, statusClass } from '../lib/ui';

export default function DashboardPage() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    void Promise.all([
      apiFetch('/api/persons').then((response) => response.json()).then(setPersons),
      apiFetch('/api/sightings').then((response) => response.json()).then(setSightings),
      apiFetch('/api/alerts').then((response) => response.json()).then(setAlerts),
    ]);
  }, []);

  const active = persons.filter((person) => (person.status || 'missing') === 'missing');
  const highConfidence = sightings.filter((sighting) => sighting.confidence === 'high');
  const queuedAlerts = alerts.filter((alert) => (alert.status || 'queued') === 'queued');

  const stats = useMemo(() => [
    ['Active missing', active.length],
    ['Sightings', sightings.length],
    ['High confidence', highConfidence.length],
    ['Queued alerts', queuedAlerts.length],
  ], [active.length, highConfidence.length, queuedAlerts.length, sightings.length]);

  return (
    <Shell
      title="Dashboard"
      subtitle="Compact overview for Alzheimer wandering response."
      actions={<Link href="/report" className={buttonPrimary}>Report missing person</Link>}
    >
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(([label, value]) => (
          <article key={label} className={panelClass}>
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-semibold">{value}</div>
          </article>
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className={panelClass}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Active missing reports</h2>
            <Link href="/search" className={buttonSecondary}>Open map</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Person</th>
                  <th className="py-2 pr-3">Last seen</th>
                  <th className="py-2 pr-3">Caregiver</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {active.slice(0, 6).map((person) => (
                  <tr key={person.id}>
                    <td className="py-2 pr-3 font-medium">{person.full_name}</td>
                    <td className="py-2 pr-3 text-slate-600">{person.last_seen_location || 'Unknown'}</td>
                    <td className="py-2 pr-3 text-slate-600">{person.caregiver_name || 'Not set'}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(person.status)}`}>
                        {person.status || 'missing'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!active.length ? (
                  <tr>
                    <td className="py-8 text-center text-slate-500" colSpan={4}>No active missing reports.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className={panelClass}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Latest alerts</h2>
            <Link href="/alerts" className={buttonSecondary}>View all</Link>
          </div>
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{alert.person_name || `Person #${alert.person_id}`}</span>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(alert.status)}`}>
                    {alert.status || 'queued'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
                <div className="mt-2 text-xs text-slate-400">{formatDate(alert.created_at)}</div>
              </div>
            ))}
            {!alerts.length ? <p className="text-sm text-slate-500">No alerts yet.</p> : null}
          </div>
        </article>
      </section>
    </Shell>
  );
}
