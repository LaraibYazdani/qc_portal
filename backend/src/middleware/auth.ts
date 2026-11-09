import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { AuthUser } from '../models/User';

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Verifies the Bearer token, then loads the user from the database on every
 * request: a disabled account, a role change or a company move takes effect
 * immediately instead of when the token expires.
 */
export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.role, u.company_id, u.status, u.created_at,
              c.code AS company_code, c.name AS company_name
       FROM users u LEFT JOIN companies c ON u.company_id = c.id
       WHERE u.id = ?`,
      [decoded.id]
    ) as [any[], any];

    if (rows.length === 0 || rows[0].status !== 'active') {
      res.status(401).json({ error: 'Your account is disabled or no longer exists. Contact your administrator.' });
      return;
    }

    req.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
