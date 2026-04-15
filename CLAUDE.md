# QC Portal — CLAUDE.md

## Project Overview

**QC Portal** is an internal web app for quality control of carton printing artwork.
Operators look up designs by job or PO number. Sales staff upload designs. Admins manage everything.

**Deployment Target**: Railway (Node.js backend + React frontend)

---

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + TypeScript + Tailwind CSS
- **Database**: MySQL via mysql2 (local XAMPP for dev)
- **Auth**: JWT (bcryptjs for password hashing)
- **File Storage**: Cloudinary (images compressed before upload)
- **Architecture**: REST API (backend) + SPA (frontend)

---

## Directory Structure

```
qc_portal/
├── backend/
│   └── src/
│       ├── index.ts              # Express app entry point (port 5000)
│       ├── config/database.ts    # mysql2 connection pool
│       ├── middleware/auth.ts    # JWT middleware
│       ├── models/User.ts        # User types
│       └── routes/
│           ├── auth.ts           # POST /api/auth/login, GET /api/auth/me
│           └── jobs.ts           # Job CRUD + Cloudinary upload
├── frontend/
│   └── src/
│       ├── contexts/AuthContext.tsx  # JWT auth state
│       └── ...pages and components
├── sql/
│   └── schema.sql               # DB schema + default admin (bcryptjs hash)
├── .env                         # Local dev env vars (never committed)
├── .env.example                 # Documents all required env vars
└── Dockerfile                   # Railway deployment
```

---

## Database Schema

**users**: id, name, email (UNIQUE), password (bcryptjs), role (sales|admin), created_at
**jobs**: id, job_number (UNIQUE), po_number, design_name, image_path (Cloudinary URL), uploaded_by (FK→users), created_at

Default admin: `admin@example.com` / `Admin@123`

---

## User Roles

| Role | Capabilities |
|------|-------------|
| Operator | No login — search/view designs only |
| Sales | Login — upload designs, view own uploads |
| Admin | Login — full access, manage all jobs |

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
| `CLOUDINARY_CLOUD_NAME` | Yes | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Yes | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Yes | From Cloudinary dashboard |
| `CLOUDINARY_FOLDER` | No | Defaults to `qc_jobs` |
| `PORT` | No | Backend port, default `5000` |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | No | Frontend URL for CORS |

---

## Local Development

```bash
# Terminal 1 — Backend (http://localhost:5000)
cd backend && npm install && npm run dev

# Terminal 2 — Frontend (http://localhost:3000)
cd frontend && npm install && npm start
```

Frontend proxies `/api/*` requests to `http://localhost:5000` via `"proxy"` in `frontend/package.json`.

---

## Changes Log

| Date | Change | Notes |
|------|--------|-------|
| 2026-04-13 | Initial UAT readiness pass | Migrated to Node.js + React |
| 2026-04-13 | Fixed login network error | Added proxy to frontend/package.json |
| 2026-04-13 | Fixed admin password hash | PHP bcrypt hash incompatible with bcryptjs — regenerated |
| 2026-04-13 | Removed Aiven/SSL dependencies | Using local MySQL only |
