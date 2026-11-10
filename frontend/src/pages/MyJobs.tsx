import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpTrayIcon, FolderOpenIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { JobResponse } from '../types/Job';
import { useAuth } from '../contexts/AuthContext.tsx';
import { api, formatDate } from '../utils/api';
import { DesignPreview } from '../components/DesignPreview';
import { Alert, Artwork, Badge, Button, Card, EmptyState, Input, PageHeader, PageLoader } from '../components/ui';

const PAGE = 48;

export const MyJobs: React.FC = () => {
  const { user } = useAuth();
  const isManager = !!user && ['admin', 'company_admin'].includes(user.role);
  const [jobs, setJobs] = useState<JobResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [preview, setPreview] = useState<JobResponse | null>(null);

  useEffect(() => {
    api('/api/jobs/my-jobs').then(r => {
      if (r.ok) setJobs(r.data.data);
      else { setJobs([]); setError(r.message || 'Could not load your uploads'); }
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs ?? []).filter(j => !q || j.job_number.toLowerCase().includes(q) || (j.design_name ?? '').toLowerCase().includes(q));
  }, [jobs, query]);
  useEffect(() => setShown(PAGE), [query]);

  if (!jobs) return <PageLoader label="Loading uploads" />;

  return (
    <div>
      <PageHeader eyebrow="Designs" title={isManager ? 'Recent uploads' : 'My uploads'}
        description={isManager ? 'Every active design in your companies, newest first.' : 'Designs you have uploaded, newest first.'}
        actions={<Link to="/upload"><Button icon={ArrowUpTrayIcon}>Upload design</Button></Link>} />

      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

      {jobs.length === 0 ? (
        <Card>
          <EmptyState icon={FolderOpenIcon} title="No uploads yet" description="Designs you upload appear here."
            action={<Link to="/upload"><Button icon={ArrowUpTrayIcon}>Upload your first design</Button></Link>} />
        </Card>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by job number or design" className="pl-9" />
            </div>
            <p className="tabular text-sm text-ink-500">{filtered.length.toLocaleString()} design{filtered.length === 1 ? '' : 's'}</p>
          </div>

          {filtered.length === 0 ? (
            <Card><EmptyState icon={MagnifyingGlassIcon} title="No designs match" description="Try a different job number." /></Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.slice(0, shown).map(job => (
                <button key={job.id} onClick={() => setPreview(job)}
                  className="group overflow-hidden rounded-2xl bg-white text-left shadow-soft ring-1 ring-ink-100 transition-all hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="art-bg flex aspect-[4/3] items-center justify-center overflow-hidden">
                    <Artwork src={job.image_path} alt={job.job_number} iconClass="h-9 w-9" label
                      className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03]" />
                  </div>
                  <div className="border-t border-ink-100 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="job-number text-[15px] font-semibold text-ink-950">{job.job_number}</span>
                      {!!job.current_version && job.current_version > 1 && <Badge tone="brand">v{job.current_version}</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-ink-500">{job.design_name || 'No design name'}</p>
                    <p className="tabular mt-2 text-xs text-ink-400">{formatDate(job.created_at)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {shown < filtered.length && (
            <div className="mt-8 text-center">
              <Button variant="secondary" onClick={() => setShown(s => s + PAGE)}>
                Show more ({(filtered.length - shown).toLocaleString()} left)
              </Button>
            </div>
          )}
        </>
      )}

      <DesignPreview job={preview} onClose={() => setPreview(null)} />
    </div>
  );
};
