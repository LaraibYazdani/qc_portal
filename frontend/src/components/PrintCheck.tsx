import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CameraIcon, ClockIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext.tsx';
import { CHECKER_ROLES, EngineStatus, Inspection, Reference, REVIEWER_ROLES, Sensitivity } from '../types/Check';
import { api, formatDateTime } from '../utils/api';
import { InspectionView, VerdictBadge } from './InspectionView';
import { Alert, Button, Card, Modal, Segmented, Spinner } from './ui';

/** "Check a print" for one job: photo in, PASS / FAIL out. Shown under a lookup result. */
export const PrintCheck: React.FC<{ jobId: number; jobNumber: string }> = ({ jobId, jobNumber }) => {
  const { user } = useAuth();
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [history, setHistory] = useState<Inspection[]>([]);
  const [current, setCurrent] = useState<Inspection | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>('normal');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [opened, setOpened] = useState<Inspection | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const polling = useRef<number | null>(null);

  const canCheck = !!user && CHECKER_ROLES.includes(user.role);
  const canReview = !!user && REVIEWER_ROLES.includes(user.role);

  const loadHistory = useCallback(() => {
    api(`/api/jobs/${jobId}/inspections`).then(r => r.ok && setHistory(r.data.data));
  }, [jobId]);

  useEffect(() => {
    if (!canCheck) return;
    api('/api/engine/status').then(r => r.ok && setEngine(r.data.data));
    api(`/api/jobs/${jobId}/reference`).then(r => r.ok && setReference(r.data.data));
    loadHistory();
    return () => { if (polling.current) window.clearTimeout(polling.current); };
  }, [jobId, canCheck, loadHistory]);

  const poll = useCallback((id: number) => {
    api(`/api/inspections/${id}`).then(r => {
      if (!r.ok) { setError(r.message || 'Could not read the result'); return; }
      const i: Inspection = r.data.data;
      setCurrent(i);
      if (i.status === 'queued' || i.status === 'processing') polling.current = window.setTimeout(() => poll(id), 1500);
      else loadHistory();
    });
  }, [loadHistory]);

  const submit = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSending(true);
    setCurrent(null);
    const body = new FormData();
    body.append('photo', file);
    body.append('sensitivity', sensitivity);
    body.append('source', 'web');
    const r = await api(`/api/jobs/${jobId}/inspections`, { method: 'POST', body });
    setSending(false);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
    if (!r.ok) { setError(r.message || 'The photo could not be sent'); return; }
    poll(r.data.data.id);
  };

  if (!user) {
    return (
      <p className="text-sm text-ink-500">
        <Link to="/login" className="font-medium text-brand-700 hover:text-brand-800">Sign in</Link> to check a printed sheet against this design.
      </p>
    );
  }
  if (!canCheck || !engine) return null;

  const busy = sending || (!!current && (current.status === 'queued' || current.status === 'processing'));
  const approved = reference?.status === 'approved';

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">Check a print</h2>
          <p className="mt-0.5 text-sm text-ink-500">Photograph the flat printed sheet, printed side up, the whole sheet in frame.</p>
        </div>
        {approved && <Segmented<Sensitivity> value={sensitivity} onChange={setSensitivity} options={[
          { value: 'low', label: 'Tolerant' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Strict' },
        ]} />}
      </div>

      {!engine.enabled ? (
        <Alert tone="info">Photo checks are not switched on on this server yet.</Alert>
      ) : !reference ? (
        <Spinner className="h-5 w-5 text-ink-300" />
      ) : !approved ? (
        <Alert tone="warning" title={`This design can't be checked yet: ${reference.status_label.toLowerCase()}.`}>
          {reference.status === 'needs_review' && (canReview
            ? <Link to="/references" className="font-medium underline underline-offset-2">Review it now</Link>
            : 'A QC supervisor needs to approve how the engine reads this design first.')}
          {reference.status === 'failed' && (reference.error ?? 'Ask a supervisor to prepare it again.')}
          {reference.status === 'rejected' && (reference.review_note ? `Reason: ${reference.review_note}` : 'Ask pre-press for a corrected design.')}
          {['not_started', 'queued', 'processing'].includes(reference.status) && 'It is prepared automatically; this usually takes under a minute once it starts.'}
        </Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => submit(e.target.files?.[0])} />
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => submit(e.target.files?.[0])} />
            <Button size="lg" icon={CameraIcon} disabled={busy} onClick={() => cameraRef.current?.click()}>Take photo</Button>
            <Button size="lg" variant="secondary" icon={PhotoIcon} disabled={busy} onClick={() => fileRef.current?.click()}>Choose photo</Button>
          </div>
          {error && <Alert tone="danger" className="mt-4" onClose={() => setError(null)}>{error}</Alert>}
          {busy && (
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-brand-50/60 px-4 py-3.5 text-sm text-brand-900 ring-1 ring-brand-100">
              <Spinner className="h-5 w-5 text-brand-600" />
              {sending ? 'Sending the photo…'
                : current?.status === 'queued' && current.queue_position
                  ? `Waiting: ${current.queue_position} check${current.queue_position === 1 ? '' : 's'} ahead…`
                  : `Comparing with job ${jobNumber}'s approved design… usually 10–30 seconds.`}
            </div>
          )}
          {current && !busy && <div className="mt-5"><InspectionView inspection={current} /></div>}
        </>
      )}

      {history.length > 0 && (
        <div className="mt-6 border-t border-ink-100 pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
            <ClockIcon className="h-4 w-4" /> Earlier checks of this job
          </p>
          <ul className="divide-y divide-ink-100">
            {history.slice(0, 6).map(h => (
              <li key={h.id}>
                <button onClick={() => api(`/api/inspections/${h.id}`).then(r => r.ok && setOpened(r.data.data))}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-left text-sm hover:bg-ink-50/60">
                  <span className="whitespace-nowrap"><VerdictBadge verdict={h.verdict} status={h.status} /></span>
                  <span className="truncate text-ink-700">{h.inspected_by_name}</span>
                  <span className="tabular w-full whitespace-nowrap text-xs text-ink-500 sm:ml-auto sm:w-auto">{formatDateTime(h.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={!!opened} onClose={() => setOpened(null)} size="lg" title={`Check of job ${jobNumber}`}>
        {opened && <InspectionView inspection={opened} />}
      </Modal>
    </Card>
  );
};
