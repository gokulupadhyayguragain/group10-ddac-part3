import { FormEvent, useEffect, useState } from 'react';
import Modal from '../components/Modal';
import Shell from '../components/Shell';
import { apiFetch } from '../lib/api';
import { authHeaders } from '../lib/session';
import { Alert, Person } from '../lib/types';
import { buttonPrimary, buttonSecondary, formatDate, inputClass, labelClass, panelClass, statusClass } from '../lib/ui';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ person_id: '', channel: 'in-app', message: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    const [alertData, personData] = await Promise.all([
      apiFetch('/api/alerts').then((response) => response.json()),
      apiFetch('/api/persons').then((response) => response.json()),
    ]);
    setAlerts(alertData);
    setPersons(personData);
  }

  async function createAlert(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const response = await apiFetch('/api/alerts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...form, person_id: Number(form.person_id) }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Alert creation failed. Login may be required.');
    setMessage(`Alert #${data.id} queued.`);
    setOpen(false);
    setForm({ person_id: '', channel: 'in-app', message: '' });
    await loadData();
  }

  async function acknowledge(alert: Alert) {
    const response = await apiFetch(`/api/alerts/${alert.id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'acknowledged' }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Update failed. Login may be required.');
    setMessage(`Alert #${data.id} acknowledged.`);
    await loadData();
  }

  async function archiveAlert(alert: Alert) {
    const response = await apiFetch(`/api/alerts/${alert.id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'archived' }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Archive failed.');
    setMessage(`Alert #${data.id} archived.`);
    await loadData();
  }

  async function deleteAlert(alert: Alert) {
    if (!window.confirm(`Delete alert #${alert.id}?`)) return;
    const response = await apiFetch(`/api/alerts/${alert.id}`, { method: 'DELETE', headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Delete failed.');
    setMessage(`Alert #${data.id} deleted.`);
    await loadData();
  }

  return (
    <Shell
      title="Alerts"
      subtitle="Sighting alerts and caregiver notifications for the response workflow."
      actions={<button type="button" className={buttonPrimary} onClick={() => setOpen(true)}>Queue alert</button>}
    >
      {message ? <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">{message}</div> : null}
      <section className={panelClass}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Alert history</h2>
          <span className="text-sm text-slate-500">{alerts.length} total</span>
        </div>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <article key={alert.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-medium">{alert.person_name || `Person #${alert.person_id}`}</div>
                  <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
                  <div className="mt-2 text-xs text-slate-400">{alert.channel || 'in-app'} · {formatDate(alert.created_at)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(alert.status)}`}>
                    {alert.status || 'queued'}
                  </span>
                  <button type="button" className={buttonSecondary} onClick={() => acknowledge(alert)}>Acknowledge</button>
                  <button type="button" className={buttonSecondary} onClick={() => archiveAlert(alert)}>Archive</button>
                  <button type="button" className={buttonSecondary} onClick={() => deleteAlert(alert)}>Delete</button>
                </div>
              </div>
            </article>
          ))}
          {!alerts.length ? <p className="text-sm text-slate-500">No alerts yet.</p> : null}
        </div>
      </section>

      {open ? (
        <Modal title="Queue caregiver alert" onClose={() => setOpen(false)}>
          <form onSubmit={createAlert} className="grid gap-3">
            <label className={labelClass}>Person<select className={inputClass} value={form.person_id} onChange={(event) => setForm({ ...form, person_id: event.target.value })} required>
              <option value="">Select person</option>
              {persons.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </select></label>
            <label className={labelClass}>Channel<select className={inputClass} value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>
              <option value="in-app">in-app</option>
              <option value="sms">sms</option>
              <option value="email">email</option>
            </select></label>
            <label className={labelClass}>Message<textarea className={inputClass} rows={4} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} required /></label>
            <button className={buttonPrimary} disabled={busy}>{busy ? 'Queuing...' : 'Queue alert'}</button>
          </form>
        </Modal>
      ) : null}
    </Shell>
  );
}
