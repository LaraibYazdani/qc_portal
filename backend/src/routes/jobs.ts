import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { JobResponse, JobSearchRequest } from '../models/Job';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

// ── Upload directory ──────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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

// ── File processing ───────────────────────────────────────────────────────────
/**
 * Compress an uploaded file and write it to UPLOAD_DIR.
 * - JPEG/JPG : re-encode at quality 88 (retains sharp text, reduces size ~40-60%)
 * - PNG      : lossless optimisation + metadata stripping (no quality loss)
 * - PDF      : written as-is (binary compression requires external tools)
 *
 * Returns the saved filename (e.g. "JOB123.jpg").
 */
async function saveFile(
  buffer: Buffer,
  jobNumber: string,
  mime: string,
  originalName: string
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase().replace('.jpeg', '.jpg');
  const filename = `${jobNumber}${ext}`;
  const destPath = path.join(UPLOAD_DIR, filename);

  if (mime === 'image/jpeg') {
    await sharp(buffer)
      .jpeg({ quality: 88 })
      .toFile(destPath);
  } else if (mime === 'image/png') {
    await sharp(buffer)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(destPath);
  } else {
    // PDF — save directly
    fs.writeFileSync(destPath, buffer);
  }

  return filename;
}

function deleteFile(imagePath: string): void {
  try {
    // imagePath stored as "/uploads/JOB123.jpg" — extract just the filename
    const filename = path.basename(imagePath);
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {
    // Silently ignore — file may already be missing
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Search jobs — public, no auth
router.get('/search', async (req: express.Request, res: express.Response) => {
  try {
    const { job_number, po_number }: JobSearchRequest = req.query as any;

    let query = `
      SELECT j.*, u.name as uploaded_by_name
      FROM jobs j
      JOIN users u ON j.uploaded_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (job_number) {
      query += ' AND j.job_number = ?';
      params.push(job_number.toUpperCase());
    }
    if (po_number) {
      query += ' AND j.po_number = ?';
      params.push(po_number);
    }

    query += ' ORDER BY j.created_at DESC';

    const [rows] = await pool.execute(query, params) as [any[], any];
    const jobs: JobResponse[] = rows.map(row => ({
      id: row.id,
      job_number: row.job_number,
      po_number: row.po_number,
      design_name: row.design_name,
      image_path: row.image_path,
      uploaded_by: row.uploaded_by,
      uploaded_by_name: row.uploaded_by_name,
      created_at: row.created_at
    }));

    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('Search jobs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get all jobs — admin only
router.get('/', authenticateToken, requireRole(['admin']), async (_req: express.Request, res: express.Response) => {
  try {
    const [rows] = await pool.execute(`
      SELECT j.*, u.name as uploaded_by_name
      FROM jobs j
      JOIN users u ON j.uploaded_by = u.id
      ORDER BY j.created_at DESC
    `) as [any[], any];

    const jobs: JobResponse[] = rows.map(row => ({
      id: row.id,
      job_number: row.job_number,
      po_number: row.po_number,
      design_name: row.design_name,
      image_path: row.image_path,
      uploaded_by: row.uploaded_by,
      uploaded_by_name: row.uploaded_by_name,
      created_at: row.created_at
    }));

    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get current user's jobs — sales + admin
router.get('/my-jobs', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const user = (req as any).user;
    const userId = user.role === 'admin' ? undefined : user.id;

    let query = `
      SELECT j.*, u.name as uploaded_by_name
      FROM jobs j
      JOIN users u ON j.uploaded_by = u.id
    `;
    const params: any[] = [];

    if (userId) {
      query += ' WHERE j.uploaded_by = ?';
      params.push(userId);
    }

    query += ' ORDER BY j.created_at DESC';

    const [rows] = await pool.execute(query, params) as [any[], any];
    const jobs: JobResponse[] = rows.map(row => ({
      id: row.id,
      job_number: row.job_number,
      po_number: row.po_number,
      design_name: row.design_name,
      image_path: row.image_path,
      uploaded_by: row.uploaded_by,
      uploaded_by_name: row.uploaded_by_name,
      created_at: row.created_at
    }));

    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('Get my jobs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Upload new job — sales + admin
router.post('/', authenticateToken, requireRole(['admin', 'sales']), upload.single('design'), [
  body('job_number').notEmpty().withMessage('Job number required'),
  body('po_number').optional().isString(),
  body('design_name').optional().isString()
], async (req: express.Request, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { job_number, po_number, design_name } = req.body;
    const user = (req as any).user;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Design file required' });
    }

    const jobNumber = job_number.toUpperCase();

    // Reject duplicate job numbers
    const [existing] = await pool.execute(
      'SELECT id FROM jobs WHERE job_number = ?',
      [jobNumber]
    ) as [any[], any];

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Job number already exists' });
    }

    const filename = await saveFile(req.file.buffer, jobNumber, req.file.mimetype, req.file.originalname);
    const imagePath = `/uploads/${filename}`;

    await pool.execute(
      'INSERT INTO jobs (job_number, po_number, design_name, image_path, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      [jobNumber, po_number || null, design_name || null, imagePath, user.id]
    );

    res.json({ success: true, message: 'Job created successfully' });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Replace design — admin only
router.put('/:id', authenticateToken, requireRole(['admin']), upload.single('design'), async (req: express.Request, res: express.Response) => {
  try {
    const jobId = req.params.id;
    const { po_number, design_name } = req.body;

    const [existingJobs] = await pool.execute(
      'SELECT * FROM jobs WHERE id = ?',
      [jobId]
    ) as [any[], any];

    if (existingJobs.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const existingJob = existingJobs[0];
    let imagePath = existingJob.image_path;

    if (req.file) {
      // Delete old file from disk
      deleteFile(existingJob.image_path);

      // Save and compress new file
      const filename = await saveFile(
        req.file.buffer,
        existingJob.job_number,
        req.file.mimetype,
        req.file.originalname
      );
      imagePath = `/uploads/${filename}`;
    }

    await pool.execute(
      'UPDATE jobs SET po_number = ?, design_name = ?, image_path = ? WHERE id = ?',
      [po_number || null, design_name || null, imagePath, jobId]
    );

    res.json({ success: true, message: 'Job updated successfully' });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete job — admin only
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req: express.Request, res: express.Response) => {
  try {
    const jobId = req.params.id;

    const [existingJobs] = await pool.execute(
      'SELECT * FROM jobs WHERE id = ?',
      [jobId]
    ) as [any[], any];

    if (existingJobs.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    deleteFile(existingJobs[0].image_path);
    await pool.execute('DELETE FROM jobs WHERE id = ?', [jobId]);

    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export { router as jobRoutes };
