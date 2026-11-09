/**
 * What happens when an employee signs in with SAP: find (or link, or register)
 * their portal account and bring it in line with SuccessFactors.
 */
import { Request } from 'express';
import pool from '../config/database';
import { getEmployee, sfConfigured, SfEmployee } from './successfactors';
import { placeEmployee, sfColumns, syncUser } from './sfSync';
import { audit } from './audit';

export type SignInOutcome = 'active' | 'pending' | 'disabled' | 'not_in_sf' | 'sf_unavailable';

const USER_COLUMNS = `id, name, email, role, company_id, company_manual, status, auth_source, sf_employee_id,
  sf_company_code, sf_business_unit, sf_division, sf_job_title`;

async function findUser(where: string, value: string) {
  const [rows] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users WHERE ${where}`, [value]) as [any[], any];
  return rows[0] ?? null;
}

export async function signInEmployee(req: Request, employeeId: string): Promise<{ outcome: SignInOutcome; userId?: number }> {
  let emp: SfEmployee | null = null;
  let sfDown = !sfConfigured();
  if (!sfDown) {
    try { emp = await getEmployee(employeeId); } catch (e) { sfDown = true; console.error('[ias] SuccessFactors lookup failed:', (e as Error).message); }
  }

  let user = await findUser('sf_employee_id = ?', employeeId);

  // A phase 1 account with the same email: link it instead of creating a second account.
  if (!user && emp?.email) {
    const byEmail = await findUser('email = ? AND sf_employee_id IS NULL', emp.email);
    if (byEmail) {
      await pool.execute("UPDATE users SET sf_employee_id = ?, auth_source = 'ias' WHERE id = ?", [employeeId, byEmail.id]);
      await audit(req, { action: 'user.link_sf', entityType: 'user', entityId: byEmail.id, companyId: byEmail.company_id,
        details: { sf_employee_id: employeeId, matched_on: 'email' } });
      user = { ...byEmail, sf_employee_id: employeeId };
    }
  }

  if (!user) {
    if (sfDown) return { outcome: 'sf_unavailable' };
    if (!emp) return { outcome: 'not_in_sf' };
    return { outcome: 'pending', userId: await registerPending(req, emp) };
  }

  // SuccessFactors unreachable: existing accounts keep working on what we already know.
  if (!sfDown) {
    await syncUser(req, user, emp);
    user = await findUser('id = ?', String(user.id));
  }

  if (user.status !== 'active') return { outcome: user.status, userId: user.id };

  await pool.execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
  (req as any).user = user;
  await audit(req, { action: 'auth.login', entityType: 'user', entityId: user.id, companyId: user.company_id,
    details: { method: 'ias', sf_employee_id: employeeId, sf_checked: !sfDown } });
  return { outcome: 'active', userId: user.id };
}

/** First SAP sign-in of someone without an account: kept waiting, with no access, until an admin approves. */
async function registerPending(req: Request, emp: SfEmployee): Promise<number> {
  const company = await placeEmployee(emp);
  let email = emp.email && emp.email.length <= 191 ? emp.email : null;
  if (email && await findUser('email = ?', email)) email = null;
  email ??= `sf-${emp.userId}@no-email.invalid`;

  const [result] = await pool.execute(
    `INSERT INTO users (name, email, password, role, company_id, sf_employee_id, status, auth_source,
                        sf_company_code, sf_business_unit, sf_division, sf_job_title, sf_synced_at)
     VALUES (?, ?, NULL, 'operator', ?, ?, 'pending', 'ias', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [emp.name.slice(0, 100), email, company?.id ?? null, emp.userId, ...Object.values(sfColumns(emp))]
  ) as [any, any];

  await audit(req, { action: 'user.self_register', entityType: 'user', entityId: result.insertId, companyId: company?.id ?? null,
    details: { sf_employee_id: emp.userId, company: company?.code ?? null, sf_company_code: emp.company, sf_business_unit: emp.businessUnit } });
  return result.insertId;
}
