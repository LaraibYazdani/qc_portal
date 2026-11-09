/**
 * Keeping portal users in step with SuccessFactors: which company an employee
 * belongs to, and refreshing a user's name, email and placement from their record.
 */
import { Request } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { listCompanies, Company } from './companies';
import { resolveCompanyId, SfMapping } from './sfCompanyResolver';
import { SfEmployee } from './successfactors';
import { audit } from './audit';

export async function loadMappings(): Promise<SfMapping[]> {
  const [rows] = await pool.execute(
    'SELECT id, company_id, sf_company_code, sf_field, match_type, sf_value, priority FROM company_sf_mappings'
  ) as [any[], any];
  return rows;
}

/** The company the SuccessFactors rules place this employee in, or undefined when no rule matches. */
export async function placeEmployee(emp: SfEmployee): Promise<Company | undefined> {
  const id = resolveCompanyId(emp as unknown as Record<string, unknown>, await loadMappings());
  if (id == null) return undefined;
  return (await listCompanies()).find(c => c.id === id && c.is_active);
}

/** The SuccessFactors fields kept on the user row. */
export function sfColumns(emp: SfEmployee) {
  return {
    sf_company_code: emp.company,
    sf_business_unit: emp.businessUnit,
    sf_division: emp.division,
    sf_job_title: emp.jobTitle ? emp.jobTitle.slice(0, 150) : null,
  };
}

export interface SyncResult {
  changes: Record<string, { before: unknown; after: unknown }>;
  disabled: boolean;
  companyKeptManual: boolean;
}

/**
 * Refresh one user from their SuccessFactors record (`emp`, or null when
 * SuccessFactors has no active employee with that ID, which disables the account).
 * Name, email, the SuccessFactors fields and, unless an admin placed the user by
 * hand, the company. Every real change is written to the audit log.
 */
export async function syncUser(req: Request | null, user: any, emp: SfEmployee | null, conn?: PoolConnection): Promise<SyncResult> {
  const db = conn ?? pool;

  if (!emp) {
    if (user.status === 'disabled') return { changes: {}, disabled: true, companyKeptManual: false };
    await db.execute("UPDATE users SET status = 'disabled', sf_synced_at = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);
    await audit(req, { action: 'user.disable', entityType: 'user', entityId: user.id, companyId: user.company_id,
      details: { reason: 'Not an active employee in SuccessFactors', sf_employee_id: user.sf_employee_id, previous_status: user.status } }, conn);
    return { changes: { status: { before: user.status, after: 'disabled' } }, disabled: true, companyKeptManual: false };
  }

  const wanted: Record<string, unknown> = { ...sfColumns(emp) };
  if (emp.name && emp.name.slice(0, 100) !== user.name) wanted.name = emp.name.slice(0, 100);
  if (emp.email && emp.email.length <= 191 && emp.email.toLowerCase() !== String(user.email ?? '').toLowerCase()) {
    const [taken] = await db.execute('SELECT id FROM users WHERE email = ? AND id <> ?', [emp.email, user.id]) as [any[], any];
    if (taken.length === 0) wanted.email = emp.email;
  }

  let companyKeptManual = false;
  const placed = await placeEmployee(emp);
  if (placed && placed.id !== user.company_id) {
    if (user.company_manual) companyKeptManual = true;
    else if (user.role !== 'admin') wanted.company_id = placed.id; // group admins stay group-wide
  }

  const changes: SyncResult['changes'] = {};
  for (const [k, v] of Object.entries(wanted)) {
    if ((user[k] ?? null) !== (v ?? null)) changes[k] = { before: user[k] ?? null, after: v ?? null };
  }

  const fields = Object.keys(changes);
  await db.execute(
    `UPDATE users SET ${[...fields.map(f => `${f} = ?`), 'sf_synced_at = CURRENT_TIMESTAMP'].join(', ')} WHERE id = ?`,
    [...fields.map(f => changes[f].after), user.id]
  );
  if (fields.length) {
    await audit(req, { action: 'user.sf_sync', entityType: 'user', entityId: user.id,
      companyId: (changes.company_id?.after as number | undefined) ?? user.company_id,
      details: { sf_employee_id: emp.userId, changes, company_kept_manual: companyKeptManual } }, conn);
  }
  return { changes, disabled: false, companyKeptManual };
}
