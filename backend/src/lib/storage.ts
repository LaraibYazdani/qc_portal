import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

/**
 * All file access goes through this module, so moving to another storage
 * backend later means changing only this file.
 *
 * Layout for new uploads (phase 1 files stay at uploads/<JOB>.<ext>):
 *   uploads/<COMPANY>/<JOB>/v<N>/original.<ext>   untouched upload (what the QC engine reads)
 *   uploads/<COMPANY>/<JOB>/v<N>/design.<ext>     compressed copy shown in the portal
 */
export const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

export interface StoredDesign {
  filePath: string;      // public URL of the display copy, e.g. /uploads/BSPL-CORR/264N1054/v2/design.jpg
  originalPath: string;  // public URL of the untouched upload
  sha256: string;
  size: number;
}

/** Folder-safe version of a job number or company code. */
export function safeSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed';
}

function extensionFor(mime: string, originalName: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'application/pdf') return '.pdf';
  return path.extname(originalName).toLowerCase() || '.bin';
}

export async function storeDesignVersion(opts: {
  buffer: Buffer;
  mime: string;
  originalName: string;
  companyCode: string;
  jobNumber: string;
  versionNo: number;
}): Promise<StoredDesign> {
  const relDir = path.posix.join(safeSegment(opts.companyCode), safeSegment(opts.jobNumber), `v${opts.versionNo}`);
  const absDir = path.join(UPLOAD_ROOT, relDir);
  fs.mkdirSync(absDir, { recursive: true });

  const ext = extensionFor(opts.mime, opts.originalName);
  const originalName = `original${ext}`;
  fs.writeFileSync(path.join(absDir, originalName), opts.buffer);

  // Display copy: same compression phase 1 used, so pages stay as fast as before
  let displayName = originalName;
  if (opts.mime === 'image/jpeg') {
    displayName = 'design.jpg';
    await sharp(opts.buffer, { limitInputPixels: false }).jpeg({ quality: 88 }).toFile(path.join(absDir, displayName));
  } else if (opts.mime === 'image/png') {
    displayName = 'design.png';
    await sharp(opts.buffer, { limitInputPixels: false })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(absDir, displayName));
  }

  return {
    filePath: `/uploads/${relDir}/${displayName}`,
    originalPath: `/uploads/${relDir}/${originalName}`,
    sha256: crypto.createHash('sha256').update(opts.buffer).digest('hex'),
    size: opts.buffer.length,
  };
}

/** Remove a version folder written moments ago, when the database insert then failed. */
export function discardStoredDesign(stored: StoredDesign): void {
  try {
    const rel = stored.originalPath.replace(/^\/uploads\//, '');
    fs.rmSync(path.dirname(path.join(UPLOAD_ROOT, rel)), { recursive: true, force: true });
  } catch {
    // best effort: an orphaned folder is harmless
  }
}
