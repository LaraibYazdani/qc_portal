import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { UserResponse } from '../models/User';

/** The portal session token. Only the user id matters: the user is reloaded from the database on every request. */
export function issueToken(user: { id: number; name: string; email: string; role: string }): string {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any }
  );
}

export async function loadPublicUser(id: number): Promise<UserResponse | null> {
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role, u.company_id, u.status, u.created_at,
            c.code AS company_code, c.name AS company_name
     FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = ?`,
    [id]
  ) as [any[], any];
  return rows[0] ?? null;
}
