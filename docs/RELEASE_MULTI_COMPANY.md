# Release runbook: multi-company foundation

Upgrades the live QC Portal (phase 1) to companies, sub-companies, design versions,
archiving and an audit log, **without moving or removing anything that exists**.

## What changes for users

| Before | After |
|---|---|
| One flat list of jobs | Every job belongs to a company. All existing jobs belong to **BSPL › Corrugated Division**. |
| Replacing a design deleted the old file | A replaced design is saved as a **new version**; earlier versions are kept. |
| Admin "Delete" removed the job and its file | Becomes **Archive**: hidden from search, kept for audit, can be restored. |
| Roles: sales, admin, operator | Same accounts, same stored roles, shown as Uploader / Group admin / Quality checker. New roles: QC supervisor, Company admin. |
| Role or account changes took effect when the 24h token expired | Take effect on the next request. |
| Empty operator search returned every job | Returns nothing; normal searches are unchanged. |
| Bad file type returned "Internal server error" | Returns a clear message. |

Nothing else changes: same URLs, same pages, same login, artwork files stay at `/uploads/<JOB>.jpg`.

## What the database migration does

| File | Change |
|---|---|
| `001_companies.sql` | `companies` tree (11 legal entities from SuccessFactors + BSPL › Corrugated Division) and `company_sf_mappings` rules |
| `002_users_identity.sql` | Users get company, SuccessFactors ID, status, login source. Non-admin users → BSPL › Corrugated Division |
| `003_jobs_versions.sql` | Jobs get company, status/archive fields, current version. Job numbers unique **per legal entity**. `design_versions` table: version 1 of every existing job points at its current file. Safety trigger fills the company if phase 1 code inserts a job. |
| `004_audit_log.sql` | Append-only `audit_log` (database triggers refuse edits and deletes) + one entry recording the import |
| `005_bspl_corrugated_mapping.sql` | SuccessFactors rule: company 1200 + `businessUnit` 10000020 ("Business Unit Corrugated Boxes") → BSPL › Corrugated Division. Recorded in `audit_log` |

Only additions. The phase 1 code can still run against the upgraded database.

## Steps

1. **Rehearse** on a copy of the production database (see below). Do not skip.
2. Announce a short maintenance window (≈10 minutes).
3. **Back up** on the server:
   ```
   mysqldump --single-transaction --routines --triggers -u <user> -p qc_portal > qc_portal_before_multicompany.sql
   ```
   and copy the whole `backend\uploads` folder.
4. Stop the API service.
5. Deploy the new code (`git pull`, then `npm ci && npm run build` in `backend` and `frontend`).
6. Migrate:
   ```
   cd backend
   npm run migrate:prod -- --dry-run     # lists 001-005
   npm run migrate:prod
   npm run migrate:prod -- --status      # all five "applied"
   ```
7. Start the API service.
8. Check (see the checklist below).

## Checks after release

- [ ] Log in as each existing account; the navbar shows the role label and company.
- [ ] Operator page: search a known job number → the design shows as before.
- [ ] Admin page lists 4,435 jobs, company "Corrugated Division".
- [ ] Upload a test job → appears with v1; its files are under `uploads/BSPL-CORR/<JOB>/v1/`.
- [ ] Archive the test job → gone from operator search; `audit_log` has `job.create` and `job.archive`.
- [ ] `SELECT COUNT(*) FROM design_versions` = number of jobs (+ test uploads).

## Rollback

Code: redeploy the previous release. Phase 1 code works on the upgraded database, so
rolling back the code alone is usually enough.

Database (only if needed), newest first:
```
npm run migrate:prod -- --down 005
npm run migrate:prod -- --down 004
npm run migrate:prod -- --down 003
npm run migrate:prod -- --down 002
npm run migrate:prod -- --down 001
```
Or restore the backup from step 3. Each rollback file states what it cannot undo
(for example, the same job number created by two companies after the upgrade).

## Rehearsal on a copy

On any machine with MariaDB 10.4 (production engine) or MySQL 8:
```
CREATE DATABASE qc_portal_rehearsal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- import the production dump into it, then:
set DB_NAME=qc_portal_rehearsal
npm run migrate -- --status
npm run migrate
npm run migrate -- --down 005   (… down to 001, then migrate again: proves rollback works)
```
Then start the API against the rehearsal database and run the checklist above.

## Open decisions (settings, no code change needed)

- **Job number uniqueness**: currently per legal entity. If sub-companies of the same
  legal entity may reuse numbers, a small migration changes the unique key to per-company.
- **Sub-company rules**: settled for BSPL: `businessUnit` (migration 005). For other
  companies with sub-companies (e.g. PCL), run `npm run sf:org-lookup -- --company 1100`
  to see their business units and add rules with `POST /api/companies/sf-mappings`.
