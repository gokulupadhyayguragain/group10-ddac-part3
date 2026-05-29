import { useEffect, useState } from 'react';
import Drawer from '../components/Drawer';
import Shell from '../components/Shell';
import { apiFetch } from '../lib/api';
import { authHeaders } from '../lib/session';
import { Sighting } from '../lib/types';
import { buttonSecondary, formatDate, panelClass, statusClass } from '../lib/ui';

export default function SightingsPage() {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [selected, setSelected] = useState<Sighting | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadSightings();
  }, []);

  async function loadSightings() {
    const response = await apiFetch('/api/sightings');
    setSightings(await response.json());
  }

  async function setStatus(sighting: Sighting, status: string) {
    setMessage('');
    const response = await apiFetch(`/api/sightings/${sighting.id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Status update failed. Login may be required.');
    setMessage(`Sighting #${data.id} marked ${data.status}.`);
    await loadSightings();
    setSelected(null);
  }

  async function deleteSighting(sighting: Sighting) {
    if (!window.confirm(`Delete sighting #${sighting.id}?`)) return;
    const response = await apiFetch(`/api/sightings/${sighting.id}`, { method: 'DELETE', headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Delete failed.');
    setMessage(`Sighting #${data.id} deleted.`);
    await loadSightings();
    setSelected(null);
  }

  return (
    <Shell title="Sightings" subtitle="Review community reports and triage them for caregiver action.">
      {message ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}
      <section className={panelClass}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Community sightings</h2>
          <span className="text-sm text-slate-500">{sightings.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Person</th>
                <th className="py-2 pr-3">Location</th>
                <th className="py-2 pr-3">Confidence</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sightings.map((sighting) => (
                <tr key={sighting.id}>
                  <td className="py-2 pr-3 font-medium">{sighting.person_name || `Person #${sighting.person_id}`}</td>
                  <td className="py-2 pr-3 text-slate-600">{sighting.location}</td>
                  <td className="py-2 pr-3 text-slate-600">{sighting.confidence || 'medium'}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(sighting.status)}`}>
                      {sighting.status || 'new'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{formatDate(sighting.created_at)}</td>
                  <td className="py-2 text-right">
                    <button type="button" className={buttonSecondary} onClick={() => setSelected(sighting)}>Review</button>
                  </td>
                </tr>
              ))}
              {!sightings.length ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={6}>No sightings submitted yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <Drawer title={`Sighting #${selected.id}`} onClose={() => setSelected(null)}>
          <div className="space-y-3 text-sm">
            <Info label="Person" value={selected.person_name || `Person #${selected.person_id}`} />
            <Info label="Location" value={selected.location} />
            <Info label="Reporter" value={`${selected.reporter_name || '-'} ${selected.reporter_phone || ''}`} />
            <Info label="Notes" value={selected.notes || '-'} />
            <Info label="Coordinates" value={`${selected.latitude || '-'}, ${selected.longitude || '-'}`} />
            <Info label="Photo" value={selected.photo_url ? 'Attached' : '-'} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={buttonSecondary} onClick={() => setStatus(selected, 'reviewing')}>Reviewing</button>
              <button type="button" className={buttonSecondary} onClick={() => setStatus(selected, 'verified')}>Verified</button>
              <button type="button" className={buttonSecondary} onClick={() => setStatus(selected, 'dismissed')}>Dismiss</button>
              <button type="button" className={buttonSecondary} onClick={() => setStatus(selected, 'archived')}>Archive</button>
              <button type="button" className={buttonSecondary} onClick={() => deleteSighting(selected)}>Delete</button>
            </div>
          </div>
        </Drawer>
      ) : null}
    </Shell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-slate-800">{value}</div>
    </div>
  );
}
