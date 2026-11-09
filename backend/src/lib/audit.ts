import { Request } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';

export interface AuditEntry {
  action: string;              // e.g. job.create, job.archive, user.role_change
  entityType: string;          // e.g. job, user, company
  entityId?: string | number | null;
  companyId?: number | null;
  details?: Record<string, unknown>;
}

/**
 * Append one entry to the audit log. Pass `conn` to write inside the same
 * transaction as the change being recorded, so both commit or neither does.
 */
export async function audit(req: Request | null, entry: AuditEntry, conn?: PoolConnection): Promise<void> {
  const user = (req as any)?.user;
  const actorLabel = user ? `${user.name} <${user.email}>` : 'system';
  const db = conn ?? pool;
  await db.execute(
    `INSERT INTO audit_log (actor_user_id, actor_label, company_id, action, entity_type, entity_id, details, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user?.id ?? null,
      actorLabel.slice(0, 191),
      entry.companyId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId == null ? null : String(entry.entityId),
      entry.details ? JSON.stringify(entry.details) : null,
      req?.ip ?? null,
      (req?.headers['user-agent'] ?? '').toString().slice(0, 255) || null,
    ]
  );
}
