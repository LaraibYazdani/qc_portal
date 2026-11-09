import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { ROLES, UserResponse } from '../models/User';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { visibleCompanyIds, canSee, scopeClause, listCompanies } from '../lib/companies';
import { audit } from '../lib/audit';
import { getEmployee, getBusinessUnitName, isValidEmployeeId, sfConfigured, SfError } from '../lib/successfactors';
import { placeEmployee, sfColumns, syncUser } from '../lib/sfSync';

const router = express.Router();

// Group admins manage everyone; company admins manage users in their own companies.
const MANAGERS = ['admin', 'company_admin'];
const STATUSES = ['active', 'pending', 'disabled'];

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.company_id, u.company_manual, u.sf_employee_id, u.status, u.auth_source,
         u.sf_company_code, u.sf_business_unit, u.sf_division, u.sf_job_title, u.sf_synced_at,
         u.last_login_at, u.created_at, c.code AS company_code, c.name AS company_name
  FROM users u LEFT JOIN companies c ON u.company_id = c.id
  WHERE 1=1`;

function toUser(row: any): UserResponse & Record<string, unknown> {
  return {
    id: row.id, name: row.name, email: row.email, role: row.role,
    company_id: row.company_id, company_code: row.company_code, company_name: row.company_name,
    company_manual: !!row.company_manual,
    status: row.status, created_at: row.created_at,
    sf_employee_id: row.sf_employee_id, auth_source: row.auth_source, last_login_at: row.last_login_at,
    sf_job_title: row.sf_job_title, sf_company_code: row.sf_company_code, sf_business_unit: row.sf_business_unit,
    sf_synced_at: row.sf_synced_at,
  };
}

function sfFailure(res: express.Response, e: unknown) {
  if (e instanceof SfError && !e.status) return res.status(400).json({ success: false, message: e.message });
  console.error('SuccessFactors error:', e);
  return res.status(502).json({ success: false, message: 'SuccessFactors could not be reached. Try again shortly.' });
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

// List users (?status=pending|active|disabled)
router.get('/', authenticateToken, requireRole(MANAGERS), async (req: AuthRequest, res: express.Response) => {
  try {
    const scope = scopeClause(await visibleCompanyIds(req.user!), 'u.company_id');
    const status = STATUSES.includes(String(req.query.status)) ? String(req.query.status) : null;
    const [rows] = await pool.execute(
      `${USER_SELECT}${scope.sql}${status ? ' AND u.status = ?' : ''} ORDER BY u.status = 'pending' DESC, u.created_at DESC`,
      status ? [...scope.params, status] : scope.params
    ) as [any[], any];
    res.json({ success: true, data: rows.map(toUser) });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Look an employee up in SuccessFactors before adding them: who they are, where the
// rules place them, and whether they already have an account.
router.get('/sf-lookup/:employeeId', authenticateToken, requireRole(MANAGERS), async (req: AuthRequest, res: express.Response) => {
  const employeeId = req.params.employeeId.trim();
  if (!sfConfigured()) return res.status(503).json({ success: false, message: 'SuccessFactors is not configured on this server' });
  if (!isValidEmployeeId(employeeId)) return res.status(400).json({ success: false, message: 'Enter a valid employee ID' });
  try {
    const emp = await getEmployee(employeeId);
    if (!emp) return res.status(404).json({ success: false, message: `No active employee ${employeeId} in SuccessFactors` });

    const company = await placeEmployee(emp);
    const [existing] = await pool.execute(
      `${USER_SELECT} AND (u.sf_employee_id = ? OR (u.sf_employee_id IS NULL AND u.email = ?))`, [employeeId, emp.email ?? '']
    ) as [any[], any];
    const visible = await visibleCompanyIds(req.user!);

    res.json({
      success: true,
      data: {
        employee: { ...emp, businessUnitName: await getBusinessUnitName(emp.businessUnit) },
        company: company ? { id: company.id, code: company.code, name: company.name } : null,
        can_assign: !!company && canSee(visible, company.id),
        existing_user: existing[0] ? toUser(existing[0]) : null,
      },
    });
  } catch (e) {
    sfFailure(res, e);
  }
});

// Add a user straight from SuccessFactors. They sign in with SAP; there is no password.
// A phase 1 account with the same email is linked instead of duplicated.
router.post('/from-sf', authenticateToken, requireRole(MANAGERS), [
  body('employee_id').trim().notEmpty().withMessage('Employee ID required'),
  body('role').isIn(ROLES as unknown as string[]).withMessage(`Role must be one of: ${ROLES.join(', ')}`),
  body('company_id').optional({ nullable: true }).isInt(),
], async (req: AuthRequest, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  if (!sfConfigured()) return res.status(503).json({ success: false, message: 'SuccessFactors is not configured on this server' });

  const employeeId = String(req.body.employee_id).trim();
  const role = String(req.body.role);
  if (!isValidEmployeeId(employeeId)) return res.status(400).json({ success: false, message: 'Enter a valid employee ID' });

  try {
    const emp = await getEmployee(employeeId);
    if (!emp) return res.status(404).json({ success: false, message: `No active employee ${employeeId} in SuccessFactors` });

    const placed = await placeEmployee(emp);
    const chosen = req.body.company_id == null ? null : Number(req.body.company_id);
    const manual = chosen !== null && chosen !== placed?.id;
    const companyId = role === 'admin' ? null : (chosen ?? placed?.id ?? null);
    if (manual && !(await listCompanies()).some(c => c.id === chosen)) {
      return res.status(400).json({ success: false, message: 'Unknown company' });
    }
    if (role !== 'admin' && companyId === null) {
      return res.status(400).json({ success: false, message: 'No SuccessFactors rule places this employee in a company. Choose one.' });
    }
    const denied = await checkAssignment(req.user, role, companyId);
    if (denied) return res.status(403).json({ success: false, message: denied });

    const [bySf] = await pool.execute('SELECT id FROM users WHERE sf_employee_id = ?', [employeeId]) as [any[], any];
    if (bySf.length) return res.status(409).json({ success: false, message: 'This employee already has an account', data: { id: bySf[0].id } });

    const [byEmail] = emp.email
      ? await pool.execute(`${USER_SELECT} AND u.email = ?`, [emp.email]) as [any[], any]
      : [[]] as any;
    const linkTo = byEmail[0];
    if (linkTo && linkTo.sf_employee_id) {
      return res.status(409).json({ success: false, message: `The email ${emp.email} belongs to another employee's account` });
    }
    if (linkTo && req.user!.role !== 'admin' && !canSee(await visibleCompanyIds(req.user!), linkTo.company_id)) {
      return res.status(403).json({ success: false, message: 'An account with this email exists outside your companies' });
    }

    const cols = sfColumns(emp);
    let userId: number;
    if (linkTo) {
      userId = linkTo.id;
      await pool.execute(
        `UPDATE users SET sf_employee_id = ?, auth_source = 'ias', role = ?, company_id = ?, company_manual = ?, status = 'active',
                sf_company_code = ?, sf_business_unit = ?, sf_division = ?, sf_job_title = ?, sf_synced_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [employeeId, role, companyId, manual ? 1 : 0, ...Object.values(cols), userId]);
      await audit(req, { action: 'user.link_sf', entityType: 'user', entityId: userId, companyId,
        details: { sf_employee_id: employeeId, matched_on: 'email', before: { role: linkTo.role, company_id: linkTo.company_id, status: linkTo.status },
                   after: { role, company_id: companyId, company_manual: manual } } });
    } else {
      const [result] = await pool.execute(
        `INSERT INTO users (name, email, password, role, company_id, company_manual, sf_employee_id, status, auth_source,
                            sf_company_code, sf_business_unit, sf_division, sf_job_title, sf_synced_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, 'active', 'ias', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [emp.name.slice(0, 100), emp.email && emp.email.length <= 191 ? emp.email : `sf-${employeeId}@no-email.invalid`,
         role, companyId, manual ? 1 : 0, employeeId, ...Object.values(cols)]
      ) as [any, any];
      userId = result.insertId;
      await audit(req, { action: 'user.create', entityType: 'user', entityId: userId, companyId,
        details: { source: 'successfactors', sf_employee_id: employeeId, name: emp.name, role,
                   company_rule: placed?.code ?? null, company_manual: manual } });
    }

    res.json({ success: true, message: linkTo ? 'Existing account linked to SuccessFactors' : 'User added', data: { id: userId, linked: !!linkTo } });
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'An account with this employee ID or email already exists' });
    if (e instanceof SfError) return sfFailure(res, e);
    console.error('Add user from SuccessFactors error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Refresh one user from SuccessFactors. { reset_company: true } drops a hand-picked
// company so the SuccessFactors rules decide again.
router.post('/:id/sf-sync', authenticateToken, requireRole(MANAGERS), async (req: AuthRequest, res: express.Response) => {
  if (!sfConfigured()) return res.status(503).json({ success: false, message: 'SuccessFactors is not configured on this server' });
  try {
    let user = await loadManagedUser(req, req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.sf_employee_id) return res.status(400).json({ success: false, message: 'This user is not linked to a SuccessFactors employee' });
    if (user.id === req.user!.id) return res.status(400).json({ success: false, message: 'You cannot sync your own account here' });

    if (req.body?.reset_company && user.company_manual) {
      await pool.execute('UPDATE users SET company_manual = 0 WHERE id = ?', [user.id]);
      await audit(req, { action: 'user.update', entityType: 'user', entityId: user.id, companyId: user.company_id,
        details: { before: { company_manual: 1 }, after: { company_manual: 0 }, reason: 'Company follows SuccessFactors again' } });
      user = { ...user, company_manual: 0 };
    }

    const emp = await getEmployee(user.sf_employee_id);
    if (emp) {
      const placed = await placeEmployee(emp);
      if (placed && !user.company_manual && req.user!.role !== 'admin' && !canSee(await visibleCompanyIds(req.user!), placed.id)) {
        return res.status(403).json({ success: false, message: `SuccessFactors now places this user in ${placed.name}, outside your companies. Ask a group admin.` });
      }
    }
    const result = await syncUser(req, user, emp);
    const [rows] = await pool.execute(`${USER_SELECT} AND u.id = ?`, [user.id]) as [any[], any];
    res.json({
      success: true,
      message: result.disabled ? 'Not an active employee in SuccessFactors: account disabled'
        : Object.keys(result.changes).length ? 'Updated from SuccessFactors' : 'Already up to date',
      data: { user: toUser(rows[0]), changes: result.changes, company_kept_manual: result.companyKeptManual },
    });
  } catch (e) {
    sfFailure(res, e);
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
    // A company picked by hand sticks: SuccessFactors syncs won't move this user any more.
    if (companyId !== undefined && companyId !== existing.company_id && existing.sf_employee_id) changes.company_manual = 1;
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
      action: existing.status === 'pending' && status === 'active' ? 'user.approve'
        : role !== undefined && role !== existing.role ? 'user.role_change' : 'user.update',
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
