# Packages QC Portal

The quality workspace for the Packages group: approved carton artwork by job number,
upload history with versions, user management through SAP SuccessFactors, and (next)
photo checks of printed sheets against the approved design.

| Part | Stack | Folder |
|---|---|---|
| API | Python 3.12, FastAPI, PyMySQL | `server/` |
| Web app | React 18, TypeScript, Tailwind, Vite | `frontend/` |
| Database | MariaDB 10.4 (production) / MySQL 8, numbered SQL migrations | `sql/migrations/` |
| Sign-in | Email + password, and SAP IAS (OpenID Connect) when enabled | |
| Files | Local disk, `backend/uploads/` (where phase 1's artwork already is) | |

## Run it locally

```powershell
# API (http://localhost:5000)
cd server
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env          # then fill in DB_* and JWT_SECRET
.venv\Scripts\python scripts\migrate.py --status
.venv\Scripts\python scripts\migrate.py
.venv\Scripts\python -m uvicorn app.main:app --port 5000 --reload

# Web app (http://localhost:3000, proxies /api and /uploads to :5000)
cd frontend
npm install
npm start
```

Tests: `cd server && .venv\Scripts\python -m pytest`.

## Roles

| Stored role | Shown as | Can |
|---|---|---|
| `operator` | Quality checker | Look up designs |
| `qc_supervisor` | QC supervisor | Quality checker + approvals (photo checks) |
| `sales` | Uploader | Upload designs and new versions |
| `company_admin` | Company admin | Manage designs and users of their company and its sub-companies |
| `admin` | Group admin | Everything, all companies |

The design lookup at `/operator` also works without signing in, for shop-floor terminals.

## More

- `CLAUDE.md`: how the code is organised and the rules for changing it.
- `docs/RELEASE_MULTI_COMPANY.md`: release, rollback and SAP sign-in runbook.
- No accounts or passwords belong in this repository. Ask an administrator for access.
