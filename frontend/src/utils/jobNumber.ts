/**
 * Job numbers and design file names. Kept in step with backend/src/lib/jobNumber.ts,
 * which has the explanation and the tests; the server checks again on upload.
 */
export const JOB_NUMBER_RE = /^\d{2}[1-9OND]N?\d{4}(-\d{1,2})?$/;
const LEADING_JOB_NUMBER_RE = /^(\d{2}[1-9OND]N?\d{4})(?![\dA-Z])/;

export const normaliseJobNumber = (s: string) => s.trim().toUpperCase();
export const isUsualJobNumber = (s: string) => JOB_NUMBER_RE.test(normaliseJobNumber(s));

export interface ParsedDesignName {
  jobNumber: string | null;
  designName: string | null;
  unusual: boolean;
  note?: string;
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
