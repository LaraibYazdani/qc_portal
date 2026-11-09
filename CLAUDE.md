# QC Portal — CLAUDE.md

## Project Overview

**QC Portal** is an internal web app for quality control of carton printing artwork,
used across the Packages group of companies (multi-company, with sub-companies).
Quality checkers look up designs by job or PO number. Uploaders (sales/pre-press) upload designs. Admins manage everything.
Phase 1 is live with BSPL › Corrugated Division's artwork; phase 2 adds the photo-checking engine, SAP IAS login and a mobile app.

**Deployment Target**: company Windows server (Node.js backend serving the built React frontend)

---

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + TypeScript + Tailwind CSS (Vite)
- **Database**: MariaDB 10.4 in production (XAMPP), MySQL 8 compatible, via mysql2
- **Auth**: JWT session; email + password (bcryptjs) and SAP IAS (OpenID Connect, off until `IAS_ENABLED=true`)
- **SuccessFactors**: OData, OAuth SAML bearer, read-only (`src/lib/successfactors.ts`)
- **File Storage**: local disk, `backend/uploads/`, all access through `src/lib/storage.ts`
- **Architecture**: REST API (backend) + SPA (frontend)

## Rules for changes

- **Never delete records or files.** Jobs are archived, users disabled, designs versioned.
- **Every change that matters goes to `audit_log`** via `src/lib/audit.ts`, in the same transaction.
- **Every query on jobs/users is scoped by company** with `visibleCompanyIds()` / `scopeClause()` from `src/lib/companies.ts`.
- **Schema changes only through numbered migrations** in `sql/migrations/` with a rollback file in `sql/migrations/down/`. Never edit an applied migration.

---

## Directory Structure

```
qc_portal/
├── backend/
│   └── src/
│       ├── index.ts              # Express app entry point (port 5000)
│       ├── config/database.ts    # mysql2 connection pool
│       ├── middleware/auth.ts    # JWT check + loads the user from the DB on every request
│       ├── lib/
│       │   ├── companies.ts      # company tree, visibility scoping
│       │   ├── audit.ts          # append-only audit log
│       │   ├── storage.ts        # all file reads/writes (versioned design folders)
│       │   ├── sfCompanyResolver.ts  # SuccessFactors EmpJob → company (sub-company rules)
│       │   ├── successfactors.ts # SuccessFactors client (employee, business unit names; mock mode)
│       │   ├── sfSync.ts         # place an employee, refresh a user from SuccessFactors
│       │   ├── employeeSignIn.ts # SAP sign-in: find / link / register-as-pending
│       │   ├── ias.ts            # SAP IAS OIDC: PKCE, ID token signature check, one-time codes
│       │   ├── session.ts        # portal JWT
│       │   └── jobNumber.ts      # job number format, bulk file name parsing (mirrored in frontend/src/utils)
│       ├── models/               # User, Job types
│       ├── routes/
│       │   ├── auth.ts           # login, me, logout, config
│       │   ├── ias.ts            # /api/auth/ias/start | callback | exchange
│       │   ├── jobs.ts           # search, upload, bulk, versions, archive/restore
│       │   ├── users.ts          # user management (company-scoped), add/sync from SuccessFactors
│       │   └── companies.ts      # company tree, SuccessFactors mapping rules
│       └── scripts/
│           ├── migrate.ts        # migration runner (npm run migrate)
│           └── sfOrgLookup.ts    # business units / divisions of a company (npm run sf:org-lookup)
├── frontend/
│   └── src/
│       ├── contexts/AuthContext.tsx  # JWT auth state
│       └── ...pages and components
├── sql/
│   ├── migrations/              # numbered migrations + down/ rollbacks
│   └── schema.sql               # phase 1 schema (fresh installs: run it, then npm run migrate)
├── docs/RELEASE_MULTI_COMPANY.md  # release + rollback runbook
├── .env                         # Local dev env vars (never committed)
└── .env.example                 # Documents all required env vars
```

---

## Database Schema

- **companies**: tree via `parent_id`. Top level = legal entities with `sf_company_code` (EmpJob.company: 1000 PL, 1100 PCL, 1200 BSPL, …). Sub-companies below them (e.g. BSPL-CORR Corrugated Division).
- **company_sf_mappings**: rules placing a SuccessFactors employee in a company: company code + optional EmpJob field (`division`, `businessUnit`, `costCenter`, …) equals/prefix value. Most specific wins.
- **users**: id, name, email, password (NULL for IAS users), role, company_id (NULL = group admin), company_manual (1 = placed by hand, syncs keep it), sf_employee_id + SuccessFactors snapshot (sf_company_code, sf_business_unit, sf_division, sf_job_title, sf_synced_at), status (active/pending/disabled), auth_source, last_login_at
- **jobs**: job_number unique per legal entity, company_id, legal_entity_id, po_number, design_name, image_path (= current version's display file), status (active/archived), archive fields, current_version_id
- **design_versions**: every uploaded design per job (file_path, original_path, sha256, reference_status for the QC engine)
- **audit_log**: append-only (DB triggers block UPDATE/DELETE)
- **schema_migrations**: applied migrations

Default admin (fresh installs only): `admin@example.com` / `Admin@123`

---

## User Roles

Stored values are phase 1's so existing accounts keep working.

| Stored role | Shown as | Capabilities |
|------|------|-------------|
| `operator` | Quality checker | Search/view designs (public operator page also works without login for now) |
| `qc_supervisor` | QC supervisor | Quality checker + approvals (phase 3) |
| `sales` | Uploader | Upload designs and new versions, view own uploads |
| `company_admin` | Company admin | Manage jobs and users of their company and its sub-companies |
| `admin` | Group admin | Everything, all companies |

A user sees their own company and every company below it in the tree.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes | MySQL host (localhost for dev) |
| `DB_PORT` | Yes | MySQL port (3306) |
| `DB_NAME` | Yes | Database name (`qc_portal`) |
| `DB_USER` | Yes | MySQL username |
| `DB_PASS` | Yes | MySQL password |
| `JWT_SECRET` | Yes | Secret key for signing JWTs |
| `JWT_EXPIRES_IN` | No | Token expiry, default `24h` |
| `PORT` | No | Backend port, default `5000` |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | No | Frontend URL for CORS |
| `RATE_LIMIT_MAX` | No | Requests per IP per 15 min on /api, default `1000` |
| `TRUST_PROXY` | No | `1` behind IIS / a reverse proxy |
| `LEGACY_DEFAULT_COMPANY_CODE` | No | Company for uploads by users without a company, default `BSPL-CORR` |
| `SF_BASE_URL`, `SF_COMPANY_ID`, `SF_CLIENT_ID`, `SF_PRIVATE_KEY`, `SF_ECADMIN_USER_ID` | For SAP / user management | SuccessFactors OAuth; `SF_MOCK_MODE=true` for test employees |
| `IAS_ENABLED`, `IAS_ISSUER`, `IAS_CLIENT_ID`, `IAS_CLIENT_SECRET`, `IAS_REDIRECT_URI` | For SAP sign-in | Off unless `IAS_ENABLED=true`; see docs/RELEASE_MULTI_COMPANY.md |
| `COOKIE_SECURE` | No | `true` on HTTPS (sign-in state cookie) |

---

## Local Development

```bash
# Terminal 1 — Backend (http://localhost:5000)
cd backend && npm install && npm run dev

# Terminal 2 — Frontend (http://localhost:3000)
cd frontend && npm install && npm start
```

Frontend proxies `/api/*` and `/uploads/*` to `http://localhost:5000` via `frontend/vite.config.ts`.

Database changes: `cd backend && npm run migrate -- --status`, then `npm run migrate`.
Tests: `cd backend && npm test`.

---

## Changes Log

| Date | Change | Notes |
|------|--------|-------|
| 2026-04-13 | Initial UAT readiness pass | Migrated to Node.js + React |
| 2026-04-13 | Fixed login network error | Added proxy to frontend/package.json |
| 2026-04-13 | Fixed admin password hash | PHP bcrypt hash incompatible with bcryptjs — regenerated |
| 2026-04-13 | Removed Aiven/SSL dependencies | Using local MySQL only |
| 2026-11-08 | Multi-company foundation | Companies tree, design versions, archive instead of delete, audit log, migrations. See docs/RELEASE_MULTI_COMPANY.md |
| 2026-11-09 | SuccessFactors users + SAP sign-in | Users page (approve, add from SuccessFactors, sync), SAP IAS sign-in (off by default), job number checks on upload. Migration 006 |
