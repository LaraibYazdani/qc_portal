import React, { useState } from 'react';
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { Inspection, Verdict } from '../types/Check';
import { formatDateTime } from '../utils/api';
import { Artwork, Badge, Segmented, cx } from './ui';

const VERDICT: Record<Verdict, { label: string; tone: string; icon: React.ComponentType<{ className?: string }>; sub: string }> = {
  PASS: { label: 'Pass', tone: 'bg-emerald-600', icon: CheckCircleIcon, sub: 'Matches the approved design' },
  FAIL: { label: 'Fail', tone: 'bg-red-600', icon: XCircleIcon, sub: 'Does not match the approved design' },
  RETAKE: { label: 'Retake photo', tone: 'bg-amber-500', icon: ExclamationTriangleIcon, sub: 'The photo could not be judged' },
};

export const VerdictBadge: React.FC<{ verdict: Verdict | null; status?: string }> = ({ verdict, status }) => {
  if (!verdict) {
    return status === 'failed' ? <Badge tone="danger">Error</Badge> : <Badge tone="brand" dot>Checking</Badge>;
  }
  return <Badge tone={verdict === 'PASS' ? 'success' : verdict === 'FAIL' ? 'danger' : 'warning'} dot className="whitespace-nowrap">{VERDICT[verdict].label}</Badge>;
};

/** Full result of one print check: verdict, marked photo, defects, inks, details. */
export const InspectionView: React.FC<{ inspection: Inspection }> = ({ inspection }) => {
  const r = inspection.result;
  const [tab, setTab] = useState<'defects' | 'inks' | 'details'>('defects');
  const [image, setImage] = useState<'overlay' | 'heatmap' | 'photo'>('overlay');

  if (inspection.status === 'failed' || !r || !inspection.verdict) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-100">
        The check could not be completed{inspection.error ? `: ${inspection.error}` : '.'} Try again; if it keeps happening, tell IT.
      </div>
    );
  }

  const v = VERDICT[inspection.verdict];
  const shown = image === 'photo' ? inspection.photo_path : r.images[image] ?? inspection.photo_path;
  const inks = r.inks.filter(i => i.status !== 'NOT VISIBLE');

  return (
    <div className="space-y-5 animate-fade-in">
      <div className={cx('flex items-center gap-4 rounded-2xl px-5 py-4 text-white', v.tone)}>
        <v.icon className="h-10 w-10 flex-none" />
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight">{v.label}</p>
          <p className="text-sm text-white/85">{v.sub}</p>
        </div>
        <div className="ml-auto hidden text-right text-xs text-white/80 sm:block">
          <p>{inspection.inspected_by_name}</p>
          <p>{formatDateTime(inspection.completed_at ?? inspection.created_at)}</p>
        </div>
      </div>

      <ul className="space-y-1.5 text-sm text-ink-800">
        {r.reasons.map((reason, i) => <li key={i} className="flex gap-2"><span className="text-ink-400">•</span>{reason}</li>)}
      </ul>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Segmented value={image} onChange={setImage} options={[
            ...(r.images.overlay ? [{ value: 'overlay' as const, label: 'Marked' }] : []),
            ...(r.images.heatmap ? [{ value: 'heatmap' as const, label: 'Differences' }] : []),
            { value: 'photo' as const, label: 'Photo' },
          ]} />
          <a href={shown} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:text-brand-800">
            Full size <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        </div>
        <div className="art-bg flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl ring-1 ring-ink-100">
          <Artwork src={shown} alt="Checked print" label className="max-h-[60vh] w-auto object-contain" />
        </div>
      </div>

      <div>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'defects', label: 'Defects', count: r.defects.length },
          { value: 'inks', label: 'Ink colours', count: inks.length },
          { value: 'details', label: 'Details' },
        ]} />
        <div className="mt-4">
          {tab === 'defects' && (r.defects.length === 0
            ? <p className="text-sm text-ink-500">{r.match_failed ? 'Not compared: the photo did not match the design.' : 'No print defects found.'}</p>
            : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {r.defects.map(d => (
                  <li key={d.id} className="overflow-hidden rounded-xl ring-1 ring-ink-100">
                    {d.closeup && <img src={d.closeup} alt={`Defect ${d.id}`} loading="lazy" className="w-full bg-ink-50" />}
                    <div className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-red-600 text-xs font-semibold text-white">{d.id}</span>
                      <span className="font-medium text-ink-900">{d.type}</span>
                      <span className="tabular ml-auto text-xs text-ink-500">ΔE {d.severity}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          {tab === 'defects' && r.defects.length > 0 && (
            <p className="mt-3 text-xs text-ink-500">Each close-up shows the approved design on the left and the print on the right.</p>
          )}

          {tab === 'inks' && (inks.length === 0 ? <p className="text-sm text-ink-500">No ink colours could be measured in this photo.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-500">
                <th className="py-2 font-medium">Ink</th><th className="py-2 font-medium">Printed</th>
                <th className="py-2 text-right font-medium">Difference</th><th className="py-2 text-right font-medium">Result</th>
              </tr></thead>
              <tbody className="divide-y divide-ink-100">
                {inks.map(i => (
                  <tr key={i.name}>
                    <td className="py-2.5"><span className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded ring-1 ring-black/10" style={{ background: i.hex }} />{i.name}</span></td>
                    <td className="py-2.5">{i.photo_hex && <span className="block h-5 w-5 rounded ring-1 ring-black/10" style={{ background: i.photo_hex }} />}</td>
                    <td className="tabular py-2.5 text-right text-ink-600">ΔE {i.delta_e}{i.limit ? <span className="text-ink-400"> / {i.limit}</span> : null}</td>
                    <td className="py-2.5 text-right">
                      {i.status === 'PASS' ? <Badge tone="success">OK</Badge> : <Badge tone="danger">{i.note || 'Off'}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

          {tab === 'details' && (
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              {[
                ['Job', `${inspection.job_number} · design v${inspection.version_no}`],
                ['Design shown in photo', `${Math.round((r.coverage ?? 0) * 100)}%`],
                ['Similarity', r.ssim != null ? r.ssim.toFixed(3) : '—'],
                ['Matching points', String(r.inliers ?? 0)],
                ['Sensitivity', inspection.sensitivity],
                ['Lighting correction', r.lighting ?? '—'],
                ['Checked by', inspection.inspected_by_name],
                ['Time taken', `${r.seconds} s`],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-ink-100 py-1.5">
                  <dt className="text-ink-500">{k}</dt><dd className="text-right font-medium text-ink-900">{val}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
};
