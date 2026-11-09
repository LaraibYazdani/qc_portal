/**
 * Database migrations for QC Portal.
 *
 *   npm run migrate                 apply every pending migration in sql/migrations
 *   npm run migrate -- --status     list applied / pending migrations
 *   npm run migrate -- --dry-run    show what would run, change nothing
 *   npm run migrate -- --down 004   undo one migration (runs sql/migrations/down/004_*.down.sql)
 *
 * Uses the same DB_* settings as the API. Take a full backup before running
 * against production: MySQL/MariaDB commit table changes immediately, so a
 * migration that fails half-way cannot be rolled back automatically.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const MIGRATIONS_DIR = path.join(__dirname, '../../../sql/migrations');
const DOWN_DIR = path.join(MIGRATIONS_DIR, 'down');

interface Migration {
  version: string;
  name: string;
  file: string;
  sql: string;
  checksum: string;
}

function loadMigrations(): Migration[] {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map(file => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      return {
        version: file.slice(0, 3),
        name: file.replace(/^\d{3}_/, '').replace(/\.sql$/, ''),
        file,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    });
}

async function connect() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'qc_portal',
    multipleStatements: true,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const conn = await connect();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(10) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const [appliedRows] = await conn.query('SELECT version, name, checksum, applied_at FROM schema_migrations') as [any[], any];
    const applied = new Map<string, any>(appliedRows.map((r: any) => [r.version, r]));
    const migrations = loadMigrations();
    const dbName = process.env.DB_NAME || 'qc_portal';

    if (args.includes('--status')) {
      console.log(`Database: ${dbName}`);
      for (const m of migrations) {
        const a = applied.get(m.version);
        const state = !a ? 'pending' : a.checksum !== m.checksum ? 'APPLIED (file changed since!)' : `applied ${new Date(a.applied_at).toISOString()}`;
        console.log(`  ${m.version} ${m.name.padEnd(24)} ${state}`);
      }
      return;
    }

    const downIndex = args.indexOf('--down');
    if (downIndex >= 0) {
      const version = args[downIndex + 1];
      if (!version || !applied.has(version)) {
        throw new Error(`Migration ${version ?? '(none given)'} is not applied.`);
      }
      const newer = [...applied.keys()].filter(v => v > version);
      if (newer.length) {
        throw new Error(`Undo newer migrations first: ${newer.sort().reverse().join(', ')}`);
      }
      const downFile = fs.readdirSync(DOWN_DIR).find(f => f.startsWith(`${version}_`));
      if (!downFile) throw new Error(`No rollback file for ${version} in ${DOWN_DIR}`);
      console.log(`Rolling back ${version} (${downFile}) on ${dbName}...`);
      await conn.query(fs.readFileSync(path.join(DOWN_DIR, downFile), 'utf8'));
      await conn.query('DELETE FROM schema_migrations WHERE version = ?', [version]);
      console.log('Done.');
      return;
    }

    for (const m of migrations) {
      const a = applied.get(m.version);
      if (a && a.checksum !== m.checksum) {
        throw new Error(`Migration ${m.file} was edited after it was applied. Add a new migration instead.`);
      }
    }
    const pending = migrations.filter(m => !applied.has(m.version));
    if (pending.length === 0) {
      console.log(`Database ${dbName} is up to date.`);
      return;
    }
    if (args.includes('--dry-run')) {
      console.log(`Would apply to ${dbName}: ${pending.map(m => m.file).join(', ')}`);
      return;
    }
    for (const m of pending) {
      process.stdout.write(`Applying ${m.file}... `);
      await conn.query(m.sql);
      await conn.query('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)',
        [m.version, m.name, m.checksum]);
      console.log('ok');
    }
    console.log(`Applied ${pending.length} migration(s) to ${dbName}.`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
