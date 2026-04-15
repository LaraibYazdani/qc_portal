# QC Portal (Carton Design Verification)

## Overview
Modern React web application for ensuring correct artwork on the carton printing line. Sales/Admin upload approved designs, factory operators can instantly search and verify.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: MySQL
- **Storage**: Cloudinary
- **Authentication**: JWT tokens

## Requirements
- Node.js 16+
- MySQL 8.0+
- Cloudinary account

## Quick Start

### Database Setup
1. Create a MySQL database named `qc_portal`
2. Run the setup script:
   ```bash
   mysql -u your_user -p qc_portal < sql/database_setup.sql
   ```

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   npm install
   ```

2. Create environment file:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your credentials (database, JWT secret, Cloudinary)

4. Start the backend server:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   npm start
   ```

2. Open http://localhost:3000 in your browser

## Login Credentials

### 1. Admin Users (Full Access)
- **Ahmed Imran** (AM SHEQ, ID: 30001891)
  - Email: `ahmed.imran@company.com`
  - Password: `Sales@123`
  
- **Administrator** (System Admin)
  - Email: `admin@example.com`
  - Password: `Admin@123`

### 2. Sales User (Upload & View Own Jobs)
- **Mirza Sarwan** (Incharge Arts & Design, ID: 30001037)
  - Email: `mirza.sarwan@company.com`
  - Password: `Sales@123`

### 3. Operator User (View Only Access)
- **Rashid Ali** (Assistant Operator, ID: 30001278)
  - Email: `rashid.ali@company.com`
  - Password: `Operator@123`
  - Role: Operator (View-only access)

## Roles
- **Operator**: No login required - search and view designs
- **Sales**: Login required - upload designs, view own uploads
- **Admin**: Full access - manage all jobs and users

## Features
- Modern responsive UI with Tailwind CSS
- Drag-and-drop file upload
- JWT-based authentication
- Role-based access control
- Cloudinary file storage
- Mobile-friendly design
- Real-time search

## Security
- JWT token authentication
- Password hashing with bcrypt
- Role-based access control
- File upload validation
- SQL injection prevention
- CORS configuration

## Deployment
See [README-REACT.md](README-REACT.md) for detailed deployment instructions.
