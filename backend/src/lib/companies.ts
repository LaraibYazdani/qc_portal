import pool from '../config/database';

export interface Company {
  id: number;
  parent_id: number | null;
  code: string;
  name: string;
  sf_company_code: string | null;
  is_active: number;
}

export interface ScopedUser {
  id: number;
  role: string;
  company_id: number | null;
}

// The company tree is small and changes rarely, so it is cached briefly.
const CACHE_MS = 60_000;
let cache: { at: number; list: Company[] } | null = null;

export async function listCompanies(force = false): Promise<Company[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.list;
  const [rows] = await pool.execute(
    'SELECT id, parent_id, code, name, sf_company_code, is_active FROM companies ORDER BY name'
  ) as [any[], any];
  cache = { at: Date.now(), list: rows };
  return rows;
}

export function invalidateCompanyCache(): void {
  cache = null;
}

/** The company and every company below it in the tree. */
export function subtreeIds(list: Company[], rootId: number): number[] {
  const result = [rootId];
  for (let i = 0; i < result.length; i++) {
    for (const c of list) {
      if (c.parent_id === result[i]) result.push(c.id);
    }
  }
  return result;
}

/** The top-level legal entity a company belongs to. */
export function legalEntityOf(list: Company[], companyId: number): Company | undefined {
  let current = list.find(c => c.id === companyId);
  const seen = new Set<number>();
  while (current && current.parent_id !== null && !seen.has(current.id)) {
    seen.add(current.id);
    current = list.find(c => c.id === current!.parent_id);
  }
  return current;
}

export async function findCompanyByCode(code: string): Promise<Company | undefined> {
  return (await listCompanies()).find(c => c.code === code);
}

/**
 * Companies whose data a user may see: null = everything (group admin),
 * otherwise the user's company and everything under it.
 */
export async function visibleCompanyIds(user: ScopedUser): Promise<number[] | null> {
  if (user.role === 'admin') return null;
  if (!user.company_id) return [];
  return subtreeIds(await listCompanies(), user.company_id);
}

export function canSee(visible: number[] | null, companyId: number | null): boolean {
  return visible === null || (companyId !== null && visible.includes(companyId));
}

/** SQL fragment + params restricting `column` to the visible companies. */
export function scopeClause(visible: number[] | null, column: string): { sql: string; params: number[] } {
  if (visible === null) return { sql: '', params: [] };
  if (visible.length === 0) return { sql: ' AND 1 = 0', params: [] };
  return { sql: ` AND ${column} IN (${visible.map(() => '?').join(', ')})`, params: visible };
}
