import dynamic from 'next/dynamic';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import Shell from '../components/Shell';
import { fileToDataUrl } from '../lib/file';
import { authHeaders } from '../lib/session';
import { Person, Sighting } from '../lib/types';
import { buttonPrimary, buttonSecondary, formatDate, inputClass, labelClass, panelClass, statusClass } from '../lib/ui';

const Map = dynamic(() => import('../components/Map'), { ssr: false });

type SightingForm = {
  person_id: string;
  location: string;
  latitude: string;
  longitude: string;
  notes: string;
  reporter_name: string;
  reporter_phone: string;
  confidence: string;
  photo_url: string;
};

const emptySighting: SightingForm = {
  person_id: '',
  location: '',
  latitude: '',
  longitude: '',
  notes: '',
  reporter_name: '',
  reporter_phone: '',
  confidence: 'medium',
  photo_url: '',
};

export default function SearchPage() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [query, setQuery] = useState('');
  const [personStatus, setPersonStatus] = useState('missing');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [selected, setSelected] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SightingForm>(emptySighting);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    const [personData, sightingData] = await Promise.all([
      fetch('/api/persons').then((response) => response.json()),
      fetch('/api/sightings').then((response) => response.json()),
    ]);
    setPersons(personData);
    setSightings(sightingData);
  }

  const activePersons = useMemo(() => {
    return persons
      .filter((person) => (person.status || 'missing') === personStatus)
      .filter((person) => {
        const text = `${person.full_name} ${person.last_seen_location} ${person.caregiver_name}`.toLowerCase();
        return text.includes(query.toLowerCase());
      });
  }, [personStatus, persons, query]);

  const visibleSightings = useMemo(() => {
    return sightings.filter((sighting) => confidenceFilter === 'all' || (sighting.confidence || 'medium') === confidenceFilter);
  }, [confidenceFilter, sightings]);

  function openSighting(person: Person) {
    setForm({ ...emptySighting, person_id: String(person.id), reporter_name: person.caregiver_name || '' });
    setOpen(true);
  }

  async function submitSighting(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/sightings', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        ...form,
        person_id: Number(form.person_id),
        latitude: form.latitude || null,
        longitude: form.longitude || null,
        photo_url: form.photo_url || null,
      }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || 'Sighting failed. Login may be required.');
    setMessage(`Sighting #${data.id} submitted and alert queued.`);
    setOpen(false);
    await loadData();
  }

  return (
    <Shell title="Search Map" subtitle="Find active cases and submit community sightings without leaving the map.">
      {message ? <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">{message}</div> : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className={panelClass}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Active case map</h2>
            <span className="text-sm text-slate-500">{activePersons.length} active reports</span>
          </div>
          <Map persons={activePersons} sightings={visibleSightings} />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className={labelClass}>Case status<select className={inputClass} value={personStatus} onChange={(event) => setPersonStatus(event.target.value)}>
              <option value="missing">missing</option>
              <option value="found">found</option>
              <option value="safe">safe</option>
              <option value="closed">closed</option>
              <option value="archived">archived</option>
            </select></label>
            <label className={labelClass}>Sightings filter<select className={inputClass} value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)}>
              <option value="all">all confidence levels</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select></label>
            <article className={panelClass}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Latest sightings</div>
              <div className="mt-2 space-y-2 text-sm">
                {visibleSightings.slice(0, 3).map((sighting) => (
                  <div key={sighting.id}>
                    <div className="font-medium">{sighting.person_name || `Person #${sighting.person_id}`}</div>
                    <div className="text-slate-500">{sighting.location}</div>
                  </div>
                ))}
                {!visibleSightings.length ? <div className="text-slate-500">No sightings match the filter.</div> : null}
              </div>
            </article>
          </div>
        </div>

        <aside className={panelClass}>
          <label className={labelClass}>
            Search active reports
            <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, area, caregiver" />
          </label>
          <div className="mt-4 space-y-3">
            {activePersons.map((person) => (
              <article key={person.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{person.full_name}</div>
                    <div className="text-sm text-slate-500">{person.last_seen_location || 'Unknown area'}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(person.status)}`}>
                    {person.status || 'missing'}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" className={buttonSecondary} onClick={() => setSelected(person)}>Details</button>
                  <button type="button" className={buttonPrimary} onClick={() => openSighting(person)}>Sighting</button>
                </div>
              </article>
            ))}
            {!activePersons.length ? <p className="text-sm text-slate-500">No active records match this search.</p> : null}
          </div>
        </aside>
      </section>

      {selected ? (
        <Drawer title={selected.full_name} onClose={() => setSelected(null)}>
          <div className="space-y-3 text-sm">
            <Info label="Last seen" value={`${selected.last_seen_location || 'Unknown'} · ${formatDate(selected.last_seen_at)}`} />
            <Info label="Caregiver" value={`${selected.caregiver_name || '-'} ${selected.caregiver_phone || ''}`} />
            <Info label="Medical notes" value={selected.medical_notes || '-'} />
            <button type="button" className={buttonPrimary} onClick={() => openSighting(selected)}>Submit sighting</button>
          </div>
        </Drawer>
      ) : null}

      {open ? (
        <Modal title="Submit community sighting" onClose={() => setOpen(false)}>
          <form onSubmit={submitSighting} className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className={labelClass}>Person ID<input className={inputClass} value={form.person_id} onChange={(event) => setForm({ ...form, person_id: event.target.value })} required /></label>
              <label className={labelClass}>Confidence<select className={inputClass} value={form.confidence} onChange={(event) => setForm({ ...form, confidence: event.target.value })}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select></label>
              <label className={labelClass}>Location<input className={inputClass} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} required /></label>
              <label className={labelClass}>Reporter name<input className={inputClass} value={form.reporter_name} onChange={(event) => setForm({ ...form, reporter_name: event.target.value })} /></label>
              <label className={labelClass}>Latitude<input className={inputClass} value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label>
              <label className={labelClass}>Longitude<input className={inputClass} value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label>
              <label className={labelClass}>Photo file<input className={inputClass} type="file" accept="image/*" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setForm({ ...form, photo_url: await fileToDataUrl(file) });
              }} /></label>
            </div>
            <label className={labelClass}>Reporter phone<input className={inputClass} value={form.reporter_phone} onChange={(event) => setForm({ ...form, reporter_phone: event.target.value })} /></label>
            <label className={labelClass}>Notes<textarea className={inputClass} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <label className={labelClass}>Photo URL / data URI<input className={inputClass} value={form.photo_url} onChange={(event) => setForm({ ...form, photo_url: event.target.value })} /></label>
            <button className={buttonPrimary} disabled={busy}>{busy ? 'Submitting...' : 'Submit sighting'}</button>
          </form>
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
