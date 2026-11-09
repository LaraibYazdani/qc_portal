import express from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { listCompanies, invalidateCompanyCache, visibleCompanyIds } from '../lib/companies';
import { audit } from '../lib/audit';

const router = express.Router();

const SF_FIELDS = ['division', 'businessUnit', 'department', 'costCenter', 'location', 'customString21'];

// Company tree. Everyone signed in gets the companies they can see (for pickers);
// group admins get all of them.
router.get('/', authenticateToken, async (req: AuthRequest, res: express.Response) => {
  try {
    const visible = await visibleCompanyIds(req.user!);
    const list = (await listCompanies(true)).filter(c => visible === null || visible.includes(c.id));
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Add a company or sub-company — group admins
router.post('/', authenticateToken, requireRole(['admin']), [
  body('code').trim().matches(/^[A-Z0-9-]{2,30}$/).withMessage('Code: 2–30 capital letters, digits or dashes, e.g. PCL-FLEX'),
  body('name').trim().notEmpty().withMessage('Name required'),
  body('parent_id').optional({ nullable: true }).isInt(),
  body('sf_company_code').optional({ nullable: true }).isString(),
], async (req: AuthRequest, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { code, name } = req.body;
    const parentId = req.body.parent_id == null ? null : Number(req.body.parent_id);
    const sfCode = req.body.sf_company_code || null;
    const companies = await listCompanies(true);

    if (companies.some(c => c.code === code)) {
      return res.status(400).json({ success: false, message: 'A company with that code already exists' });
    }
    if (parentId !== null && !companies.some(c => c.id === parentId)) {
      return res.status(400).json({ success: false, message: 'Parent company not found' });
    }
    if (parentId === null && !sfCode) {
      return res.status(400).json({ success: false, message: 'A top-level company needs its SuccessFactors company code' });
    }

    const [ins] = await pool.execute(
      'INSERT INTO companies (parent_id, code, name, sf_company_code) VALUES (?, ?, ?, ?)',
      [parentId, code, name, parentId === null ? sfCode : null]
    ) as [any, any];
    invalidateCompanyCache();
    await audit(req, { action: 'company.create', entityType: 'company', entityId: ins.insertId, companyId: ins.insertId,
      details: { code, name, parent_id: parentId, sf_company_code: sfCode } });

    res.json({ success: true, message: 'Company created', data: { id: ins.insertId } });
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Rename or deactivate — group admins. Companies are never deleted (records point at them).
router.put('/:id', authenticateToken, requireRole(['admin']), [
  body('name').optional().trim().notEmpty(),
  body('is_active').optional().isBoolean(),
], async (req: AuthRequest, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const company = (await listCompanies(true)).find(c => c.id === Number(req.params.id));
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    const name = req.body.name ?? company.name;
    const isActive = req.body.is_active === undefined ? company.is_active : (req.body.is_active ? 1 : 0);
    await pool.execute('UPDATE companies SET name = ?, is_active = ? WHERE id = ?', [name, isActive, company.id]);
    invalidateCompanyCache();
    await audit(req, { action: 'company.update', entityType: 'company', entityId: company.id, companyId: company.id,
      details: { before: { name: company.name, is_active: company.is_active }, after: { name, is_active: isActive } } });

    res.json({ success: true, message: 'Company updated' });
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// SuccessFactors → company rules
router.get('/sf-mappings', authenticateToken, requireRole(['admin']), async (_req, res: express.Response) => {
  try {
    const [rows] = await pool.execute(
      `SELECT m.*, c.code AS company_code, c.name AS company_name
       FROM company_sf_mappings m JOIN companies c ON m.company_id = c.id
       ORDER BY m.sf_company_code, m.sf_field IS NULL, m.priority DESC, m.id`
    ) as [any[], any];
    res.json({ success: true, data: rows, fields: SF_FIELDS });
  } catch (error) {
    console.error('Get mappings error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/sf-mappings', authenticateToken, requireRole(['admin']), [
  body('company_id').isInt(),
  body('sf_company_code').trim().notEmpty(),
  body('sf_field').optional({ nullable: true }).isIn(SF_FIELDS),
  body('match_type').optional().isIn(['equals', 'prefix']),
  body('sf_value').optional({ nullable: true }).isString(),
  body('priority').optional().isInt(),
], async (req: AuthRequest, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { company_id, sf_company_code, note } = req.body;
    const sfField = req.body.sf_field || null;
    const sfValue = req.body.sf_value || null;
    if (sfField && !sfValue) {
      return res.status(400).json({ success: false, message: 'Give the value to match for that field' });
    }

    const [ins] = await pool.execute(
      `INSERT INTO company_sf_mappings (company_id, sf_company_code, sf_field, match_type, sf_value, priority, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [company_id, sf_company_code, sfField, req.body.match_type || 'equals', sfValue, req.body.priority ?? 0, note || null]
    ) as [any, any];
    await audit(req, { action: 'company.mapping_create', entityType: 'company_sf_mapping', entityId: ins.insertId,
      companyId: Number(company_id), details: req.body });

    res.json({ success: true, message: 'Rule added', data: { id: ins.insertId } });
  } catch (error) {
    console.error('Create mapping error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/sf-mappings/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: express.Response) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM company_sf_mappings WHERE id = ?', [req.params.id]) as [any[], any];
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Rule not found' });
    await pool.execute('DELETE FROM company_sf_mappings WHERE id = ?', [req.params.id]);
    await audit(req, { action: 'company.mapping_delete', entityType: 'company_sf_mapping', entityId: req.params.id,
      companyId: rows[0].company_id, details: rows[0] });
    res.json({ success: true, message: 'Rule removed' });
  } catch (error) {
    console.error('Delete mapping error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export { router as companyRoutes };
