import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArchiveBoxIcon, ArrowPathIcon, ArrowUpTrayIcon, BuildingOffice2Icon, DocumentDuplicateIcon,
  MagnifyingGlassIcon, PhotoIcon, UserPlusIcon,
} from '@heroicons/react/24/outline';
import { JobResponse } from '../types/Job';
import { useAuth } from '../contexts/AuthContext.tsx';
import { api, formatDate, json } from '../utils/api';
import { DesignPreview } from '../components/DesignPreview';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Pager, Segmented, Select, Stat, Thumb,
} from '../components/ui';

type Tab = 'active' | 'archived';
const PAGE_SIZE = 25;

export const Admin: React.FC = () => {
  const { user } = useAuth();
  const [lists, setLists] = useState<Partial<Record<Tab, JobResponse[]>>>({});
  const [tab, setTab] = useState<Tab>('active');
  const [pending, setPending] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [preview, setPreview] = useState<JobResponse | null>(null);
  const [archiving, setArchiving] = useState<JobResponse | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (which: Tab) => {
    const r = await api(`/api/jobs?status=${which}`);
    if (r.ok) setLists(l => ({ ...l, [which]: r.data.data }));
    else setMessage({ tone: 'danger', text: r.message || 'Could not load designs' });
  }, []);

  useEffect(() => {
    load('active');
    load('archived');
    api('/api/users?status=pending').then(r => setPending(r.ok ? r.data.data.length : 0));
  }, [load]);

  const active = lists.active;
  const rows = lists[tab];
  const companies = useMemo(() => [...new Set((active ?? []).map(j => j.company_name).filter(Boolean) as string[])].sort(), [active]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(j =>
      (!company || j.company_name === company) &&
      (!q || j.job_number.toLowerCase().includes(q) || (j.design_name ?? '').toLowerCase().includes(q)
        || (j.uploaded_by_name ?? '').toLowerCase().includes(q)));
  }, [rows, query, company]);

  useEffect(() => setPage(1), [query, company, tab]);

  const thisMonth = useMemo(() => {
    const now = new Date();
    return (active ?? []).filter(j => { const d = new Date(j.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  }, [active]);

  const archive = async () => {
    if (!archiving) return;
    setBusy(true);
    const r = await api(`/api/jobs/${archiving.id}`, { method: 'DELETE', ...json({ reason }) });
    setBusy(false);
    setMessage(r.ok ? { tone: 'success', text: `Job ${archiving.job_number} archived. It can be restored from the Archived tab.` }
      : { tone: 'danger', text: r.message || 'Could not archive the job' });
    setArchiving(null);
    setReason('');
    setPreview(null);
    await Promise.all([load('active'), load('archived')]);
  };

  const restore = async (job: JobResponse) => {
    setBusy(true);
    const r = await api(`/api/jobs/${job.id}/restore`, { method: 'POST' });
    setBusy(false);
    setMessage(r.ok ? { tone: 'success', text: `Job ${job.job_number} restored.` } : { tone: 'danger', text: r.message || 'Could not restore the job' });
    setPreview(null);
    await Promise.all([load('active'), load('archived')]);
  };

  if (!active) return <PageLoader label="Loading designs" />;

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const scope = user?.role === 'admin' ? 'across the group' : `for ${user?.company_name ?? 'your companies'}`;

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Overview" description={`Approved designs ${scope}.`}
        actions={<>
          <Link to="/bulk-upload"><Button variant="secondary" icon={DocumentDuplicateIcon}>Bulk upload</Button></Link>
          <Link to="/upload"><Button icon={ArrowUpTrayIcon}>Upload design</Button></Link>
        </>} />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active designs" value={active.length.toLocaleString()} icon={PhotoIcon} hint="Available to quality checkers" />
        <Stat label="Added this month" value={thisMonth.toLocaleString()} icon={ArrowUpTrayIcon}
          hint={new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} />
        <Stat label="Companies" value={companies.length} icon={BuildingOffice2Icon} hint="With at least one design" />
        <Link to="/admin/users" className="block rounded-2xl transition-shadow hover:shadow-lift">
          <Stat label="Waiting for approval" value={pending ?? '–'} icon={UserPlusIcon} tone={pending ? 'warning' : 'brand'}
            hint={pending ? 'People who signed in with SAP' : 'No one is waiting'} />
        </Link>
      </div>

      {message && <Alert tone={message.tone} className="mb-6" onClose={() => setMessage(null)}>{message.text}</Alert>}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-5 py-4">
          <Segmented<Tab> value={tab} onChange={setTab} options={[
            { value: 'active', label: 'Active', count: active.length },
            { value: 'archived', label: 'Archived', count: lists.archived?.length },
          ]} />
          <div className="relative ml-auto w-full sm:w-72">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Job number, design or uploader" className="pl-9" />
          </div>
          {companies.length > 1 && (
            <Select value={company} onChange={e => setCompany(e.target.value)} className="w-full sm:w-56">
              <option value="">All companies</option>
              {companies.map(c => <option key={c}>{c}</option>)}
            </Select>
          )}
        </div>

        {!rows ? <PageLoader /> : filtered.length === 0 ? (
          <EmptyState icon={tab === 'archived' ? ArchiveBoxIcon : MagnifyingGlassIcon}
            title={query || company ? 'No designs match' : tab === 'archived' ? 'Nothing archived' : 'No designs yet'}
            description={query || company ? 'Try a different job number or clear the filters.'
              : tab === 'archived' ? 'Archived designs appear here and can be restored.' : 'Upload the first design to get started.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-ink-500">
                    <th className="px-5 py-3 font-medium">Design</th>
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Uploaded by</th>
                    <th className="px-3 py-3 font-medium">{tab === 'archived' ? 'Archived' : 'Date'}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {pageRows.map(job => (
                    <tr key={job.id} onClick={() => setPreview(job)} className="cursor-pointer transition-colors hover:bg-ink-50/70">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3.5">
                          <Thumb src={job.image_path} alt={job.job_number} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2">
                              <span className="job-number font-semibold text-ink-950">{job.job_number}</span>
                              {!!job.current_version && job.current_version > 1 && <Badge tone="brand">v{job.current_version}</Badge>}
                            </p>
                            <p className="max-w-[22rem] truncate text-[13px] text-ink-500">{job.design_name || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink-600">{job.company_name || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink-600">{job.uploaded_by_name}</td>
                      <td className="tabular whitespace-nowrap px-3 py-3 text-ink-500">
                        {formatDate(tab === 'archived' ? job.archived_at : job.created_at)}
                      </td>
                      <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {tab === 'active'
                          ? <Button size="sm" variant="ghost" icon={ArchiveBoxIcon} onClick={() => setArchiving(job)}>Archive</Button>
                          : <Button size="sm" variant="ghost" icon={ArrowPathIcon} disabled={busy} onClick={() => restore(job)}>Restore</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
          </>
        )}
      </Card>

      <DesignPreview job={preview} onClose={() => setPreview(null)}
        footer={preview && (preview.status === 'archived'
          ? <Button variant="secondary" icon={ArrowPathIcon} loading={busy} onClick={() => restore(preview)}>Restore</Button>
          : <Button variant="danger" icon={ArchiveBoxIcon} onClick={() => setArchiving(preview)}>Archive</Button>)} />

      <Modal open={!!archiving} onClose={() => setArchiving(null)} title={`Archive job ${archiving?.job_number ?? ''}?`}
        description="It disappears from searches but nothing is deleted: the files and history stay, and it can be restored."
        footer={<>
          <Button variant="secondary" onClick={() => setArchiving(null)}>Cancel</Button>
          <Button variant="dark" loading={busy} onClick={archive}>Archive</Button>
        </>}>
        <Field label="Reason" htmlFor="reason" optional hint="Kept in the audit log.">
          <Input id="reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Test upload, replaced by job 267N2944" />
        </Field>
      </Modal>
    </div>
  );
};
