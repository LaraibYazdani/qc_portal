import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { ArrowUpTrayIcon, CloudArrowUpIcon, DocumentDuplicateIcon, DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { api } from '../utils/api';
import { isUsualJobNumber, normaliseJobNumber } from '../utils/jobNumber';
import { Alert, Button, Card, CardHeader, Field, Input, Modal, PageHeader, cx } from '../components/ui';

const EMPTY = { job_number: '', po_number: '', design_name: '' };

export const Upload: React.FC = () => {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: React.ReactNode } | null>(null);
  const [confirmUnusual, setConfirmUnusual] = useState<string | null>(null);

  const previewUrl = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: accepted => { if (accepted[0]) { setFile(accepted[0]); setMessage(null); } },
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  const unusual = !!form.job_number.trim() && !isUsualJobNumber(form.job_number);

  const submit = async (allowUnusual: boolean) => {
    if (!file) { setMessage({ tone: 'danger', text: 'Choose the design file to upload.' }); return; }
    if (!form.job_number.trim()) { setMessage({ tone: 'danger', text: 'Enter the job number.' }); return; }
    setLoading(true);
    setMessage(null);
    const body = new FormData();
    body.append('job_number', normaliseJobNumber(form.job_number));
    body.append('po_number', form.po_number);
    body.append('design_name', form.design_name);
    if (allowUnusual) body.append('allow_unusual', 'true');
    body.append('design', file);
    const r = await api('/api/jobs', { method: 'POST', body });
    setLoading(false);

    if (r.ok) {
      const jobNumber = normaliseJobNumber(form.job_number);
      setMessage({ tone: 'success', text: <>Design for job <span className="job-number font-semibold">{jobNumber}</span> uploaded. Quality checkers can look it up now.</> });
      setForm(EMPTY);
      setFile(null);
    } else if (r.data?.code === 'UNUSUAL_JOB_NUMBER' && !allowUnusual) {
      setConfirmUnusual(r.message ?? '');
    } else {
      setMessage({ tone: 'danger', text: r.message || 'Upload failed' });
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Designs" title="Upload a design"
        description="Add the approved artwork for one job. To add many at once, use bulk upload."
        actions={<Link to="/bulk-upload"><Button variant="secondary" icon={DocumentDuplicateIcon}>Bulk upload</Button></Link>} />

      {message && <Alert tone={message.tone} className="mb-6" onClose={() => setMessage(null)}>{message.text}</Alert>}

      <form onSubmit={e => { e.preventDefault(); submit(false); }} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card>
          <CardHeader title="Job details" description="The job number must match the job card exactly." />
          <div className="space-y-5">
            <Field label="Job number" htmlFor="job_number"
              hint="Format: year, month, serial, e.g. 267N2943, 26ON4465, 2670699."
              warning={unusual ? "This doesn't look like a job number. Check it before uploading." : undefined}>
              <Input id="job_number" value={form.job_number} required invalid={unusual} autoComplete="off" spellCheck={false}
                onChange={e => setForm({ ...form, job_number: e.target.value.toUpperCase() })}
                placeholder="267N2943" className="job-number text-base" />
            </Field>
            <Field label="Design name" htmlFor="design_name" optional hint="Customer and product, e.g. Lipton12pck_CWC.">
              <Input id="design_name" value={form.design_name} onChange={e => setForm({ ...form, design_name: e.target.value })} />
            </Field>
            <Field label="PO number" htmlFor="po_number" optional>
              <Input id="po_number" value={form.po_number} onChange={e => setForm({ ...form, po_number: e.target.value })} />
            </Field>
          </div>
          <Button type="submit" size="lg" icon={ArrowUpTrayIcon} loading={loading} className="mt-8 w-full">Upload design</Button>
        </Card>

        <Card padded={false} className="overflow-hidden">
          {file ? (
            <div className="flex h-full flex-col">
              <div className="art-bg flex min-h-[340px] flex-1 items-center justify-center p-6">
                {previewUrl
                  ? <img src={previewUrl} alt="Selected design" className="max-h-[460px] w-auto rounded-md object-contain shadow-lift" />
                  : <DocumentIcon className="h-16 w-16 text-ink-300" />}
              </div>
              <div className="flex items-center gap-3 border-t border-ink-100 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{file.name}</p>
                  <p className="tabular text-xs text-ink-500">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || 'file'}</p>
                </div>
                <Button type="button" size="sm" variant="ghost" icon={XMarkIcon} onClick={() => setFile(null)}>Remove</Button>
              </div>
            </div>
          ) : (
            <div {...getRootProps()} className={cx('m-3 flex min-h-[420px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition-colors',
              isDragActive ? 'border-brand-400 bg-brand-50/60' : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50/50')}>
              <input {...getInputProps()} />
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100">
                <CloudArrowUpIcon className="h-7 w-7 text-brand-600" />
              </span>
              <p className="text-[15px] font-medium text-ink-900">{isDragActive ? 'Drop the file here' : 'Drop the design file here'}</p>
              <p className="mt-1 text-sm text-ink-500">or <span className="font-medium text-brand-700">browse</span> · JPG, PNG or PDF, up to 20 MB</p>
              {fileRejections.length > 0 && (
                <p className="mt-4 text-sm text-red-600">That file can't be used: only JPG, PNG or PDF up to 20 MB.</p>
              )}
            </div>
          )}
        </Card>
      </form>

      <Modal open={confirmUnusual !== null} onClose={() => setConfirmUnusual(null)} title="Unusual job number"
        description={confirmUnusual ?? ''}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmUnusual(null)}>Fix the number</Button>
          <Button onClick={() => { setConfirmUnusual(null); submit(true); }}>Upload anyway</Button>
        </>}>
        <p className="text-sm text-ink-600">Operators search by the exact job number. If it doesn't match the job card, they won't find this design.</p>
      </Modal>
    </div>
  );
};
