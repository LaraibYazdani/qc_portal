import express from 'express';
import multer from 'multer';
import path from 'path';
import { body, validationResult } from 'express-validator';
import type { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { JobResponse, JobSearchRequest, DesignVersionResponse } from '../models/Job';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import {
  listCompanies, visibleCompanyIds, legalEntityOf, findCompanyByCode, canSee, scopeClause, Company,
} from '../lib/companies';
import { storeDesignVersion, discardStoredDesign, StoredDesign } from '../lib/storage';
import { audit } from '../lib/audit';

const router = express.Router();

// Who may do what. Stored role names are phase 1's: sales = uploader, admin = group admin.
const UPLOADERS = ['admin', 'company_admin', 'sales'];
const MANAGERS = ['admin', 'company_admin'];

// Uploads by a user with no company of their own (phase 1 group admins) go to the
// company that owns phase 1's artwork, so the existing upload pages keep working.
const LEGACY_DEFAULT_COMPANY_CODE = process.env.LEGACY_DEFAULT_COMPANY_CODE || 'BSPL-CORR';

// ── Multer — memory storage so we can process with sharp before saving ────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req: any, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and PDF are allowed.'));
    }
  }
});

// ── Queries ───────────────────────────────────────────────────────────────────
const JOB_SELECT = `
  SELECT j.id, j.job_number, j.po_number, j.design_name, j.image_path, j.uploaded_by, j.created_at,
         j.company_id, j.status, j.archived_at, j.archive_reason,
         u.name AS uploaded_by_name, c.code AS company_code, c.name AS company_name,
         v.version_no AS current_version
  FROM jobs j
  JOIN users u ON j.uploaded_by = u.id
  LEFT JOIN companies c ON j.company_id = c.id
  LEFT JOIN design_versions v ON j.current_version_id = v.id
  WHERE 1=1`;

function toJob(row: any): JobResponse {
  return {
    id: row.id,
    job_number: row.job_number,
    po_number: row.po_number,
    design_name: row.design_name,
    image_path: row.image_path,
    uploaded_by: row.uploaded_by,
    uploaded_by_name: row.uploaded_by_name,
    created_at: row.created_at,
    company_id: row.company_id,
    company_code: row.company_code,
    company_name: row.company_name,
    status: row.status,
    current_version: row.current_version,
    archived_at: row.archived_at,
    archive_reason: row.archive_reason,
  };
}

function statusClause(status: unknown): string {
  if (status === 'archived') return " AND j.status = 'archived'";
  if (status === 'all') return '';
  return " AND j.status = 'active'";
}

/** The company a new job goes to: the one asked for (if the user may use it), else the user's own. */
async function resolveUploadCompany(user: any, requestedId: unknown): Promise<{ company?: Company; error?: string }> {
  const companies = await listCompanies();
  const visible = await visibleCompanyIds(user);
  if (requestedId !== undefined && requestedId !== null && requestedId !== '') {
    const company = companies.find(c => c.id === Number(requestedId));
    if (!company || !company.is_active) return { error: 'Unknown company' };
    if (!canSee(visible, company.id)) return { error: 'You cannot upload for that company' };
    return { company };
  }
  if (user.company_id) {
    return { company: companies.find(c => c.id === user.company_id) };
  }
  const fallback = await findCompanyByCode(LEGACY_DEFAULT_COMPANY_CODE);
  return fallback ? { company: fallback } : { error: 'Choose a company for this upload' };
}

/**
 * Create a job with design version 1, or add a new version to an existing job,
 * in one transaction together with its audit entry.
 */
async function saveDesign(opts: {
  req: AuthRequest;
  conn: PoolConnection;
  company: Company;
  jobNumber: string;
  designName: string | null;
  poNumber: string | null;
  file: Express.Multer.File;
  existingJobId?: number;
  changeNote?: string;
}): Promise<{ jobId: number; versionNo: number }> {
  const { req, conn, company, file } = opts;
  const user = req.user!;
  let jobId = opts.existingJobId;
  let versionNo = 1;

  if (jobId) {
    await conn.execute('SELECT id FROM jobs WHERE id = ? FOR UPDATE', [jobId]);
    const [maxRows] = await conn.execute(
      'SELECT COALESCE(MAX(version_no), 0) AS max_version FROM design_versions WHERE job_id = ?', [jobId]
    ) as [any[], any];
    versionNo = Number(maxRows[0].max_version) + 1;
  }

  let stored: StoredDesign | null = null;
  try {
    stored = await storeDesignVersion({
      buffer: file.buffer,
      mime: file.mimetype,
      originalName: file.originalname,
      companyCode: company.code,
      jobNumber: opts.jobNumber,
      versionNo,
    });

    if (!jobId) {
      const companies = await listCompanies();
      const legalEntity = legalEntityOf(companies, company.id)!;
      const [ins] = await conn.execute(
        `INSERT INTO jobs (job_number, company_id, legal_entity_id, po_number, design_name, image_path, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [opts.jobNumber, company.id, legalEntity.id, opts.poNumber, opts.designName, stored.filePath, user.id]
      ) as [any, any];
      jobId = ins.insertId as number;
    }

    const [vIns] = await conn.execute(
      `INSERT INTO design_versions
         (job_id, version_no, file_path, original_path, original_filename, mime_type, file_size, sha256, uploaded_by, change_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [jobId, versionNo, stored.filePath, stored.originalPath, file.originalname.slice(0, 255), file.mimetype,
        stored.size, stored.sha256, user.id, opts.changeNote ?? null]
    ) as [any, any];

    await conn.execute(
      `UPDATE jobs SET current_version_id = ?, image_path = ?${opts.existingJobId ? ', design_name = COALESCE(?, design_name)' : ''}
       WHERE id = ?`,
      opts.existingJobId ? [vIns.insertId, stored.filePath, opts.designName, jobId] : [vIns.insertId, stored.filePath, jobId]
    );

    await audit(req, {
      action: versionNo === 1 ? 'job.create' : 'job.new_version',
      entityType: 'job',
      entityId: jobId,
      companyId: company.id,
      details: {
        job_number: opts.jobNumber, version: versionNo, file: stored.filePath,
        original_filename: file.originalname, sha256: stored.sha256, note: opts.changeNote ?? null,
      },
    }, conn);

    return { jobId: jobId!, versionNo };
  } catch (err) {
    if (stored) discardStoredDesign(stored);
    throw err;
  }
}

/** Existing job with the same number in the same legal entity (archived ones included). */
async function findJobInLegalEntity(conn: PoolConnection | typeof pool, company: Company, jobNumber: string) {
  const legalEntity = legalEntityOf(await listCompanies(), company.id)!;
  const [rows] = await conn.execute(
    'SELECT id, status, company_id FROM jobs WHERE legal_entity_id = ? AND job_number = ?',
    [legalEntity.id, jobNumber]
  ) as [any[], any];
  return rows[0] as { id: number; status: string; company_id: number } | undefined;
}

async function loadJobForUser(req: AuthRequest, jobId: string | number) {
  const [rows] = await pool.execute(`${JOB_SELECT} AND j.id = ?`, [jobId]) as [any[], any];
  if (rows.length === 0) return { status: 404 as const };
  const visible = await visibleCompanyIds(req.user!);
  if (!canSee(visible, rows[0].company_id)) return { status: 404 as const };
  return { status: 200 as const, job: rows[0] };
}

async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Search jobs — public, no auth (operator page). Exact match, active jobs only.
router.get('/search', async (req: express.Request, res: express.Response) => {
  try {
    const { job_number, po_number }: JobSearchRequest = req.query as any;

    // An empty search used to return every job to anyone; now it returns nothing.
    if (!job_number && !po_number) {
      return res.json({ success: true, data: [] });
    }

    let query = `${JOB_SELECT} AND j.status = 'active'`;
    const params: any[] = [];

    if (job_number) {
      query += ' AND j.job_number = ?';
      params.push(String(job_number).toUpperCase());
    }
    if (po_number) {
      query += ' AND j.po_number = ?';
      params.push(po_number);
    }

    query += ' ORDER BY j.created_at DESC';

    const [rows] = await pool.execute(query, params) as [any[], any];
    res.json({ success: true, data: rows.map(toJob) });
  } catch (error) {
    console.error('Search jobs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// All jobs the user may manage — group admin: everything; company admin: their companies.
// ?status=active (default) | archived | all
router.get('/', authenticateToken, requireRole(MANAGERS), async (req: AuthRequest, res: express.Response) => {
  try {
    const scope = scopeClause(await visibleCompanyIds(req.user!), 'j.company_id');
    const [rows] = await pool.execute(
      `${JOB_SELECT}${statusClause(req.query.status)}${scope.sql} ORDER BY j.created_at DESC`,
      scope.params
    ) as [any[], any];
    res.json({ success: true, data: rows.map(toJob) });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Current user's jobs — uploaders see their own uploads; admins see what they manage
router.get('/my-jobs', authenticateToken, async (req: AuthRequest, res: express.Response) => {
  try {
    const user = req.user!;
    let query = `${JOB_SELECT} AND j.status = 'active'`;
    let params: any[] = [];

    if (MANAGERS.includes(user.role)) {
      const scope = scopeClause(await visibleCompanyIds(user), 'j.company_id');
      query += scope.sql;
      params = scope.params;
    } else {
      query += ' AND j.uploaded_by = ?';
      params.push(user.id);
    }

    query += ' ORDER BY j.created_at DESC';
    const [rows] = await pool.execute(query, params) as [any[], any];
    res.json({ success: true, data: rows.map(toJob) });
  } catch (error) {
    console.error('Get my jobs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Upload new job — uploaders and admins
router.post('/', authenticateToken, requireRole(UPLOADERS), upload.single('design'), [
  body('job_number').trim().notEmpty().withMessage('Job number required'),
  body('po_number').optional().isString(),
  body('design_name').optional().isString(),
  body('company_id').optional({ checkFalsy: true }).isInt(),
], async (req: AuthRequest, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Design file required' });
    }

    const { company, error } = await resolveUploadCompany(req.user, req.body.company_id);
    if (!company) {
      return res.status(400).json({ success: false, message: error });
    }

    const jobNumber = String(req.body.job_number).toUpperCase();
    const existing = await findJobInLegalEntity(pool, company, jobNumber);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: existing.status === 'archived'
          ? 'Job number already exists (archived). Ask an admin to restore it.'
          : 'Job number already exists',
      });
    }

    const result = await withTransaction(conn => saveDesign({
      req, conn, company, jobNumber,
      designName: req.body.design_name || null,
      poNumber: req.body.po_number || null,
      file: req.file!,
    }));

    res.json({ success: true, message: 'Job created successfully', data: { id: result.jobId } });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Job number already exists' });
    }
    console.error('Create job error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Bulk upload — uploaders and admins. Filenames must follow JOBNUMBER_DESIGNNAME.ext;
// job number is everything before the first underscore, design name is everything after.
const BULK_MAX_FILES = 25;

router.post('/bulk', authenticateToken, requireRole(UPLOADERS), upload.array('designs', BULK_MAX_FILES), async (req: AuthRequest, res: express.Response) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided' });
    }

    const { company, error } = await resolveUploadCompany(req.user, req.body.company_id);
    if (!company) {
      return res.status(400).json({ success: false, message: error });
    }

    const createdInThisBatch = new Map<string, number>();
    const results: Array<{
      filename: string;
      job_number: string | null;
      design_name: string | null;
      status: 'created' | 'updated' | 'failed';
      message: string;
    }> = [];

    for (const file of files) {
      const nameWithoutExt = path.basename(file.originalname, path.extname(file.originalname));
      const separatorIndex = nameWithoutExt.indexOf('_');

      if (separatorIndex <= 0) {
        results.push({
          filename: file.originalname,
          job_number: null,
          design_name: null,
          status: 'failed',
          message: 'Filename must follow JOBNUMBER_DESIGNNAME.ext, e.g. 267N2943_GMSAHOTMELTGLU_C[18].jpg'
        });
        continue;
      }

      const jobNumber = nameWithoutExt.slice(0, separatorIndex).toUpperCase();
      const designName = nameWithoutExt.slice(separatorIndex + 1);

      try {
        const batchJobId = createdInThisBatch.get(jobNumber);
        if (batchJobId) {
          // Duplicate within this same batch — the later file becomes a new version
          const { versionNo } = await withTransaction(conn => saveDesign({
            req, conn, company, jobNumber, designName, poNumber: null, file,
            existingJobId: batchJobId, changeNote: 'Duplicate in the same bulk upload',
          }));
          results.push({
            filename: file.originalname,
            job_number: jobNumber,
            design_name: designName,
            status: 'updated',
            message: `Saved as version ${versionNo} of a job created earlier in this batch`
          });
          continue;
        }

        if (await findJobInLegalEntity(pool, company, jobNumber)) {
          // Pre-existed before this batch started — protect it, don't overwrite.
          results.push({
            filename: file.originalname,
            job_number: jobNumber,
            design_name: designName,
            status: 'failed',
            message: 'Job number already exists'
          });
          continue;
        }

        const { jobId } = await withTransaction(conn => saveDesign({
          req, conn, company, jobNumber, designName, poNumber: null, file,
        }));
        createdInThisBatch.set(jobNumber, jobId);
        results.push({
          filename: file.originalname,
          job_number: jobNumber,
          design_name: designName,
          status: 'created',
          message: 'Job created successfully'
        });
      } catch (fileError) {
        console.error('Bulk upload file error:', fileError);
        results.push({
          filename: file.originalname,
          job_number: jobNumber,
          design_name: designName,
          status: 'failed',
          message: 'Server error while processing this file'
        });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Design version history of a job
router.get('/:id/versions', authenticateToken, async (req: AuthRequest, res: express.Response) => {
  try {
    const found = await loadJobForUser(req, req.params.id);
    if (found.status === 404) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const [rows] = await pool.execute(
      `SELECT v.*, u.name AS uploaded_by_name, (j.current_version_id = v.id) AS is_current
       FROM design_versions v
       JOIN users u ON v.uploaded_by = u.id
       JOIN jobs j ON v.job_id = j.id
       WHERE v.job_id = ? ORDER BY v.version_no DESC`,
      [req.params.id]
    ) as [any[], any];
    const versions: DesignVersionResponse[] = rows.map(r => ({
      id: r.id, version_no: r.version_no, file_path: r.file_path, original_path: r.original_path,
      original_filename: r.original_filename, mime_type: r.mime_type, file_size: r.file_size,
      change_note: r.change_note, reference_status: r.reference_status, uploaded_by: r.uploaded_by,
      uploaded_by_name: r.uploaded_by_name, created_at: r.created_at, is_current: !!r.is_current,
    }));
    res.json({ success: true, data: versions });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Upload a new design version — the previous versions are kept
router.post('/:id/versions', authenticateToken, requireRole(UPLOADERS), upload.single('design'), async (req: AuthRequest, res: express.Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Design file required' });
    }
    const found = await loadJobForUser(req, req.params.id);
    if (found.status === 404) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    if (found.job.status === 'archived') {
      return res.status(400).json({ success: false, message: 'Restore the job before uploading a new version' });
    }
    const company = (await listCompanies()).find(c => c.id === found.job.company_id)!;
    const { versionNo } = await withTransaction(conn => saveDesign({
      req, conn, company, jobNumber: found.job.job_number,
      designName: req.body.design_name || null, poNumber: null, file: req.file!,
      existingJobId: found.job.id, changeNote: req.body.change_note || null,
    }));
    res.json({ success: true, message: `Version ${versionNo} uploaded`, data: { version: versionNo } });
  } catch (error) {
    console.error('New version error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Edit details and/or replace the design — admins. A replaced design becomes a new version.
router.put('/:id', authenticateToken, requireRole(MANAGERS), upload.single('design'), async (req: AuthRequest, res: express.Response) => {
  try {
    const found = await loadJobForUser(req, req.params.id);
    if (found.status === 404) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const job = found.job;
    const { po_number, design_name } = req.body;
    const company = (await listCompanies()).find(c => c.id === job.company_id)!;

    await withTransaction(async conn => {
      if (req.file) {
        await saveDesign({
          req, conn, company, jobNumber: job.job_number, designName: null, poNumber: null,
          file: req.file, existingJobId: job.id, changeNote: req.body.change_note || 'Replaced by admin',
        });
      }
      await conn.execute(
        'UPDATE jobs SET po_number = ?, design_name = ? WHERE id = ?',
        [po_number || null, design_name || null, job.id]
      );
      if ((po_number || null) !== job.po_number || (design_name || null) !== job.design_name) {
        await audit(req, {
          action: 'job.update', entityType: 'job', entityId: job.id, companyId: job.company_id,
          details: {
            before: { po_number: job.po_number, design_name: job.design_name },
            after: { po_number: po_number || null, design_name: design_name || null },
          },
        }, conn);
      }
    });

    res.json({ success: true, message: 'Job updated successfully' });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Archive job — admins. Jobs and their files are never deleted, only hidden from use.
// Kept on DELETE so the existing admin screen keeps working. Optional reason in body or ?reason=
router.delete('/:id', authenticateToken, requireRole(MANAGERS), async (req: AuthRequest, res: express.Response) => {
  try {
    const found = await loadJobForUser(req, req.params.id);
    if (found.status === 404) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    if (found.job.status === 'archived') {
      return res.json({ success: true, message: 'Job is already archived' });
    }
    const reason = String(req.body?.reason || req.query.reason || '').slice(0, 255) || null;

    await withTransaction(async conn => {
      await conn.execute(
        "UPDATE jobs SET status = 'archived', archived_at = CURRENT_TIMESTAMP, archived_by = ?, archive_reason = ? WHERE id = ?",
        [req.user!.id, reason, found.job.id]
      );
      await audit(req, {
        action: 'job.archive', entityType: 'job', entityId: found.job.id, companyId: found.job.company_id,
        details: { job_number: found.job.job_number, reason },
      }, conn);
    });

    res.json({ success: true, message: 'Job archived. It no longer appears in searches and can be restored.' });
  } catch (error) {
    console.error('Archive job error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Restore an archived job — admins
router.post('/:id/restore', authenticateToken, requireRole(MANAGERS), async (req: AuthRequest, res: express.Response) => {
  try {
    const found = await loadJobForUser(req, req.params.id);
    if (found.status === 404) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    if (found.job.status !== 'archived') {
      return res.json({ success: true, message: 'Job is not archived' });
    }
    await withTransaction(async conn => {
      await conn.execute(
        "UPDATE jobs SET status = 'active', archived_at = NULL, archived_by = NULL, archive_reason = NULL WHERE id = ?",
        [found.job.id]
      );
      await audit(req, {
        action: 'job.restore', entityType: 'job', entityId: found.job.id, companyId: found.job.company_id,
        details: { job_number: found.job.job_number, was_archived_because: found.job.archive_reason },
      }, conn);
    });
    res.json({ success: true, message: 'Job restored' });
  } catch (error) {
    console.error('Restore job error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export { router as jobRoutes };
