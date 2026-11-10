import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CameraIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { Inspection, Verdict } from '../types/Check';
import { api, formatDateTime } from '../utils/api';
import { InspectionView, VerdictBadge } from '../components/InspectionView';
import { Button, Card, Checkbox, EmptyState, Modal, PageHeader, PageLoader, Segmented, Stat, Thumb } from '../components/ui';

type Filter = 'all' | Verdict;

/** Recent print checks in the user's companies. */
export const Checks: React.FC = () => {
  const [filter, setFilter] = useState<Filter>('all');
  const [mine, setMine] = useState(false);
  const [rows, setRows] = useState<Inspection[] | null>(null);
  const [opened, setOpened] = useState<Inspection | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ limit: '200' });
    if (filter !== 'all') q.set('verdict', filter);
    if (mine) q.set('mine', '1');
    api(`/api/inspections?${q}`).then(r => setRows(r.ok ? r.data.data : []));
  }, [filter, mine]);

  useEffect(() => { setRows(null); load(); }, [load]);

  const today = new Date().toDateString();
  const todays = (rows ?? []).filter(r => new Date(r.created_at).toDateString() === today);

  return (
    <div>
      <PageHeader eyebrow="Quality" title="Print checks" description="Every printed sheet checked against its approved design, newest first."
        actions={<Link to="/operator-view"><Button icon={CameraIcon}>Check a print</Button></Link>} />

      {filter === 'all' && !mine && rows && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Checks today" value={todays.length} icon={ClipboardDocumentCheckIcon} />
          <Stat label="Failed today" value={todays.filter(r => r.verdict === 'FAIL').length} icon={ClipboardDocumentCheckIcon}
            tone={todays.some(r => r.verdict === 'FAIL') ? 'warning' : 'brand'} />
          <Stat label="Retakes today" value={todays.filter(r => r.verdict === 'RETAKE').length} icon={CameraIcon} />
        </div>
      )}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-4 border-b border-ink-100 px-5 py-4">
          <Segmented<Filter> value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All' }, { value: 'FAIL', label: 'Failed' }, { value: 'PASS', label: 'Passed' }, { value: 'RETAKE', label: 'Retake' },
          ]} />
          <Checkbox checked={mine} onChange={setMine} className="ml-auto">Only my checks</Checkbox>
        </div>
        {!rows ? <PageLoader /> : rows.length === 0 ? (
          <EmptyState icon={ClipboardDocumentCheckIcon} title="No checks yet" description="Look up a job and use “Check a print” under the design." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="whitespace-nowrap text-left text-xs text-ink-500">
                <th className="px-5 py-3 font-medium">Print</th><th className="px-3 py-3 font-medium">Result</th>
                <th className="px-3 py-3 font-medium">Why</th><th className="px-3 py-3 font-medium">Checked by</th>
                <th className="px-5 py-3 font-medium">When</th>
              </tr></thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map(r => (
                  <tr key={r.id} className="cursor-pointer hover:bg-ink-50/70"
                    onClick={() => api(`/api/inspections/${r.id}`).then(x => x.ok && setOpened(x.data.data))}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb src={r.overlay ?? r.photo_path} alt={r.job_number} />
                        <div className="min-w-0">
                          <p className="job-number font-semibold text-ink-950">{r.job_number}</p>
                          <p className="max-w-[16rem] truncate text-[13px] text-ink-500">{r.design_name || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><VerdictBadge verdict={r.verdict} status={r.status} /></td>
                    <td className="max-w-[22rem] px-3 py-3 text-[13px] text-ink-600"><span className="line-clamp-2">{r.reasons[0] ?? r.error ?? ''}</span></td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-600">{r.inspected_by_name}</td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-ink-500">{formatDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!opened} onClose={() => setOpened(null)} size="lg" title={opened ? `Check of job ${opened.job_number}` : ''}
        description={opened?.design_name ?? undefined}>
        {opened && <InspectionView inspection={opened} />}
      </Modal>
    </div>
  );
};
