import { FormEvent, useEffect, useState } from 'react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import Shell from '../components/Shell';
import { fileToDataUrl } from '../lib/file';
import { authHeaders } from '../lib/session';
import { Person } from '../lib/types';
import { buttonPrimary, buttonSecondary, formatDate, inputClass, labelClass, panelClass, statusClass } from '../lib/ui';

type PersonForm = {
  full_name: string;
  age: string;
  description: string;
  last_seen_location: string;
  last_seen_at: string;
  caregiver_name: string;
  caregiver_phone: string;
  emergency_contact: string;
  medical_notes: string;
  latitude: string;
  longitude: string;
  photo_url: string;
  status: string;
};

const emptyForm: PersonForm = {
  full_name: '',
  age: '',
  description: '',
  last_seen_location: '',
  last_seen_at: '',
  caregiver_name: '',
  caregiver_phone: '',
  emergency_contact: '',
  medical_notes: '',
  latitude: '',
  longitude: '',
  photo_url: '',
  status: 'missing',
};

export default function ReportPage() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [form, setForm] = useState<PersonForm>(emptyForm);
  const [editForm, setEditForm] = useState<PersonForm>(emptyForm);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<Person | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadPersons();
  }, []);

  async function loadPersons() {
    const response = await fetch('/api/persons');
    setPersons(await response.json());
  }

  function payload(values: PersonForm) {
    return {
      full_name: values.full_name,
      age: values.age ? Number(values.age) : null,
      description: values.description || null,
      last_seen_location: values.last_seen_location || null,
      last_seen_at: values.last_seen_at || null,
      caregiver_name: values.caregiver_name || null,
      caregiver_phone: values.caregiver_phone || null,
      emergency_contact: values.emergency_contact || null,
      medical_notes: values.medical_notes || null,
      latitude: values.latitude || null,
      longitude: values.longitude || null,
      photo_url: values.photo_url || null,
      status: values.status,
    };
  }

  function formFromPerson(person: Person): PersonForm {
    return {
      full_name: person.full_name || '',
      age: person.age ? String(person.age) : '',
      description: person.description || '',
      last_seen_location: person.last_seen_location || '',
      last_seen_at: person.last_seen_at ? person.last_seen_at.slice(0, 16) : '',
      caregiver_name: person.caregiver_name || '',
      caregiver_phone: person.caregiver_phone || '',
      emergency_contact: person.emergency_contact || '',
      medical_notes: person.medical_notes || '',
      latitude: person.latitude ? String(person.latitude) : '',
      longitude: person.longitude ? String(person.longitude) : '',
      photo_url: person.photo_url || '',
      status: person.status || 'missing',
    };
  }

  function openEditor(person: Person) {
    setSelected(person);
    setEditForm(formFromPerson(person));
    setEditOpen(true);
  }

  async function saveNew(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/persons', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload(form)) });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Create failed. Login may be required.');
    setMessage(`Report #${data.id} created.`);
    setForm(emptyForm);
    setOpen(false);
    await loadPersons();
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage('');
    const response = await fetch(`/api/persons/${selected.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(payload(editForm)) });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Update failed.');
    setMessage(`${data.full_name} updated.`);
    setEditOpen(false);
    setSelected(data);
    await loadPersons();
  }

  async function archivePerson(person: Person) {
    const response = await fetch(`/api/persons/${person.id}/status`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'archived' }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Archive failed.');
    setMessage(`${data.full_name} archived.`);
    await loadPersons();
  }

  async function deletePerson(person: Person) {
    if (!window.confirm(`Delete ${person.full_name}? This removes related sightings and alerts.`)) return;
    const response = await fetch(`/api/persons/${person.id}`, { method: 'DELETE', headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Delete failed.');
    setMessage(`Report #${data.id} deleted.`);
    if (selected?.id === person.id) setSelected(null);
    await loadPersons();
  }

  return (
    <Shell
      title="Report Missing"
      subtitle="Create and maintain Alzheimer missing-person records."
      actions={<button type="button" className={buttonPrimary} onClick={() => setOpen(true)}>New report</button>}
    >
      {message ? <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">{message}</div> : null}

      <section className={panelClass}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Missing-person records</h2>
          <span className="text-sm text-slate-500">{persons.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Age</th>
                <th className="py-2 pr-3">Last seen</th>
                <th className="py-2 pr-3">Caregiver</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {persons.map((person) => (
                <tr key={person.id}>
                  <td className="py-2 pr-3 font-medium">{person.full_name}</td>
                  <td className="py-2 pr-3 text-slate-600">{person.age || '-'}</td>
                  <td className="py-2 pr-3 text-slate-600">{person.last_seen_location || 'Unknown'}</td>
                  <td className="py-2 pr-3 text-slate-600">{person.caregiver_name || '-'}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(person.status)}`}>
                      {person.status || 'missing'}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      <button type="button" className={buttonSecondary} onClick={() => setSelected(person)}>View</button>
                      <button type="button" className={buttonSecondary} onClick={() => openEditor(person)}>Edit</button>
                      <button type="button" className={buttonSecondary} onClick={() => archivePerson(person)}>Archive</button>
                      <button type="button" className={buttonSecondary} onClick={() => deletePerson(person)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!persons.length ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={6}>No reports yet. Use New report.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <Drawer title={selected.full_name} onClose={() => setSelected(null)}>
          <div className="space-y-3 text-sm">
            <Info label="Status" value={selected.status || 'missing'} />
            <Info label="Last seen" value={`${selected.last_seen_location || 'Unknown'} · ${formatDate(selected.last_seen_at)}`} />
            <Info label="Caregiver" value={`${selected.caregiver_name || '-'} ${selected.caregiver_phone || ''}`} />
            <Info label="Emergency contact" value={selected.emergency_contact || '-'} />
            <Info label="Description" value={selected.description || '-'} />
            <Info label="Medical notes" value={selected.medical_notes || '-'} />
            <Info label="Photo" value={selected.photo_url ? 'Attached' : '-'} />
            <button type="button" className={buttonPrimary} onClick={() => openEditor(selected)}>Edit report</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={buttonSecondary} onClick={() => archivePerson(selected)}>Archive</button>
              <button type="button" className={buttonSecondary} onClick={() => deletePerson(selected)}>Delete</button>
            </div>
          </div>
        </Drawer>
      ) : null}

      {open ? (
        <Modal title="New missing-person report" onClose={() => setOpen(false)}>
          <PersonFormFields form={form} setForm={setForm} onSubmit={saveNew} busy={busy} buttonLabel="Save report" />
        </Modal>
      ) : null}

      {editOpen ? (
        <Modal title="Edit missing-person report" onClose={() => setEditOpen(false)}>
          <PersonFormFields form={editForm} setForm={setEditForm} onSubmit={saveEdit} busy={busy} buttonLabel="Update report" />
        </Modal>
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

function PersonFormFields({
  form,
  setForm,
  onSubmit,
  busy,
  buttonLabel,
}: {
  form: PersonForm;
  setForm: (form: PersonForm) => void;
  onSubmit: (event: FormEvent) => void;
  busy: boolean;
  buttonLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>Full name<input className={inputClass} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
        <label className={labelClass}>Age<input className={inputClass} value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} inputMode="numeric" /></label>
        <label className={labelClass}>Last seen location<input className={inputClass} value={form.last_seen_location} onChange={(event) => setForm({ ...form, last_seen_location: event.target.value })} /></label>
        <label className={labelClass}>Last seen time<input className={inputClass} type="datetime-local" value={form.last_seen_at} onChange={(event) => setForm({ ...form, last_seen_at: event.target.value })} /></label>
        <label className={labelClass}>Caregiver name<input className={inputClass} value={form.caregiver_name} onChange={(event) => setForm({ ...form, caregiver_name: event.target.value })} /></label>
        <label className={labelClass}>Caregiver phone<input className={inputClass} value={form.caregiver_phone} onChange={(event) => setForm({ ...form, caregiver_phone: event.target.value })} /></label>
        <label className={labelClass}>Latitude<input className={inputClass} value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label>
        <label className={labelClass}>Longitude<input className={inputClass} value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label>
        <label className={labelClass}>Photo file<input className={inputClass} type="file" accept="image/*" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setForm({ ...form, photo_url: await fileToDataUrl(file) });
        }} /></label>
        <label className={labelClass}>Photo URL / data URI<input className={inputClass} value={form.photo_url} onChange={(event) => setForm({ ...form, photo_url: event.target.value })} /></label>
      </div>
      <label className={labelClass}>Emergency contact<input className={inputClass} value={form.emergency_contact} onChange={(event) => setForm({ ...form, emergency_contact: event.target.value })} /></label>
      <label className={labelClass}>Description<textarea className={inputClass} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <label className={labelClass}>Medical notes<textarea className={inputClass} rows={3} value={form.medical_notes} onChange={(event) => setForm({ ...form, medical_notes: event.target.value })} /></label>
      <label className={labelClass}>Status<select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
        <option value="missing">missing</option>
        <option value="found">found</option>
        <option value="safe">safe</option>
        <option value="closed">closed</option>
        <option value="archived">archived</option>
      </select></label>
      <button className={buttonPrimary} disabled={busy}>{busy ? 'Saving...' : buttonLabel}</button>
    </form>
  );
}
