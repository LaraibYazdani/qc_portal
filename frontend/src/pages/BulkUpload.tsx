import React, { useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { ArrowPathIcon, CloudArrowUpIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { api } from '../utils/api';
import { parseDesignFilename } from '../utils/jobNumber';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, PageHeader, cx } from '../components/ui';

const CHUNK_SIZE = 20;

interface ParsedFile {
  file: File;
  jobNumber: string | null;
  designName: string | null;
  valid: boolean;
  unusual: boolean;
  note?: string;
  error?: string;
}

interface FileResult {
  filename: string;
  job_number: string | null;
  design_name: string | null;
  status: 'created' | 'updated' | 'failed';
  message: string;
}

const parse = (file: File): ParsedFile => {
  const p = parseDesignFilename(file.name);
  return { file, jobNumber: p.jobNumber, designName: p.designName, valid: !p.error, unusual: p.unusual, note: p.note, error: p.error };
};

const RESULT_TONE = { created: 'success', updated: 'brand', failed: 'danger' } as const;
const RESULT_LABEL = { created: 'Created', updated: 'New version', failed: 'Not uploaded' } as const;

export const BulkUpload: React.FC = () => {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [allowUnusual, setAllowUnusual] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<FileResult[] | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: accepted => { setResults(null); setAllowUnusual(false); setFiles(accepted.map(parse)); },
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'application/pdf': ['.pdf'] },
    maxSize: 20 * 1024 * 1024,
  });

  // Unusual job numbers go up only once the uploader ticks "upload anyway".
  const ready = useMemo(() => files.filter(p => p.valid && (!p.unusual || allowUnusual)), [files, allowUnusual]);
  const held = useMemo(() => files.filter(p => !p.valid || (p.unusual && !allowUnusual)), [files, allowUnusual]);
  const unusualCount = files.filter(p => p.valid && p.unusual).length;
  const invalidCount = files.filter(p => !p.valid).length;

  const upload = async () => {
    if (!ready.length) return;
    setUploading(true);
    setResults(null);
    const chunks: ParsedFile[][] = [];
    for (let i = 0; i < ready.length; i += CHUNK_SIZE) chunks.push(ready.slice(i, i + CHUNK_SIZE));
    setProgress({ done: 0, total: ready.length });

    const all: FileResult[] = held.map(p => ({
      filename: p.file.name, job_number: p.jobNumber, design_name: p.designName, status: 'failed',
      message: p.error || `${p.note} Not uploaded: tick "upload anyway" to confirm.`,
    }));
    let done = 0;
    for (const chunk of chunks) {
      const body = new FormData();
      if (allowUnusual) body.append('allow_unusual', 'true');
      chunk.forEach(p => body.append('designs', p.file));
      const r = await api('/api/jobs/bulk', { method: 'POST', body });
      if (r.ok && Array.isArray(r.data.results)) all.push(...r.data.results);
      else chunk.forEach(p => all.push({ filename: p.file.name, job_number: p.jobNumber, design_name: p.designName, status: 'failed', message: r.message || 'Batch failed' }));
      done += chunk.length;
      setProgress({ done, total: ready.length });
    }
    setResults(all);
    setFiles([]);
    setUploading(false);
  };

  const summary = results && {
    created: results.filter(r => r.status === 'created').length,
    updated: results.filter(r => r.status === 'updated').length,
    failed: results.filter(r => r.status === 'failed').length,
  };

  return (
    <div>
      <PageHeader eyebrow="Designs" title="Bulk upload" description="Upload many designs at once. The job number is read from each file name." />

      <Card className="mb-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-ink-900">Name every file JOBNUMBER_DESIGNNAME</h2>
            <p className="mt-1 text-sm text-ink-500">
              Everything before the first underscore is the job number; everything after it is the design name.
              If another code comes first, the job number is found further along and you'll see a note.
            </p>
          </div>
          <div className="rounded-xl bg-ink-950 px-5 py-4 font-mono text-[13px] text-ink-300">
            <span className="text-brand-300">267N2943</span><span className="text-ink-500">_</span><span className="text-white">GMSAHOTMELTGLU_C[18]</span><span className="text-ink-500">.jpg</span>
            <div className="mt-1.5 font-sans text-[11px] text-ink-500">
              <span className="text-brand-300">job number</span> · <span className="text-white">design name</span>
            </div>
          </div>
        </div>
      </Card>

      {!files.length && !uploading && (
        <div {...getRootProps()} className={cx('mb-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-14 text-center transition-colors',
          isDragActive ? 'border-brand-400 bg-brand-50/60' : 'border-ink-200 hover:border-ink-300')}>
          <input {...getInputProps()} />
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100">
            <CloudArrowUpIcon className="h-7 w-7 text-brand-600" />
          </span>
          <p className="text-[15px] font-medium text-ink-900">{isDragActive ? 'Drop the files here' : 'Drop design files here'}</p>
          <p className="mt-1 text-sm text-ink-500">or <span className="font-medium text-brand-700">browse</span> · JPG, PNG or PDF, up to 20 MB each</p>
        </div>
      )}

      {(files.length > 0 || uploading) && (
        <Card padded={false} className="mb-6">
          <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink-900">{uploading ? 'Uploading…' : `${files.length} file${files.length === 1 ? '' : 's'} selected`}</h2>
            {!uploading && (
              <div className="flex flex-wrap gap-2">
                <Badge tone="success" dot>{files.filter(p => p.valid && !p.unusual).length} ready</Badge>
                {unusualCount > 0 && <Badge tone="warning" dot>{unusualCount} to check</Badge>}
                {invalidCount > 0 && <Badge tone="danger" dot>{invalidCount} can't be used</Badge>}
              </div>
            )}
            {!uploading && <Button size="sm" variant="ghost" icon={ArrowPathIcon} className="ml-auto" onClick={() => setFiles([])}>Choose other files</Button>}
          </div>

          {uploading && progress ? (
            <div className="px-5 py-8">
              <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              <p className="tabular mt-3 text-sm text-ink-500">{progress.done} of {progress.total} uploaded</p>
            </div>
          ) : (
            <>
              <div className="max-h-[420px] overflow-y-auto scroll-thin">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white/95 backdrop-blur">
                    <tr className="text-left text-xs text-ink-500">
                      <th className="px-5 py-2.5 font-medium">File</th>
                      <th className="px-3 py-2.5 font-medium">Job number</th>
                      <th className="px-3 py-2.5 font-medium">Design name</th>
                      <th className="px-5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {files.map((p, i) => (
                      <tr key={i}>
                        <td className="max-w-[16rem] truncate px-5 py-2.5 font-mono text-[12.5px] text-ink-600">{p.file.name}</td>
                        <td className="job-number px-3 py-2.5 font-semibold text-ink-900">{p.jobNumber ?? '—'}</td>
                        <td className="max-w-[16rem] truncate px-3 py-2.5 text-ink-600">{p.designName ?? '—'}</td>
                        <td className="px-5 py-2.5">
                          {!p.valid ? <span className="text-[13px] text-red-600">{p.error}</span>
                            : p.unusual ? <span className="text-[13px] text-amber-700">{p.note}</span>
                              : <span className="text-[13px] text-emerald-700">Ready{p.note && <span className="text-ink-500"> · {p.note}</span>}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-4 border-t border-ink-100 px-5 py-4 md:flex-row md:items-center">
                {unusualCount > 0 ? (
                  <Checkbox checked={allowUnusual} onChange={setAllowUnusual} className="flex-1">
                    Upload the {unusualCount} file{unusualCount === 1 ? '' : 's'} with an unusual job number anyway, as shown.
                    <span className="block text-xs text-ink-500">Otherwise rename them and select them again.</span>
                  </Checkbox>
                ) : <span className="flex-1" />}
                <Button size="lg" icon={DocumentDuplicateIcon} disabled={!ready.length} onClick={upload}>
                  Upload {ready.length} design{ready.length === 1 ? '' : 's'}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {results && summary && (
        <Card padded={false} className="animate-fade-in">
          <div className="px-5 pt-5">
            <CardHeader title="Upload results" actions={<Button size="sm" variant="secondary" onClick={() => setResults(null)}>Upload more</Button>} />
          </div>
          <div className="grid grid-cols-3 gap-px border-y border-ink-100 bg-ink-100">
            {([['Created', summary.created, 'text-emerald-700'], ['New versions', summary.updated, 'text-brand-700'], ['Not uploaded', summary.failed, 'text-red-600']] as const).map(([label, n, color]) => (
              <div key={label} className="bg-white px-5 py-4">
                <p className="text-xs text-ink-500">{label}</p>
                <p className={cx('tabular mt-1 text-2xl font-semibold', n ? color : 'text-ink-300')}>{n}</p>
              </div>
            ))}
          </div>
          {summary.failed > 0 && (
            <Alert tone="warning" className="m-5 mb-0">Files that weren't uploaded are listed first with the reason. Fix them and upload them again.</Alert>
          )}
          <div className="max-h-[480px] overflow-y-auto scroll-thin p-2">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-ink-100">
                {[...results].sort((a, b) => (a.status === 'failed' ? -1 : 0) - (b.status === 'failed' ? -1 : 0)).map((r, i) => (
                  <tr key={i}>
                    <td className="max-w-[16rem] truncate px-3 py-2.5 font-mono text-[12.5px] text-ink-600">{r.filename}</td>
                    <td className="job-number px-3 py-2.5 font-semibold text-ink-900">{r.job_number ?? '—'}</td>
                    <td className="px-3 py-2.5"><Badge tone={RESULT_TONE[r.status]}>{RESULT_LABEL[r.status]}</Badge></td>
                    <td className="px-3 py-2.5 text-[13px] text-ink-600">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
