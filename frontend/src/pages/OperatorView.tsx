import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowTopRightOnSquareIcon, BuildingOffice2Icon, CalendarIcon, MagnifyingGlassIcon, UserIcon,
} from '@heroicons/react/24/outline';
import { JobResponse } from '../types/Job';
import { formatDate, isImage } from '../utils/api';
import { isUsualJobNumber, normaliseJobNumber } from '../utils/jobNumber';
import { Alert, Artwork, Badge, Button, Card, EmptyState, Input } from '../components/ui';
import { PrintCheck } from '../components/PrintCheck';

const RECENT_KEY = 'qc.recentLookups';
const readRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 6); } catch { return []; }
};
const saveRecent = (list: string[]) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))); } catch { /* private mode: not kept */ }
};

/** Design lookup for quality checkers: type a job number, see the approved artwork. */
export const OperatorView: React.FC = () => {
  const [jobNumber, setJobNumber] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [showPo, setShowPo] = useState(false);
  const [results, setResults] = useState<JobResponse[] | null>(null);
  const [searched, setSearched] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const search = async (job = jobNumber, po = poNumber) => {
    const j = normaliseJobNumber(job);
    if (!j && !po.trim()) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (j) params.append('job_number', j);
    if (po.trim()) params.append('po_number', po.trim());
    try {
      const res = await fetch(`/api/jobs/search?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error();
      setResults(data.data);
      setSearched(j || po.trim());
      if (j && data.data.length) {
        const next = [j, ...recent.filter(r => r !== j)];
        setRecent(next);
        saveRecent(next);
      }
    } catch {
      setError('The search could not be completed. Check the connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); search(); };

  return (
    <div>
      {/* Search */}
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">Design lookup</p>
        <h1 className="text-[30px] font-semibold tracking-tight text-ink-950">Which job are you checking?</h1>
        <p className="mt-2 text-[15px] text-ink-500">Enter the job number from the job card to see the approved artwork.</p>

        <form onSubmit={onSubmit} className="mt-8">
          <div className="flex gap-2 rounded-2xl bg-white p-2 shadow-lift ring-1 ring-ink-100">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input ref={inputRef} value={jobNumber} onChange={e => setJobNumber(e.target.value.toUpperCase())}
                placeholder="e.g. 267N2943" aria-label="Job number" autoComplete="off" spellCheck={false}
                className="job-number h-14 w-full rounded-xl border-0 bg-transparent pl-12 pr-4 text-xl text-ink-950 placeholder:font-sans placeholder:text-base placeholder:text-ink-400 focus:ring-0" />
            </div>
            <Button type="submit" size="lg" loading={loading} className="h-14 px-7">Search</Button>
          </div>
          {jobNumber.trim() && !isUsualJobNumber(jobNumber) && (
            <p className="mt-2 text-left text-xs text-amber-700">Job numbers usually look like 267N2943, 26ON4465 or 2670699.</p>
          )}
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          {recent.length > 0 && <span className="text-ink-400">Recent:</span>}
          {recent.map(r => (
            <button key={r} onClick={() => { setJobNumber(r); search(r, ''); }}
              className="job-number rounded-full bg-white px-3 py-1 text-[13px] text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
              {r}
            </button>
          ))}
          <button onClick={() => setShowPo(s => !s)} className="ml-1 text-[13px] font-medium text-ink-500 hover:text-ink-800">
            {showPo ? 'Hide PO search' : 'Search by PO number'}
          </button>
        </div>
        {showPo && (
          <div className="mx-auto mt-3 flex max-w-sm gap-2">
            <Input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="PO number" />
            <Button variant="secondary" onClick={() => search(jobNumber, poNumber)}>Search</Button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="mx-auto mt-12 max-w-6xl space-y-8">
        {error && <Alert tone="danger">{error}</Alert>}

        {results && results.length === 0 && (
          <Card>
            <EmptyState icon={MagnifyingGlassIcon} title={`No design found for ${searched}`}
              description="Check the number on the job card. If it's right, the design may not be uploaded yet: ask pre-press." />
          </Card>
        )}

        {results?.map(job => (
          <div key={job.id} className="space-y-4">
          <Card padded={false} className="overflow-hidden animate-fade-in">
            <div className="grid lg:grid-cols-[1fr_320px]">
              <div className="art-bg flex min-h-[240px] items-center justify-center p-4 lg:min-h-[420px] lg:p-8">
                {isImage(job.image_path) ? (
                  <a href={job.image_path} target="_blank" rel="noopener noreferrer" className="block" title="Open full size">
                    <Artwork src={job.image_path} alt={job.design_name || job.job_number} iconClass="h-12 w-12" label
                      className="max-h-[72vh] w-auto rounded-md object-contain shadow-lift" />
                  </a>
                ) : (
                  <object data={job.image_path} type="application/pdf" className="h-[72vh] w-full rounded-md bg-white">
                    <a href={job.image_path} className="text-sm text-brand-700">Open PDF</a>
                  </object>
                )}
              </div>

              <aside className="border-t border-ink-100 p-6 lg:border-l lg:border-t-0">
                <Badge tone="success" dot>Approved design</Badge>
                <p className="mt-4 text-xs font-medium uppercase tracking-[0.12em] text-ink-500">Job number</p>
                <p className="job-number mt-1 text-3xl font-semibold text-ink-950">{job.job_number}</p>
                {job.design_name && <p className="mt-2 break-words text-[15px] text-ink-700">{job.design_name}</p>}

                <dl className="mt-6 space-y-3 border-t border-ink-100 pt-5 text-sm">
                  {[
                    { icon: BuildingOffice2Icon, label: 'Company', value: job.company_name },
                    { icon: UserIcon, label: 'Uploaded by', value: job.uploaded_by_name },
                    { icon: CalendarIcon, label: 'First uploaded', value: formatDate(job.created_at) },
                  ].filter(r => r.value).map(r => (
                    <div key={r.label} className="flex items-center gap-3">
                      <r.icon className="h-[18px] w-[18px] flex-none text-ink-400" />
                      <dt className="text-ink-500">{r.label}</dt>
                      <dd className="ml-auto text-right font-medium text-ink-900">{r.value}</dd>
                    </div>
                  ))}
                  {job.po_number && (
                    <div className="flex items-center gap-3">
                      <span className="w-[18px]" />
                      <dt className="text-ink-500">PO number</dt>
                      <dd className="ml-auto font-medium text-ink-900">{job.po_number}</dd>
                    </div>
                  )}
                </dl>

                {!!job.current_version && job.current_version > 1 && (
                  <p className="mt-6 text-xs text-ink-500">This is version {job.current_version}; earlier versions are kept on record.</p>
                )}
                <a href={job.image_path} target="_blank" rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
                  Open full size <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </a>
              </aside>
            </div>
          </Card>
          <PrintCheck jobId={job.id} jobNumber={job.job_number} />
          </div>
        ))}
      </div>
    </div>
  );
};
