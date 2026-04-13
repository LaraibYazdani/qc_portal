# QC Portal (Carton Design Verification)

## Overview
Internal web application for ensuring correct artwork on the carton printing line. Sales/Admin upload approved designs, factory operators can instantly search and verify.

## Requirements
- XAMPP (Apache + MySQL + PHP 8+)
- phpMyAdmin

## Setup (Local XAMPP)
1. Copy project folder `qc_portal` into your XAMPP web root. On Windows default: `C:\xampp\htdocs\qc_portal`.
2. Create uploads directory permissions (already included): `uploads/jobs`.
3. Create database and tables:
   - Open phpMyAdmin
   - Import file `sql/schema.sql`
4. Configure DB credentials if needed:
   - Edit `config/config.php` to match your MySQL settings.
5. Access application:
   - Operator View (no login): `http://localhost/qc_portal/public/index.php`
   - Login (sales/admin): `http://localhost/qc_portal/public/login.php`

## Default Admin
- Email: `admin@example.com`
- Password: `Admin@123`

## Roles
- Sales: can upload new job designs and view their uploads.
- Admin: full access, manage jobs and users.
- Operator: no login, can search and view designs.

## Security Notes
- Prepared statements used for queries.
- Upload validation by MIME, extension, and size.
- Uploads directory blocks PHP execution and directory listing.
- Sessions for authentication.

## Deployment (Internal Server)
1. Install Apache + PHP 8 + MySQL.
2. Copy project folder to web root, ensure `uploads/jobs` is writable by the web server.
3. Create DB and import `sql/schema.sql`.
4. Set correct base URLs if served from a subdirectory and adjust `config/config.php` (`base_url`, `upload_url`).
5. Restrict network access to internal IPs only as per company policy.

## File Storage
- Files are stored in `uploads/jobs/` with filename as `JOBNUMBER.ext`.
- Only PNG, JPG/JPEG, PDF are allowed.

## Notes
- No cloud dependencies.
- Designed for fast operator lookup and high-contrast UI suitable for factory floor.
