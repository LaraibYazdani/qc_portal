import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Company, ManagedUser, ROLE_LABELS, Role, SfLookup } from '../types/User';

type Tab = 'pending' | 'active' | 'disabled' | 'all';
type Msg = { type: 'success' | 'error'; text: string } | null;

const api = async (path: string, init: RequestInit = {}) => {
  const headers: Record<string, string> = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  if (init.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as any) } });
  const data = await res.json().catch(() => ({}));
  const message = data.message || data.error || data.errors?.[0]?.msg;
  return { ok: res.ok && data.success !== false, data, message };
};

const formatDate = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');

// Company names indented by depth, e.g. "BSPL" then "  › Corrugated Division"
function companyOptions(companies: Company[]) {
  const byParent = new Map<number | null, Company[]>();
  for (const c of companies) {
    const key = companies.some(p => p.id === c.parent_id) ? c.parent_id : null;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const out: { id: number; label: string }[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const c of (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ id: c.id, label: `${'   '.repeat(depth)}${depth ? '› ' : ''}${c.name}` });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export const Users: React.FC = () => {
  const { user } = useAuth();
  const isGroupAdmin = user?.role === 'admin';
  const assignableRoles = (Object.keys(ROLE_LABELS) as Role[]).filter(r => isGroupAdmin || r !== 'admin');

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<Msg>(null);
  const [pendingRole, setPendingRole] = useState<Record<number, Role>>({});

  // Add from SuccessFactors
  const [employeeId, setEmployeeId] = useState('');
  const [lookup, setLookup] = useState<SfLookup | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [newRole, setNewRole] = useState<Role>('operator');
  const [newCompany, setNewCompany] = useState<number | ''>('');

  const load = useCallback(async () => {
    const [u, c] = await Promise.all([api('/api/users'), api('/api/companies')]);
    if (u.ok) setUsers(u.data.data); else setMessage({ type: 'error', text: u.message || 'Could not load users' });
    if (c.ok) setCompanies(c.data.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const options = useMemo(() => companyOptions(companies), [companies]);
  const counts = useMemo(() => ({
    pending: users.filter(u => u.status === 'pending').length,
    active: users.filter(u => u.status === 'active').length,
    disabled: users.filter(u => u.status === 'disabled').length,
    all: users.length,
  }), [users]);
  const shown = users.filter(u => tab === 'all' || u.status === tab);

  useEffect(() => {
    if (!loading && tab === 'pending' && counts.pending === 0) setTab('active');
  }, [loading, tab, counts.pending]);

  const run = async (id: number, path: string, init: RequestInit, done: string) => {
    setBusy(id);
    setMessage(null);
    const r = await api(path, init);
    setMessage(r.ok ? { type: 'success', text: r.message || done } : { type: 'error', text: r.message || 'Something went wrong' });
    await load();
    setBusy(null);
  };

  const update = (u: ManagedUser, body: Record<string, unknown>, done: string) =>
    run(u.id, `/api/users/${u.id}`, { method: 'PUT', body: JSON.stringify(body) }, done);

  const approve = (u: ManagedUser) => {
    const role = pendingRole[u.id] ?? 'operator';
    if (!u.company_id && role !== 'admin') {
      setMessage({ type: 'error', text: `Choose a company for ${u.name} first` });
      return;
    }
    update(u, { role, status: 'active' }, `${u.name} approved as ${ROLE_LABELS[role]}`);
  };

  const doLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId.trim()) return;
    setLookingUp(true);
    setLookup(null);
    setMessage(null);
    const r = await api(`/api/users/sf-lookup/${encodeURIComponent(employeeId.trim())}`);
    if (r.ok) {
      setLookup(r.data.data);
      setNewCompany(r.data.data.company?.id ?? '');
    } else {
      setMessage({ type: 'error', text: r.message || 'Lookup failed' });
    }
    setLookingUp(false);
  };

  const addFromSf = async () => {
    if (!lookup) return;
    const body: Record<string, unknown> = { employee_id: lookup.employee.userId, role: newRole };
    if (newRole !== 'admin' && newCompany !== '' && newCompany !== lookup.company?.id) body.company_id = newCompany;
    setBusy(-1);
    const r = await api('/api/users/from-sf', { method: 'POST', body: JSON.stringify(body) });
    setMessage(r.ok ? { type: 'success', text: `${lookup.employee.name}: ${r.message}` } : { type: 'error', text: r.message || 'Could not add user' });
    if (r.ok) { setLookup(null); setEmployeeId(''); setTab('active'); }
    await load();
    setBusy(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const tabButton = (t: Tab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
    >
      {label} ({counts[t]})
    </button>
  );

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {message && (
          <div className={`p-4 rounded-lg ${message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Add from SuccessFactors */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-1">Add a user from SuccessFactors</h2>
          <p className="text-sm text-gray-600 mb-4">
            Enter an employee ID. Name, email and company come from SuccessFactors; you choose the role. They sign in with SAP.
          </p>
          <form onSubmit={doLookup} className="flex gap-2 max-w-md">
            <input
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              placeholder="Employee ID, e.g. 30000180"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button disabled={lookingUp} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
              {lookingUp ? 'Looking up...' : 'Look up'}
            </button>
          </form>

          {lookup && (
            <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <div><span className="text-gray-500">Name:</span> <span className="font-semibold">{lookup.employee.name}</span></div>
                <div><span className="text-gray-500">Email:</span> {lookup.employee.email ?? '—'}</div>
                <div><span className="text-gray-500">Job title:</span> {lookup.employee.jobTitle ?? '—'}</div>
                <div>
                  <span className="text-gray-500">Business unit:</span>{' '}
                  {lookup.employee.businessUnitName ?? '—'} <span className="text-gray-400">({lookup.employee.businessUnit ?? '?'})</span>
                </div>
                <div><span className="text-gray-500">SuccessFactors company:</span> {lookup.employee.company ?? '—'}</div>
                <div>
                  <span className="text-gray-500">Placed in:</span>{' '}
                  {lookup.company
                    ? <span className="font-semibold">{lookup.company.name}</span>
                    : <span className="text-amber-700">no rule matches; choose a company</span>}
                </div>
              </div>

              {lookup.existing_user?.sf_employee_id ? (
                <p className="mt-3 text-sm text-amber-800">
                  Already has an account ({ROLE_LABELS[lookup.existing_user.role]}, {lookup.existing_user.status}). Manage it in the list below.
                </p>
              ) : (
                <>
                  {lookup.existing_user && (
                    <p className="mt-3 text-sm text-blue-800">
                      An existing account uses this email ({lookup.existing_user.email}). Adding links it to SuccessFactors
                      and applies the role below; its history is kept.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="text-sm">
                      <span className="block text-gray-600 mb-1">Role</span>
                      <select value={newRole} onChange={e => setNewRole(e.target.value as Role)} className="px-3 py-2 border border-gray-300 rounded-lg">
                        {assignableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </label>
                    {newRole !== 'admin' && (
                      <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Company</span>
                        <select value={newCompany} onChange={e => setNewCompany(e.target.value ? Number(e.target.value) : '')}
                          className="px-3 py-2 border border-gray-300 rounded-lg">
                          <option value="">Choose…</option>
                          {options.map(o => <option key={o.id} value={o.id}>{o.label}{o.id === lookup.company?.id ? ' (SuccessFactors)' : ''}</option>)}
                        </select>
                      </label>
                    )}
                    <button
                      onClick={addFromSf}
                      disabled={busy === -1 || (newRole !== 'admin' && newCompany === '')}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {lookup.existing_user ? 'Link and save' : 'Add user'}
                    </button>
                  </div>
                  {newRole !== 'admin' && newCompany !== '' && newCompany !== lookup.company?.id && (
                    <p className="mt-2 text-xs text-gray-600">
                      A company chosen by hand stays fixed: SuccessFactors syncs won't move this user.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Users */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h1 className="text-2xl font-bold text-blue-900">Users</h1>
            <div className="flex gap-2">
              {tabButton('pending', 'Waiting for approval')}
              {tabButton('active', 'Active')}
              {tabButton('disabled', 'Disabled')}
              {tabButton('all', 'All')}
            </div>
          </div>

          {tab === 'pending' && counts.pending > 0 && (
            <p className="text-sm text-gray-600 mb-3">
              These people signed in with SAP and have no access yet. Pick a role and approve, or disable.
            </p>
          )}

          {shown.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No users here.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">SuccessFactors</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Last sign-in</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shown.map(u => {
                    const self = u.id === user?.id;
                    const locked = self || busy === u.id || (u.role === 'admin' && !isGroupAdmin);
                    return (
                      <tr key={u.id} className={u.status === 'disabled' ? 'text-gray-400' : ''}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{u.name}{self && <span className="text-xs text-gray-500"> (you)</span>}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {u.sf_employee_id ? (
                            <>
                              <div>{u.sf_employee_id}{u.sf_job_title && ` · ${u.sf_job_title}`}</div>
                              <div className="text-gray-500">synced {formatDate(u.sf_synced_at)}</div>
                            </>
                          ) : <span className="text-gray-400">not linked (password login)</span>}
                        </td>
                        <td className="px-3 py-2">
                          {u.role === 'admin' ? <span className="text-gray-500">All companies</span> : (
                            <select
                              value={u.company_id ?? ''}
                              disabled={locked}
                              onChange={e => update(u, { company_id: Number(e.target.value) }, `${u.name} moved`)}
                              className="px-2 py-1 border border-gray-300 rounded max-w-[14rem]"
                            >
                              {!u.company_id && <option value="">Choose…</option>}
                              {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                          )}
                          {u.company_manual && u.sf_employee_id && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              set by hand ·{' '}
                              <button disabled={locked} className="text-blue-600 hover:underline"
                                onClick={() => run(u.id, `/api/users/${u.id}/sf-sync`, { method: 'POST', body: JSON.stringify({ reset_company: true }) }, 'Updated')}>
                                follow SuccessFactors
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {u.status === 'pending' ? (
                            <select value={pendingRole[u.id] ?? 'operator'} disabled={locked}
                              onChange={e => setPendingRole({ ...pendingRole, [u.id]: e.target.value as Role })}
                              className="px-2 py-1 border border-gray-300 rounded">
                              {assignableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                          ) : (
                            <select value={u.role} disabled={locked}
                              onChange={e => update(u, { role: e.target.value }, `${u.name} is now ${ROLE_LABELS[e.target.value as Role]}`)}
                              className="px-2 py-1 border border-gray-300 rounded">
                              {(Object.keys(ROLE_LABELS) as Role[]).filter(r => assignableRoles.includes(r) || r === u.role)
                                .map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            u.status === 'active' ? 'bg-green-50 text-green-700'
                              : u.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                            {u.status === 'pending' ? 'waiting' : u.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{formatDate(u.last_login_at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap space-x-3">
                          {u.status === 'pending' && (
                            <button disabled={locked} onClick={() => approve(u)} className="text-green-700 font-semibold hover:underline">Approve</button>
                          )}
                          {u.status === 'disabled' ? (
                            <button disabled={locked} onClick={() => update(u, { status: 'active' }, `${u.name} enabled`)}
                              className="text-blue-600 hover:underline">Enable</button>
                          ) : !self && (
                            <button disabled={locked}
                              onClick={() => window.confirm(`Disable ${u.name}? They can no longer sign in. Their uploads and history are kept.`)
                                && run(u.id, `/api/users/${u.id}`, { method: 'DELETE' }, `${u.name} disabled`)}
                              className="text-red-600 hover:underline">Disable</button>
                          )}
                          {u.sf_employee_id && !self && (
                            <button disabled={locked} onClick={() => run(u.id, `/api/users/${u.id}/sf-sync`, { method: 'POST' }, 'Synced')}
                              className="text-blue-600 hover:underline">Sync</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
