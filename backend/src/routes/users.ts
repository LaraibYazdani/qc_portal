import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { ROLES, UserResponse } from '../models/User';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { visibleCompanyIds, canSee, scopeClause } from '../lib/companies';
import { audit } from '../lib/audit';

const router = express.Router();

// Group admins manage everyone; company admins manage users in their own companies.
const MANAGERS = ['admin', 'company_admin'];
const STATUSES = ['active', 'pending', 'disabled'];

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.company_id, u.sf_employee_id, u.status, u.auth_source,
         u.last_login_at, u.created_at, c.code AS company_code, c.name AS company_name
  FROM users u LEFT JOIN companies c ON u.company_id = c.id
  WHERE 1=1`;

function toUser(row: any): UserResponse & Record<string, unknown> {
  return {
    id: row.id, name: row.name, email: row.email, role: row.role,
    company_id: row.company_id, company_code: row.company_code, company_name: row.company_name,
    status: row.status, created_at: row.created_at,
    sf_employee_id: row.sf_employee_id, auth_source: row.auth_source, last_login_at: row.last_login_at,
  };
}

/** Company admins may not hand out group-admin rights or reach outside their own companies. */
async function checkAssignment(manager: any, role: string | undefined, companyId: number | null | undefined): Promise<string | null> {
  if (manager.role === 'admin') return null;
  if (role === 'admin') return 'Only a group admin can grant group admin access';
  if (companyId !== undefined) {
    const visible = await visibleCompanyIds(manager);
    if (companyId === null || !canSee(visible, companyId)) return 'You can only assign users to your own companies';
  }
  return null;
}

async function loadManagedUser(req: AuthRequest, id: string) {
  const [rows] = await pool.execute(`${USER_SELECT} AND u.id = ?`, [id]) as [any[], any];
  if (rows.length === 0) return null;
  if (req.user!.role !== 'admin' && !canSee(await visibleCompanyIds(req.user!), rows[0].company_id)) return null;
  return rows[0];
}

// List users
router.get('/', authenticateToken, requireRole(MANAGERS), async (req: AuthRequest, res: express.Response) => {
  try {
    const scope = scopeClause(await visibleCompanyIds(req.user!), 'u.company_id');
    const [rows] = await pool.execute(`${USER_SELECT}${scope.sql} ORDER BY u.created_at DESC`, scope.params) as [any[], any];
    res.json({ success: true, data: rows.map(toUser) });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create a local (email + password) user. SAP IAS users are created on their first sign-in.
router.post('/', authenticateToken, requireRole(MANAGERS), [
  body('name').notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(ROLES as unknown as string[]).withMessage(`Role must be one of: ${ROLES.join(', ')}`),
  body('company_id').optional({ nullable: true }).isInt(),
], async (req: AuthRequest, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role } = req.body;
    const companyId = req.body.company_id == null ? null : Number(req.body.company_id);

    const denied = await checkAssignment(req.user, role, companyId);
    if (denied) return res.status(403).json({ success: false, message: denied });
    if (role !== 'admin' && companyId === null) {
      return res.status(400).json({ success: false, message: 'Choose a company for this user' });
    }

    const [existingUsers] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]) as [any[], any];
    if (existingUsers.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [insertResult] = await pool.execute(
      'INSERT INTO users (name, email, password, role, company_id) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role, role === 'admin' ? null : companyId]
    ) as [any, any];

    await audit(req, { action: 'user.create', entityType: 'user', entityId: insertResult.insertId, companyId,
      details: { name, email, role } });

    res.json({ success: true, message: 'User created successfully', data: { id: insertResult.insertId } });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update user: name, email, role, company, status
router.put('/:id', authenticateToken, requireRole(MANAGERS), [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('role').optional().isIn(ROLES as unknown as string[]).withMessage(`Role must be one of: ${ROLES.join(', ')}`),
  body('company_id').optional({ nullable: true }).isInt(),
  body('status').optional().isIn(STATUSES).withMessage(`Status must be one of: ${STATUSES.join(', ')}`),
], async (req: AuthRequest, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await loadManagedUser(req, req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, email, role, status } = req.body;
    const companyId = 'company_id' in req.body
      ? (req.body.company_id == null ? null : Number(req.body.company_id))
      : undefined;

    const denied = await checkAssignment(req.user, role, companyId);
    if (denied) return res.status(403).json({ success: false, message: denied });
    if (existing.role === 'admin' && req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only a group admin can change a group admin' });
    }
    if (Number(req.params.id) === req.user!.id && (status && status !== 'active' || role && role !== req.user!.role)) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role or status' });
    }

    if (email && email !== existing.email) {
      const [emailCheck] = await pool.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.params.id]) as [any[], any];
      if (emailCheck.length > 0) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
    }

    const changes: Record<string, any> = {};
    if (name !== undefined) changes.name = name;
    if (email !== undefined) changes.email = email;
    if (role !== undefined) changes.role = role;
    if (companyId !== undefined) changes.company_id = companyId;
    if (status !== undefined) changes.status = status;

    const fields = Object.keys(changes);
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    await pool.execute(
      `UPDATE users SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`,
      [...Object.values(changes), req.params.id]
    );

    const before = Object.fromEntries(fields.map(f => [f, existing[f]]));
    await audit(req, {
      action: role !== undefined && role !== existing.role ? 'user.role_change' : 'user.update',
      entityType: 'user', entityId: req.params.id, companyId: companyId ?? existing.company_id,
      details: { before, after: changes },
    });

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// "Delete" disables the account: users are kept so every upload and check stays traceable.
router.delete('/:id', authenticateToken, requireRole(MANAGERS), async (req: AuthRequest, res: express.Response) => {
  try {
    const existing = await loadManagedUser(req, req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (existing.id === req.user!.id) {
      return res.status(400).json({ success: false, message: 'You cannot disable your own account' });
    }
    if (existing.role === 'admin' && req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only a group admin can disable a group admin' });
    }

    await pool.execute("UPDATE users SET status = 'disabled' WHERE id = ?", [existing.id]);
    await audit(req, { action: 'user.disable', entityType: 'user', entityId: existing.id, companyId: existing.company_id,
      details: { email: existing.email, previous_status: existing.status } });

    res.json({ success: true, message: 'User disabled. Their uploads and history are kept.' });
  } catch (error) {
    console.error('Disable user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export { router as userRoutes };
