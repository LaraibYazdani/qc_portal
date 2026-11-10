# PackVision — CLAUDE.md

## Project Overview

**PackVision** (formerly QC Portal) is an internal web app for quality control of carton printing artwork,
used across the Packages group of companies (multi-company, with sub-companies).
Quality checkers look up designs by job or PO number. Uploaders (sales/pre-press) upload designs. Admins manage everything.
Phase 1 is live with BSPL › Corrugated Division's artwork; phase 2 adds the photo-checking engine, SAP IAS login and a mobile app.

**Deployment Target**: https://packvision.packagesgroup.com on the company Windows server (IIS → uvicorn on 127.0.0.1:5100, see docs/DEPLOY_WINDOWS.md). One Python process (uvicorn) serves the API and, with
`NODE_ENV=production`, the built React app. It must run as a single process: SAP sign-in state is held in memory.

---

## Tech Stack

- **API**: Python 3.12 + FastAPI (`server/`), plain SQL through PyMySQL (pooled by SQLAlchemy)
- **Web app**: React 18 + TypeScript + Tailwind CSS (Vite) (`frontend/`)
- **Database**: MariaDB 10.4 in production (XAMPP), MySQL 8 compatible
- **Auth**: JWT session; email + password (bcrypt) and SAP IAS (OpenID Connect, off until `IAS_ENABLED=true`)
- **SuccessFactors**: OData, OAuth SAML bearer, read-only (`server/app/lib/successfactors.py`)
- **File Storage**: local disk, `backend/uploads/` (phase 1's files), all access through `server/app/lib/storage.py`
- **Print-check engine** (`server/app/engine/`, from the print-qc-vision proof of concept, algorithm unchanged): OpenCV,
  NumPy, scikit-image, PyMuPDF. Runs only in worker processes fed from database queues (`app/lib/engine_runner.py`),
  never in a request and never imported by the web process. Off unless `ENGINE_ENABLED=true`.

The API kept every route and response of the earlier Node/Express API, so the web app and test scripts are unchanged.
The Node code is in Git history (branch `feature/multi-company-foundation`).

## Rules for changes

- **Never delete records or files.** Jobs are archived, users disabled, designs versioned.
- **Every change that matters goes to `audit_log`** via `app/lib/audit.py`, in the same transaction (`conn=`).
- **Every query on jobs/users is scoped by company** with `visible_company_ids()` / `scope_clause()` from `app/lib/companies.py`.
- **Schema changes only through numbered migrations** in `sql/migrations/` with a rollback file in `sql/migrations/down/`. Never edit an applied migration.
- **SQL uses `%s` placeholders** (PyMySQL): write a literal `%` as `%%` in a query that has parameters.
- **Keep JSON shapes** the web app relies on: `{ success, data | message }`, validation errors as `{ errors: [{ msg, path }] }`.
- **Engine tuning lives in `app/engine/settings.py`** and changes only with evidence: re-run the 48 simulated photos
  (results must stay identical unless the change is intended) and, after calibration, the real-photo set.
- **A photo is checked only against an approved reference** (current design version, `reference_status = 'approved'`).

---

## Directory Structure

```
qc_portal/
├── server/                        # Python API
│   ├── app/
│   │   ├── main.py                # FastAPI app: middleware, error shapes, routes, static files
│   │   ├── config.py              # settings (.env: server/.env, else backend/.env)
│   │   ├── db.py                  # pooled PyMySQL: db.all / one / execute, transaction()
│   │   ├── http.py                # JSON response, ApiError / fail() / invalid(), body + client IP helpers
│   │   ├── security.py            # JWT, current user (reloaded every request), role dependencies
│   │   ├── validate.py            # small request checks
│   │   ├── lib/
│   │   │   ├── companies.py       # company tree, visibility scoping
│   │   │   ├── audit.py           # append-only audit log
│   │   │   ├── storage.py         # all file reads/writes (versioned design folders)
│   │   │   ├── sf_resolver.py     # SuccessFactors EmpJob → company (sub-company rules)
│   │   │   ├── successfactors.py  # SuccessFactors client (employee, business unit names; mock mode)
│   │   │   ├── sf_sync.py         # place an employee, refresh a user from SuccessFactors
│   │   │   ├── employee_sign_in.py # SAP sign-in: find / link / register-as-pending
│   │   │   ├── ias.py             # SAP IAS OIDC: PKCE, ID token signature check, one-time codes
│   │   │   ├── job_number.py      # job number format, bulk file name parsing (mirrored in frontend/src/utils)
│   │   │   └── engine_runner.py   # DB-queued engine work → worker process pools (checks / references)
│   │   ├── engine/                # print-check engine: reference, align, compare, check, worker, settings
│   │   └── routes/                # auth, ias, jobs, users, companies, checks (references + inspections)
│   ├── scripts/
│   │   ├── migrate.py             # migration runner (--status, --dry-run, --down NNN)
│   │   └── sf_org_lookup.py       # business units / divisions of a company in SuccessFactors
│   ├── tests/                     # pytest
│   ├── requirements.txt
│   └── .env.example
├── frontend/src/
│   ├── components/ui.tsx          # design system: Button, Input, Card, Badge, Alert, Modal, Stat, Thumb, Artwork…
│   ├── components/AppShell.tsx    # sidebar layout (role-based nav), public layout, brand mark
│   ├── components/DesignPreview.tsx # artwork + details + version history dialog
│   ├── components/PrintCheck.tsx  # "Check a print" under a lookup result; InspectionView.tsx shows a result
│   ├── contexts/AuthContext.tsx   # session, SAP one-time code exchange
│   ├── pages/                     # Login, OperatorView (lookup), Upload, BulkUpload, MyJobs, Admin (overview), Users,
│   │                              # Checks (print check history), References (supervisor review)
│   └── utils/                     # api.ts (fetch + token), jobNumber.ts
├── backend/uploads/               # design files (phase 1 + new versioned folders); not in Git
├── sql/
│   ├── migrations/                # numbered migrations + down/ rollbacks
│   └── schema.sql                 # phase 1 schema (fresh installs: run it, then migrate)
└── docs/RELEASE_MULTI_COMPANY.md  # release + rollback runbook
```

---

## Design (web app)

Ink sidebar (`ink-950`), canvas background, white cards, one accent (`brand-600`); green/red reserved for pass/fail.
Inter (bundled via `@fontsource-variable/inter`, works offline), job numbers in monospace (`.job-number`).
Build pages from `components/ui.tsx`; don't hand-style buttons, inputs or alerts. Use `Modal` instead of
`window.confirm/prompt`. Images go through `Artwork`/`Thumb` (graceful fallback when a file is missing).

---

## Database Schema

- **companies**: tree via `parent_id`. Top level = legal entities with `sf_company_code` (EmpJob.company: 1000 PL, 1100 PCL, 1200 BSPL, …). Sub-companies below them (e.g. BSPL-CORR Corrugated Division).
- **company_sf_mappings**: rules placing a SuccessFactors employee in a company: company code + optional EmpJob field (`division`, `businessUnit`, `costCenter`, …) equals/prefix value. Most specific wins. BSPL Corrugated = `businessUnit` 10000020.
- **users**: id, name, email, password (NULL for IAS users), role, company_id (NULL = group admin), company_manual (1 = placed by hand, syncs keep it), sf_employee_id + SuccessFactors snapshot (sf_company_code, sf_business_unit, sf_division, sf_job_title, sf_synced_at), status (active/pending/disabled), auth_source, last_login_at
- **jobs**: job_number unique per legal entity, company_id, legal_entity_id, po_number, design_name, image_path (= current version's display file), status (active/archived), archive fields, current_version_id
- **design_versions**: every uploaded design per job (file_path, original_path, sha256). Engine reference:
  reference_status (not_started → queued → processing → needs_review → approved / rejected / failed), reference_dir,
  reference_meta (panels, compared share, inks, preview URLs), reference_error, reviewed by/at + note
- **inspections**: one per photo checked: job, design version, company, status (queued/processing/done/failed),
  verdict PASS/FAIL/RETAKE, sensitivity, source (web/mobile/camera), photo + result folder, result JSON, inspector. Never deleted.
- **audit_log**: append-only (DB triggers block UPDATE/DELETE)
- **schema_migrations**: applied migrations (checksums taken with LF line endings)

Default admin (fresh installs only): `admin@example.com` / `Admin@123`

---

## User Roles

Stored values are phase 1's so existing accounts keep working.

| Stored role | Shown as | Capabilities |
|------|------|-------------|
| `operator` | Quality checker | Search/view designs (public lookup page also works without login), check prints |
| `qc_supervisor` | QC supervisor | Quality checker + approve/reject engine references |
| `sales` | Uploader | Upload designs and new versions, view own uploads |
| `company_admin` | Company admin | Manage jobs and users of their company and its sub-companies |
| `admin` | Group admin | Everything, all companies |

A user sees their own company and every company below it in the tree.

---

## Environment Variables (server/.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` | Yes | Database |
| `JWT_SECRET` | Yes | Secret key for signing session tokens |
| `JWT_EXPIRES_IN` | No | Token expiry, default `24h` |
| `PORT` | No | API port, default `5000` |
| `NODE_ENV` | No | `production` also serves `frontend/build` (name kept from the Node API) |
| `CORS_ORIGIN` | No | Web app URL for CORS |
| `UPLOAD_DIR` | No | Design files folder, default `backend/uploads` |
| `RATE_LIMIT_MAX` | No | Requests per IP per 15 min on /api, default `1000` |
| `TRUST_PROXY` | No | `1` behind IIS / a reverse proxy |
| `LEGACY_DEFAULT_COMPANY_CODE` | No | Company for uploads by users without a company, default `BSPL-CORR` |
| `SF_BASE_URL`, `SF_COMPANY_ID`, `SF_CLIENT_ID`, `SF_PRIVATE_KEY`, `SF_ECADMIN_USER_ID` | For SAP / user management | SuccessFactors OAuth; `SF_MOCK_MODE=true` for test employees |
| `IAS_ENABLED`, `IAS_ISSUER`, `IAS_CLIENT_ID`, `IAS_CLIENT_SECRET`, `IAS_REDIRECT_URI` | For SAP sign-in | Off unless `IAS_ENABLED=true`; see docs/RELEASE_MULTI_COMPANY.md |
| `COOKIE_SECURE` | No | `true` on HTTPS (sign-in state cookie) |
| `ENGINE_ENABLED` | No | `true` runs print checks (needs the new server); off, references still queue |
| `ENGINE_WORKERS`, `ENGINE_REFERENCE_WORKERS` | No | Worker processes for checks (default 2) and reference preparation (default 1) |

---

## Local Development

```powershell
# API (http://localhost:5000)
cd server; .venv\Scripts\python -m uvicorn app.main:app --port 5000 --reload

# Web app (http://localhost:3000)
cd frontend; npm start
```

The web app proxies `/api/*` and `/uploads/*` to `http://localhost:5000` (`frontend/vite.config.ts`).

Database changes: `cd server; .venv\Scripts\python scripts\migrate.py --status`, then without `--status`.
Tests: `cd server; .venv\Scripts\python -m pytest`. Type-check the web app: `cd frontend; npx tsc --noEmit`.

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
| 2026-11-09 | API moved to Python (FastAPI) + web app redesign | Same routes and responses; all 69 API checks pass unchanged. New design system and app shell |
| 2026-11-10 | Renamed to PackVision | Domain packvision.packagesgroup.com, deploy guide + IIS config. Repo, folders and database keep the name qc_portal |
| 2026-11-10 | Print checks (step 3) | Engine in the API (identical results to the PoC on all 48 simulated photos), DB-queued workers, reference review, Check a print, check history. Migration 007 |
