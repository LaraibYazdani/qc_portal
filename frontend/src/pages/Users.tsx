import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, CheckIcon, MagnifyingGlassIcon, NoSymbolIcon, UserPlusIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Company, ManagedUser, ROLE_LABELS, Role, SfLookup } from '../types/User';
import { api, formatDateTime, initials, json } from '../utils/api';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Segmented, Select,
} from '../components/ui';

type Tab = 'pending' | 'active' | 'disabled' | 'all';
type Msg = { tone: 'success' | 'danger'; text: string } | null;

// Company names indented by depth: "BSPL", then "› Corrugated Division"
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

const STATUS_TONE = { active: 'success', pending: 'warning', disabled: 'neutral' } as const;
const STATUS_LABEL = { active: 'Active', pending: 'Waiting', disabled: 'Disabled' } as const;

export const Users: React.FC = () => {
  const { user } = useAuth();
  const isGroupAdmin = user?.role === 'admin';
  const assignableRoles = (Object.keys(ROLE_LABELS) as Role[]).filter(r => isGroupAdmin || r !== 'admin');

  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<Msg>(null);
  const [pendingRole, setPendingRole] = useState<Record<number, Role>>({});
  const [disabling, setDisabling] = useState<ManagedUser | null>(null);

  // Add from SuccessFactors
  const [addOpen, setAddOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [lookup, setLookup] = useState<SfLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [newRole, setNewRole] = useState<Role>('operator');
  const [newCompany, setNewCompany] = useState<number | ''>('');
  const employeeIdRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const [u, c] = await Promise.all([api('/api/users'), api('/api/companies')]);
    if (u.ok) setUsers(u.data.data); else { setUsers([]); setMessage({ tone: 'danger', text: u.message || 'Could not load users' }); }
    if (c.ok) setCompanies(c.data.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const options = useMemo(() => companyOptions(companies), [companies]);
  const counts = useMemo(() => ({
    pending: (users ?? []).filter(u => u.status === 'pending').length,
    active: (users ?? []).filter(u => u.status === 'active').length,
    disabled: (users ?? []).filter(u => u.status === 'disabled').length,
    all: (users ?? []).length,
  }), [users]);

  useEffect(() => { if (users && tab === 'pending' && counts.pending === 0) setTab('active'); }, [users, tab, counts.pending]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter(u => (tab === 'all' || u.status === tab)
      && (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.sf_employee_id ?? '').includes(q)));
  }, [users, tab, query]);

  const run = async (id: number, path: string, init: RequestInit, done: string) => {
    setBusy(id);
    setMessage(null);
    const r = await api(path, init);
    setMessage(r.ok ? { tone: 'success', text: r.data.message && r.data.message !== 'User updated successfully' ? r.data.message : done }
      : { tone: 'danger', text: r.message || 'Something went wrong' });
    await load();
    setBusy(null);
  };
  const update = (u: ManagedUser, body: Record<string, unknown>, done: string) =>
    run(u.id, `/api/users/${u.id}`, { method: 'PUT', ...json(body) }, done);

  const approve = (u: ManagedUser) => {
    const role = pendingRole[u.id] ?? 'operator';
    if (!u.company_id && role !== 'admin') { setMessage({ tone: 'danger', text: `Choose a company for ${u.name} first.` }); return; }
    update(u, { role, status: 'active' }, `${u.name} approved as ${ROLE_LABELS[role]}.`);
  };

  const doLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId.trim()) return;
    setLookingUp(true);
    setLookup(null);
    setLookupError(null);
    const r = await api(`/api/users/sf-lookup/${encodeURIComponent(employeeId.trim())}`);
    if (r.ok) { setLookup(r.data.data); setNewCompany(r.data.data.company?.id ?? ''); }
    else setLookupError(r.message || 'Lookup failed');
    setLookingUp(false);
  };

  const closeAdd = () => { setAddOpen(false); setLookup(null); setLookupError(null); setEmployeeId(''); setNewRole('operator'); };

  const addFromSf = async () => {
    if (!lookup) return;
    const body: Record<string, unknown> = { employee_id: lookup.employee.userId, role: newRole };
    if (newRole !== 'admin' && newCompany !== '' && newCompany !== lookup.company?.id) body.company_id = newCompany;
    setBusy(-1);
    const r = await api('/api/users/from-sf', { method: 'POST', ...json(body) });
    setBusy(null);
    if (r.ok) {
      setMessage({ tone: 'success', text: `${lookup.employee.name}: ${r.data.message}.` });
      closeAdd();
      setTab('active');
      await load();
    } else setLookupError(r.message || 'Could not add the user');
  };

  if (!users) return <PageLoader label="Loading users" />;

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Users"
        description="Who can use the portal, in which company, with which role. People signing in with SAP for the first time wait here for approval."
        actions={<Button icon={UserPlusIcon} onClick={() => setAddOpen(true)}>Add from SuccessFactors</Button>} />

      {message && <Alert tone={message.tone} className="mb-6" onClose={() => setMessage(null)}>{message.text}</Alert>}

      {counts.pending > 0 && tab !== 'pending' && (
        <Alert tone="warning" className="mb-6" title={`${counts.pending} ${counts.pending === 1 ? 'person is' : 'people are'} waiting for approval`}>
          <button onClick={() => setTab('pending')} className="font-medium underline underline-offset-2">Review them</button>
        </Alert>
      )}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-5 py-4">
          <Segmented<Tab> value={tab} onChange={setTab} options={[
            { value: 'pending', label: 'Waiting', count: counts.pending },
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'disabled', label: 'Disabled', count: counts.disabled },
            { value: 'all', label: 'All', count: counts.all },
          ]} />
          <div className="relative ml-auto w-full sm:w-72">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, email or employee ID" className="pl-9" />
          </div>
        </div>

        {tab === 'pending' && counts.pending > 0 && (
          <p className="border-b border-ink-100 bg-amber-50/40 px-5 py-3 text-[13px] text-amber-900">
            These people signed in with SAP and have no access yet. Check the company, pick a role, then approve.
          </p>
        )}

        {shown.length === 0 ? (
          <EmptyState icon={UsersIcon} title={query ? 'No one matches' : 'No users here'}
            description={query ? 'Try another name, email or employee ID.' : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="whitespace-nowrap text-left text-xs text-ink-500">
                  <th className="px-5 py-3 font-medium">Person</th>
                  <th className="px-3 py-3 font-medium">Company</th>
                  <th className="px-3 py-3 font-medium">Role</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Last sign-in</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {shown.map(u => {
                  const self = u.id === user?.id;
                  const locked = self || busy === u.id || (u.role === 'admin' && !isGroupAdmin);
                  return (
                    <tr key={u.id} className={u.status === 'disabled' ? 'opacity-60' : ''}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar text={initials(u.name)} className="h-9 w-9 text-xs" />
                          <div className="min-w-0">
                            <p className="font-medium text-ink-950">{u.name}{self && <span className="font-normal text-ink-400"> (you)</span>}</p>
                            <p className="truncate text-[13px] text-ink-500">{u.email}</p>
                            {u.sf_employee_id
                              ? <p className="text-xs text-ink-400">SAP {u.sf_employee_id}{u.sf_job_title && ` · ${u.sf_job_title}`}</p>
                              : <p className="text-xs text-ink-400">Password sign-in</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {u.role === 'admin' ? <span className="text-ink-500">All companies</span> : (
                          <>
                            <Select selectSize="sm" value={u.company_id ?? ''} disabled={locked} className="max-w-[15rem]"
                              onChange={e => update(u, { company_id: Number(e.target.value) }, `${u.name} moved.`)}>
                              {!u.company_id && <option value="">Choose…</option>}
                              {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </Select>
                            {u.company_manual && u.sf_employee_id && (
                              <p className="mt-1 text-xs text-ink-500">
                                Set by hand ·{' '}
                                <button disabled={locked} className="font-medium text-brand-700 hover:underline"
                                  onClick={() => run(u.id, `/api/users/${u.id}/sf-sync`, { method: 'POST', ...json({ reset_company: true }) }, 'Updated.')}>
                                  follow SuccessFactors
                                </button>
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {u.status === 'pending' ? (
                          <Select selectSize="sm" value={pendingRole[u.id] ?? 'operator'} disabled={locked} className="min-w-[10.5rem]"
                            onChange={e => setPendingRole({ ...pendingRole, [u.id]: e.target.value as Role })}>
                            {assignableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </Select>
                        ) : (
                          <Select selectSize="sm" value={u.role} disabled={locked} className="min-w-[10.5rem]"
                            onChange={e => update(u, { role: e.target.value }, `${u.name} is now ${ROLE_LABELS[e.target.value as Role]}.`)}>
                            {(Object.keys(ROLE_LABELS) as Role[]).filter(r => assignableRoles.includes(r) || r === u.role)
                              .map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </Select>
                        )}
                      </td>
                      <td className="px-3 py-3"><Badge tone={STATUS_TONE[u.status ?? 'active']} dot>{STATUS_LABEL[u.status ?? 'active']}</Badge></td>
                      <td className="tabular whitespace-nowrap px-3 py-3 text-[13px] text-ink-500">{formatDateTime(u.last_login_at)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {u.status === 'pending' && <Button size="sm" variant="success" icon={CheckIcon} disabled={locked} onClick={() => approve(u)}>Approve</Button>}
                          {u.sf_employee_id && !self && u.status !== 'pending' && (
                            <Button size="sm" variant="ghost" icon={ArrowPathIcon} disabled={locked} title="Refresh from SuccessFactors"
                              onClick={() => run(u.id, `/api/users/${u.id}/sf-sync`, { method: 'POST' }, 'Synced.')}>Sync</Button>
                          )}
                          {u.status === 'disabled'
                            ? <Button size="sm" variant="ghost" disabled={locked} onClick={() => update(u, { status: 'active' }, `${u.name} enabled.`)}>Enable</Button>
                            : !self && <Button size="sm" variant="ghost" icon={NoSymbolIcon} disabled={locked} onClick={() => setDisabling(u)}>Disable</Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Disable */}
      <Modal open={!!disabling} onClose={() => setDisabling(null)} title={`Disable ${disabling?.name ?? ''}?`}
        description="They can no longer sign in, from their next click. Their uploads and history are kept, and you can enable them again."
        footer={<>
          <Button variant="secondary" onClick={() => setDisabling(null)}>Cancel</Button>
          <Button variant="dark" onClick={() => { const u = disabling!; setDisabling(null); run(u.id, `/api/users/${u.id}`, { method: 'DELETE' }, `${u.name} disabled.`); }}>
            Disable
          </Button>
        </>} />

      {/* Add from SuccessFactors */}
      <Modal open={addOpen} onClose={closeAdd} size="lg" title="Add from SuccessFactors" initialFocus={employeeIdRef}
        description="Name, email and company come from SuccessFactors; you choose the role. They sign in with SAP."
        footer={lookup && !lookup.existing_user?.sf_employee_id ? <>
          <Button variant="secondary" onClick={closeAdd}>Cancel</Button>
          <Button loading={busy === -1} disabled={newRole !== 'admin' && newCompany === ''} onClick={addFromSf}>
            {lookup.existing_user ? 'Link and save' : 'Add user'}
          </Button>
        </> : undefined}>
        <form onSubmit={doLookup} className="flex gap-2">
          <Input ref={employeeIdRef} value={employeeId} onChange={e => setEmployeeId(e.target.value)}
            placeholder="Employee ID, e.g. 30000180" className="font-mono placeholder:font-sans" />
          <Button type="submit" variant="secondary" loading={lookingUp}>Look up</Button>
        </form>

        {lookupError && <Alert tone="danger" className="mt-4">{lookupError}</Alert>}

        {lookup && (
          <div className="mt-5 animate-fade-in">
            <div className="flex items-start gap-4 rounded-xl bg-ink-50/70 p-4 ring-1 ring-ink-100">
              <Avatar text={initials(lookup.employee.name)} className="h-11 w-11 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-950">{lookup.employee.name}</p>
                <p className="text-sm text-ink-500">{lookup.employee.jobTitle ?? '—'} · {lookup.employee.email ?? 'no email'}</p>
                <div className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                  <p><span className="text-ink-500">Business unit</span> <span className="font-medium text-ink-800">{lookup.employee.businessUnitName ?? lookup.employee.businessUnit ?? '—'}</span></p>
                  <p><span className="text-ink-500">Company code</span> <span className="font-medium text-ink-800">{lookup.employee.company ?? '—'}</span></p>
                </div>
              </div>
            </div>

            {lookup.existing_user?.sf_employee_id ? (
              <Alert tone="info" className="mt-4">
                Already has an account ({ROLE_LABELS[lookup.existing_user.role]}, {STATUS_LABEL[lookup.existing_user.status ?? 'active'].toLowerCase()}). Manage it in the list.
              </Alert>
            ) : (
              <>
                {lookup.existing_user && (
                  <Alert tone="info" className="mt-4">
                    A password account already uses {lookup.existing_user.email}. Saving links it to this employee and applies the role below; its history is kept.
                  </Alert>
                )}
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Role" htmlFor="new-role">
                    <Select id="new-role" value={newRole} onChange={e => setNewRole(e.target.value as Role)}>
                      {assignableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </Select>
                  </Field>
                  {newRole !== 'admin' && (
                    <Field label="Company" htmlFor="new-company"
                      hint={lookup.company ? `SuccessFactors places them in ${lookup.company.name}.` : undefined}
                      warning={!lookup.company ? 'No rule matches this employee: choose a company.'
                        : newCompany !== '' && newCompany !== lookup.company.id ? "Chosen by hand: SuccessFactors syncs won't move them." : undefined}>
                      <Select id="new-company" value={newCompany} onChange={e => setNewCompany(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Choose…</option>
                        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </Select>
                    </Field>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
