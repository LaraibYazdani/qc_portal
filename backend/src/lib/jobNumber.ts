/**
 * Job numbers and design file names.
 *
 * Job numbers as used by pre-press (99% of phase 1 data): 2-digit year, month
 * (1-9, then O/N/D for October-December), an optional N, a 4-digit serial, and
 * sometimes a part suffix: 267N2943, 26ON4465, 2670699, 2959977-1.
 *
 * Bulk upload file names follow JOBNUMBER_DESIGNNAME.ext. Kept in step with
 * frontend/src/utils/jobNumber.ts.
 */
export const JOB_NUMBER_RE = /^\d{2}[1-9OND]N?\d{4}(-\d{1,2})?$/;
const LEADING_JOB_NUMBER_RE = /^(\d{2}[1-9OND]N?\d{4})(?![\dA-Z])/;

export const normaliseJobNumber = (s: string) => s.trim().toUpperCase();
export const isUsualJobNumber = (s: string) => JOB_NUMBER_RE.test(normaliseJobNumber(s));

export interface ParsedDesignName {
  jobNumber: string | null;
  designName: string | null;
  /** Needs the uploader to confirm before it is saved. */
  unusual: boolean;
  /** Shown to the uploader: what was assumed or what looks wrong. */
  note?: string;
  /** The file name can't be used at all. */
  error?: string;
}

export function parseDesignFilename(filename: string): ParsedDesignName {
  const dot = filename.lastIndexOf('.');
  const base = (dot > 0 ? filename.slice(0, dot) : filename).trim();
  const sep = base.indexOf('_');
  if (sep <= 0) {
    return { jobNumber: null, designName: null, unusual: false,
      error: 'File name must follow JOBNUMBER_DESIGNNAME.ext, e.g. 267N2943_GMSAHOTMELTGLU_C[18].jpg' };
  }

  const first = normaliseJobNumber(base.slice(0, sep));
  const rest = base.slice(sep + 1);
  if (JOB_NUMBER_RE.test(first)) return { jobNumber: first, designName: rest || null, unusual: false };

  // Another code in front of the job number, e.g. 434814_2690952_Glasses...: use the part that is a job number.
  const parts = base.split('_');
  const at = parts.findIndex((p, i) => i > 0 && JOB_NUMBER_RE.test(normaliseJobNumber(p)));
  if (at > 0) {
    return {
      jobNumber: normaliseJobNumber(parts[at]),
      designName: parts.filter((_, i) => i !== at).join('_') || null,
      unusual: false,
      note: `Job number taken from part ${at + 1} of the file name; "${parts[0]}" kept in the design name`,
    };
  }

  const leading = LEADING_JOB_NUMBER_RE.exec(first);
  return {
    jobNumber: first,
    designName: rest || null,
    unusual: true,
    note: leading
      ? `"${first}" has extra text after the job number. Did you mean ${leading[1]}? Rename the file, or confirm to keep it as it is.`
      : `"${first}" doesn't look like a job number (e.g. 267N2943).`,
  };
}
