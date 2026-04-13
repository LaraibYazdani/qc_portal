# QC Portal — CLAUDE.md

## Project Overview

**QC Portal** is an internal web app for quality control of carton printing artwork.
Operators look up designs by job or PO number. Sales staff upload designs. Admins manage everything.

**Deployment Target**: Vercel (serverless PHP) + Aiven (managed MySQL) + Cloudinary (file storage)

---

## Tech Stack

- **Language**: Vanilla PHP 8+ (no framework, no Composer)
- **Database**: MySQL via PDO (no ORM)
- **File Storage**: Cloudinary (images compressed/resized via PHP GD before upload)
- **Frontend**: Plain HTML/CSS (no JS framework)
- **Architecture**: MVC-style (Controllers / Services / Config)

---

## Directory Structure

```
qc_portal/
├── config/config.php         # All values from getenv() — no hardcoded secrets
├── controllers/
│   ├── AuthController.php    # Login handling
│   └── JobController.php     # Upload / replace / delete (uses CloudinaryService)
├── services/
│   ├── Auth.php              # Session management, role checks
│   ├── CloudinaryService.php # Cloudinary upload/delete + GD image compression
│   ├── Database.php          # PDO singleton with Aiven SSL support
│   └── JobService.php        # Job data access (unchanged)
├── public/                   # Web root (Vercel functions live here)
│   ├── index.php             # Operator view (no auth)
│   ├── login.php             # Login page
│   ├── logout.php
│   ├── upload.php            # Design upload (sales/admin)
│   ├── admin.php             # Admin job management
│   ├── my_jobs.php           # User's own uploads
│   └── reset_password.php    # Hash generator utility
├── sql/
│   ├── schema.sql            # DB schema + default admin
│   └── reset_admin_password.sql
├── vercel.json               # Vercel: PHP runtime + URL rewrites
├── php.ini                   # Vercel: secure session cookie flags
└── .env.example              # Documents all required env vars
```

---

## Database Schema

**users**: id, name, email (UNIQUE), password (bcrypt), role (sales|admin), created_at
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
| `DB_HOST` | Yes | Aiven MySQL hostname |
| `DB_PORT` | Yes | Aiven MySQL port |
| `DB_NAME` | Yes | Database name (`qc_portal`) |
| `DB_USER` | Yes | Aiven username |
| `DB_PASS` | Yes | Aiven password |
| `DB_SSL_CA` | Yes | CA cert — file path OR raw PEM contents |
| `APP_BASE_URL` | No | Empty `""` on Vercel; `/qc_portal/public` for XAMPP |
| `CLOUDINARY_CLOUD_NAME` | Yes | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Yes | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Yes | From Cloudinary dashboard |
| `CLOUDINARY_FOLDER` | No | Defaults to `qc_jobs` |

---

## Cloudinary Notes

- Images (PNG/JPG) are compressed with PHP GD before upload:
  - JPEG: re-encoded at 82% quality
  - PNG: only reprocessed if dimensions exceed 1920px
  - Both: scaled down proportionally if any dimension > 1920px
- PDFs uploaded as Cloudinary `raw` resource type (no compression)
- On replace: old Cloudinary asset is deleted first, then new one uploaded
- On delete: Cloudinary asset deleted, then DB record removed
- `image_path` column in DB stores the full Cloudinary `secure_url`

---

## Aiven SSL Notes

`DB_SSL_CA` can be either:
- A filesystem **path** to the CA `.pem` file (for local/server deployments)
- The **raw PEM certificate contents** (for Vercel env vars)

If the raw contents are provided, `Database.php` writes them to a temp file at runtime.

---

## Vercel Deployment Notes

- `vercel.json` declares each PHP file as a serverless function via `vercel-php@0.7.2`
- URL rewrites map `/foo.php` → `/public/foo.php` (and `/` → `/public/index.php`)
- `php.ini` enables secure session cookies (HTTPS-only, HttpOnly, SameSite=Lax)
- `APP_BASE_URL` must be empty `""` on Vercel (app is at the domain root)
- Sessions use PHP's default `/tmp` storage — fine for UAT traffic levels

---

## Changes Log

| Date | Change | File(s) |
|------|--------|---------|
| 2026-04-13 | Initial UAT readiness pass | All files below |
| 2026-04-13 | Replaced hardcoded config with `getenv()` | `config/config.php` |
| 2026-04-13 | Added Aiven SSL support (file path or raw cert) | `services/Database.php` |
| 2026-04-13 | Replaced local file storage with Cloudinary | `controllers/JobController.php` |
| 2026-04-13 | Created Cloudinary service with GD compression | `services/CloudinaryService.php` |
| 2026-04-13 | Fixed hardcoded `/` links to use `$base` | `public/my_jobs.php` |
| 2026-04-13 | Created Vercel config and PHP ini | `vercel.json`, `php.ini` |
| 2026-04-13 | Documented all env vars | `.env.example` |
