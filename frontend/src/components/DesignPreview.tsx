import React, { useEffect, useState } from 'react';
import { ArrowTopRightOnSquareIcon, ClockIcon } from '@heroicons/react/24/outline';
import { JobResponse } from '../types/Job';
import { api, formatDate, formatDateTime, isImage } from '../utils/api';
import { Artwork, Badge, Modal, Spinner, cx } from './ui';

interface Version {
  id: number; version_no: number; file_path: string; original_filename: string | null;
  change_note: string | null; uploaded_by_name?: string; created_at: string; is_current: boolean;
}

/** Large view of a design with its details and version history. */
export const DesignPreview: React.FC<{ job: JobResponse | null; onClose: () => void; footer?: React.ReactNode }> = ({ job, onClose, footer }) => {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    setVersions(null);
    setShown(job?.image_path ?? null);
    if (job) api(`/api/jobs/${job.id}/versions`).then(r => setVersions(r.ok ? r.data.data : []));
  }, [job]);

  const current = shown ?? job?.image_path ?? '';
  return (
    <Modal open={!!job} onClose={onClose} size="xl" footer={footer}
      title={job && <span className="job-number text-lg">{job.job_number}</span>}
      description={job?.design_name || 'No design name'}>
      {job && (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="art-bg flex min-h-[360px] items-center justify-center overflow-hidden rounded-xl ring-1 ring-ink-100">
            {isImage(current)
              ? <Artwork src={current} alt={job.design_name || job.job_number} iconClass="h-12 w-12" label className="max-h-[68vh] w-auto object-contain" />
              : <object data={current} type="application/pdf" className="h-[68vh] w-full">
                  <a href={current} className="text-sm text-brand-700">Open PDF</a>
                </object>}
          </div>

          <aside className="space-y-6">
            <dl className="space-y-3 text-sm">
              {[
                ['Company', job.company_name || '—'],
                ['PO number', job.po_number || '—'],
                ['Uploaded by', job.uploaded_by_name || '—'],
                ['First uploaded', formatDate(job.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="text-right font-medium text-ink-900">{v}</dd>
                </div>
              ))}
              {job.status === 'archived' && (
                <div className="rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-100">
                  <p className="font-medium">Archived {formatDate(job.archived_at)}</p>
                  {job.archive_reason && <p className="mt-0.5 text-amber-800">{job.archive_reason}</p>}
                </div>
              )}
            </dl>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                <ClockIcon className="h-4 w-4" /> Versions
              </p>
              {!versions ? <Spinner className="h-5 w-5 text-ink-300" /> : (
                <ol className="space-y-1.5">
                  {versions.map(v => (
                    <li key={v.id}>
                      <button onClick={() => setShown(v.file_path)}
                        className={cx('w-full rounded-lg px-3 py-2 text-left ring-1 ring-inset transition-colors',
                          current === v.file_path ? 'bg-brand-50/70 ring-brand-200' : 'ring-ink-100 hover:bg-ink-50')}>
                        <span className="flex items-center justify-between">
                          <span className="text-[13px] font-semibold text-ink-900">Version {v.version_no}</span>
                          {v.is_current && <Badge tone="success">Current</Badge>}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-500">{formatDateTime(v.created_at)} · {v.uploaded_by_name}</span>
                        {v.change_note && <span className="mt-1 block text-xs text-ink-600">{v.change_note}</span>}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <a href={current} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
              Open full size <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          </aside>
        </div>
      )}
    </Modal>
  );
};
