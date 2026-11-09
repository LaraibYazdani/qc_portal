import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import pool from '../config/database';
import { UserResponse, LoginRequest, LoginResponse } from '../models/User';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { audit } from '../lib/audit';
import { issueToken } from '../lib/session';
import { iasEnabled } from '../lib/ias';

const router = express.Router();

// Which sign-in methods the login page should offer
router.get('/config', (_req: express.Request, res: express.Response) => {
  res.json({ success: true, ias_enabled: iasEnabled(), password_login: true });
});

// Login endpoint (email + password). Stays available alongside SAP IAS during the changeover.
router.post('/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
], async (req: express.Request, res: express.Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password }: LoginRequest = req.body;

    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.password, u.role, u.company_id, u.status, u.created_at,
              c.code AS company_code, c.name AS company_name
       FROM users u LEFT JOIN companies c ON u.company_id = c.id
       WHERE u.email = ?`,
      [email]
    ) as [any[], any];

    const user = rows[0];
    // IAS-only accounts have no password; treat them like a wrong password
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: user.status === 'pending'
          ? 'Your account is waiting for an administrator to assign your access.'
          : 'Your account is disabled. Contact your administrator.',
      });
    }

    const token = issueToken(user);

    await pool.execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    (req as any).user = user;
    await audit(req, { action: 'auth.login', entityType: 'user', entityId: user.id, companyId: user.company_id,
      details: { method: 'password' } });

    const userResponse: UserResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
      company_code: user.company_code,
      company_name: user.company_name,
      status: user.status,
      created_at: user.created_at
    };

    const response: LoginResponse = { success: true, user: userResponse, token };
    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get current user (always fresh from the database)
router.get('/me', authenticateToken, async (req: AuthRequest, res: express.Response) => {
  res.json({ success: true, user: req.user });
});

// Logout endpoint (client-side token removal)
router.post('/logout', authenticateToken, (_req: express.Request, res: express.Response) => {
  res.json({ success: true, message: 'Logout successful' });
});

export { router as authRoutes };
