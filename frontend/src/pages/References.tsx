import React, { useCallback, useEffect, useState } from 'react';
import { ArrowPathIcon, CheckIcon, DocumentMagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext.tsx';
import { EngineStatus, Reference, ReferenceStatus } from '../types/Check';
import { api, formatDateTime, json } from '../utils/api';
import {
  Alert, Artwork, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Segmented, cx,
} from '../components/ui';

type Tab = 'needs_review' | 'approved' | 'rejected' | 'failed' | 'queued';
const TABS: { value: Tab; label: string; statuses: ReferenceStatus[] }[] = [
  { value: 'needs_review', label: 'To review', statuses: ['needs_review'] },
  { value: 'approved', label: 'Approved', statuses: ['approved'] },
  { value: 'rejected', label: 'Rejected', statuses: ['rejected'] },
  { value: 'failed', label: 'Failed', statuses: ['failed'] },
  { value: 'queued', label: 'In progress', statuses: ['queued', 'processing'] },
];

/** Supervisors approve how the engine reads each design before it is used for photo checks. */
export const References: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('needs_review');
  const [rows, setRows] = useState<Reference[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Reference | null>(null);
  const [note, setNote] = useState('');
  const [view, setView] = useState<Record<number, 'preview' | 'design'>>({});

  const load = useCallback(async () => {
    const statuses = TABS.find(t => t.value === tab)!.statuses;
    const results = await Promise.all(statuses.map(s => api(`/api/references?status=${s}`)));
    const failed = results.find(r => !r.ok);
    if (failed) { setMessage({ tone: 'danger', text: failed.message || 'Could not load references' }); setRows([]); return; }
    setRows(results.flatMap(r => r.data.data));
    setCounts(results[0].data.counts ?? {});
    api('/api/engine/status').then(r => r.ok && setEngine(r.data.data));
  }, [tab]);

  useEffect(() => { setRows(null); load(); }, [load]);

  const review = async (ref: Reference, decision: 'approve' | 'reject', reason?: string) => {
    setBusy(ref.version_id);
    const r = await api(`/api/references/${ref.version_id}/review`, { method: 'POST', ...json({ decision, note: reason }) });
    setBusy(null);
    setMessage(r.ok ? { tone: 'success', text: `Job ${ref.job_number}: ${r.data.message.toLowerCase()}.` } : { tone: 'danger', text: r.message || 'Failed' });
    await load();
  };

  const prepareAgain = async (ref: Reference) => {
    setBusy(ref.version_id);
    const r = await api(`/api/jobs/${ref.job_id}/reference/prepare`, { method: 'POST' });
    setBusy(null);
    setMessage(r.ok ? { tone: 'success', text: `Job ${ref.job_number}: ${r.data.message}.` } : { tone: 'danger', text: r.message || 'Failed' });
    await load();
  };

  const queueBacklog = async () => {
    const r = await api('/api/references/backlog', { method: 'POST', ...json({}) });
    setMessage(r.ok ? { tone: 'success', text: r.data.message + '.' } : { tone: 'danger', text: r.message || 'Failed' });
    await load();
  };

  const count = (t: Tab) => TABS.find(x => x.value === t)!.statuses.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const isManager = !!user && ['admin', 'company_admin'].includes(user.role);

  return (
    <div>
      <PageHeader eyebrow="Quality" title="Reference review"
        description="Before a design is used for photo checks, check how the engine reads it: removed dielines in red, ignored areas grey, panels in green."
        actions={isManager && (counts.not_started ?? 0) > 0 && (
          <Button variant="secondary" icon={ArrowPathIcon} onClick={queueBacklog}>
            Prepare {counts.not_started.toLocaleString()} older design{counts.not_started === 1 ? '' : 's'}
          </Button>
        )} />

      {engine && !engine.enabled && (
        <Alert tone="info" className="mb-6">Photo checks are switched off on this server: designs are queued and will be prepared once they are switched on.</Alert>
      )}
      {message && <Alert tone={message.tone} className="mb-6" onClose={() => setMessage(null)}>{message.text}</Alert>}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab> value={tab} onChange={setTab} options={TABS.map(t => ({ value: t.value, label: t.label, count: count(t.value) }))} />
        {engine?.enabled && <p className="text-[13px] text-ink-500">{engine.references_waiting.toLocaleString()} design(s) waiting to be prepared</p>}
      </div>

      {!rows ? <PageLoader label="Loading references" /> : rows.length === 0 ? (
        <Card><EmptyState icon={DocumentMagnifyingGlassIcon} title={tab === 'needs_review' ? 'Nothing to review' : 'Nothing here'}
          description={tab === 'needs_review' ? 'New designs appear here once the engine has prepared them.' : undefined} /></Card>
      ) : (
        <div className="space-y-5">
          {rows.map(ref => {
            const showing = view[ref.version_id] ?? 'preview';
            const src = showing === 'preview' && ref.preview ? ref.preview : ref.design_path;
            return (
              <Card key={ref.version_id} padded={false} className="overflow-hidden">
                <div className="grid lg:grid-cols-[1fr_320px]">
                  <div className="art-bg relative flex min-h-[260px] items-center justify-center p-4">
                    <Artwork src={src} alt={ref.job_number} label className="max-h-[56vh] w-auto rounded object-contain shadow-soft" />
                    {ref.preview && (
                      <div className="absolute left-3 top-3">
                        <Segmented value={showing} onChange={v => setView({ ...view, [ref.version_id]: v })}
                          options={[{ value: 'preview', label: 'Engine view' }, { value: 'design', label: 'Uploaded design' }]} />
                      </div>
                    )}
                  </div>
                  <aside className="flex flex-col border-t border-ink-100 p-6 lg:border-l lg:border-t-0">
                    <p className="job-number text-2xl font-semibold text-ink-950">{ref.job_number}</p>
                    <p className="mt-0.5 truncate text-sm text-ink-500">{ref.design_name || 'No design name'} · v{ref.version_no}</p>
                    <p className="text-xs text-ink-400">{ref.company_name}</p>

                    {ref.panels != null && (
                      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg bg-ink-50 p-3"><dt className="text-xs text-ink-500">Panels found</dt><dd className="tabular text-lg font-semibold">{ref.panels}</dd></div>
                        <div className="rounded-lg bg-ink-50 p-3"><dt className="text-xs text-ink-500">Area compared</dt><dd className="tabular text-lg font-semibold">{Math.round((ref.compare_fraction ?? 0) * 100)}%</dd></div>
                      </dl>
                    )}
                    {ref.inks.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium text-ink-500">Inks measured</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ref.inks.filter(i => !i.is_board).map(i => (
                            <span key={i.name} className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs ring-1 ring-ink-200">
                              <span className="h-3 w-3 rounded-sm ring-1 ring-black/10" style={{ background: i.hex }} />{i.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {ref.panels === 1 && <p className="mt-3 text-xs text-amber-700">Only one panel found: check the dielines were recognised.</p>}
                    {ref.error && <p className="mt-3 text-sm text-red-700">{ref.error}</p>}
                    {ref.reviewed_at && (
                      <p className="mt-4 text-xs text-ink-500">
                        {ref.status === 'approved' ? 'Approved' : 'Reviewed'} by {ref.reviewed_by_name} · {formatDateTime(ref.reviewed_at)}
                        {ref.review_note && <span className="block text-ink-600">“{ref.review_note}”</span>}
                      </p>
                    )}

                    <div className={cx('mt-auto flex flex-wrap gap-2 pt-6')}>
                      {['needs_review', 'rejected'].includes(ref.status) && (
                        <Button variant="success" icon={CheckIcon} loading={busy === ref.version_id} onClick={() => review(ref, 'approve')}>Approve</Button>
                      )}
                      {['needs_review', 'approved'].includes(ref.status) && (
                        <Button variant="danger" icon={XMarkIcon} disabled={busy === ref.version_id} onClick={() => { setNote(''); setRejecting(ref); }}>Reject</Button>
                      )}
                      {['failed', 'rejected'].includes(ref.status) && (
                        <Button variant="secondary" icon={ArrowPathIcon} disabled={busy === ref.version_id} onClick={() => prepareAgain(ref)}>Prepare again</Button>
                      )}
                      {['queued', 'processing'].includes(ref.status) && <Badge tone="brand" dot>{ref.status_label}</Badge>}
                    </div>
                  </aside>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject the reference for ${rejecting?.job_number ?? ''}?`}
        description="Photo checks of this job stay blocked until a corrected design is uploaded or the reference is approved."
        footer={<>
          <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="dark" disabled={!note.trim()} onClick={() => { const r = rejecting!; setRejecting(null); review(r, 'reject', note.trim()); }}>Reject</Button>
        </>}>
        <Field label="Reason" htmlFor="reject-note" hint="Shown to quality checkers and kept in the audit log.">
          <Input id="reject-note" autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Dielines not removed on the side panels" />
        </Field>
      </Modal>
    </div>
  );
};
