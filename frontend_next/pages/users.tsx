import { FormEvent, useEffect, useState } from 'react';
import Modal from '../components/Modal';
import Shell from '../components/Shell';
import { apiFetch } from '../lib/api';
import { authHeaders, readToken } from '../lib/session';
import { User } from '../lib/types';
import { buttonPrimary, buttonSecondary, inputClass, labelClass, panelClass } from '../lib/ui';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('Loading users...');
  const [selected, setSelected] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', role: 'family', phone: '' });

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadUsers() {
    const token = readToken();
    if (!token) {
      setMessage('Login as admin to manage users.');
      return;
    }
    const response = await apiFetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Unable to load users.');
    setUsers(data);
    setMessage('');
  }

  function editUser(user: User) {
    setSelected(user);
    setForm({ name: user.name, role: user.role || 'family', phone: user.phone || '' });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const response = await apiFetch(`/api/admin/users/${selected.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Update failed.');
    setMessage(`User ${data.name} updated.`);
    setSelected(null);
    await loadUsers();
  }

  return (
    <Shell title="Users" subtitle="Admin user management and role control.">
      {message ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}
      <section className={panelClass}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">System users</h2>
          <button type="button" className={buttonSecondary} onClick={loadUsers}>Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Verified</th>
                <th className="py-2 pr-3">Phone</th>
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
                  <td className="py-2 pr-3 text-slate-600">{user.phone || '-'}</td>
                  <td className="py-2 text-right"><button type="button" className={buttonSecondary} onClick={() => editUser(user)}>Edit</button></td>
                </tr>
              ))}
              {!users.length ? (
                <tr><td className="py-8 text-center text-slate-500" colSpan={6}>No users loaded.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <Modal title={`Edit ${selected.name}`} onClose={() => setSelected(null)}>
          <form onSubmit={save} className="grid gap-3">
            <label className={labelClass}>Name<input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label className={labelClass}>Role<select className={inputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="admin">admin</option>
              <option value="family">family</option>
              <option value="community">community</option>
              <option value="responder">responder</option>
            </select></label>
            <label className={labelClass}>Phone<input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <button className={buttonPrimary}>Save user</button>
          </form>
        </Modal>
      ) : null}
    </Shell>
  );
}
