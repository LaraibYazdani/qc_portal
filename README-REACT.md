# QC Portal - React Version

## Overview

QC Portal is a modern React web application for quality control of carton printing artwork. This version replaces the original PHP application with a React frontend and Node.js backend API.

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Axios** for API calls
- **React Hook Form** for form handling
- **React Dropzone** for file uploads

### Backend
- **Node.js** with Express
- **TypeScript**
- **MySQL** with connection pooling
- **JWT** for authentication
- **Multer** for file uploads
- **Cloudinary** for image storage
- **bcryptjs** for password hashing

## Features

### User Roles
- **Operator**: No login required - search and view designs
- **Sales**: Login required - upload designs, view own uploads
- **Admin**: Full access - manage all jobs and users

### Core Functionality
- **Design Search**: Public search by job or PO number
- **File Upload**: Drag-and-drop file upload with validation
- **User Authentication**: JWT-based login system
- **Role-Based Access**: Protected routes and permissions
- **Cloud Storage**: Cloudinary integration for file storage
- **Responsive Design**: Mobile-friendly interface

## Quick Start

### Prerequisites
- Node.js 16+ 
- MySQL 8.0+
- Cloudinary account

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
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=qc_portal
   DB_USER=your_db_user
   DB_PASS=your_db_password
   
   JWT_SECRET=your_super_secret_jwt_key_here
   JWT_EXPIRES_IN=24h
   
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   CLOUDINARY_FOLDER=qc_jobs
   
   PORT=5000
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:3000
   ```

5. Start the backend server:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the React development server:
   ```bash
   npm start
   ```

4. Open http://localhost:3000 in your browser

## Default Login
- **Email**: admin@example.com
- **Password**: Admin@123

## Project Structure

```
qc_portal/
|-- backend/
|   |-- src/
|   |   |-- config/
|   |   |   `-- database.ts      # Database configuration
|   |   |-- middleware/
|   |   |   `-- auth.ts          # Authentication middleware
|   |   |-- models/
|   |   |   |-- Job.ts           # Job type definitions
|   |   |   `-- User.ts          # User type definitions
|   |   |-- routes/
|   |   |   |-- auth.ts          # Authentication routes
|   |   |   |-- jobs.ts          # Job management routes
|   |   |   `-- users.ts         # User management routes
|   |   `-- index.ts             # Express app setup
|   |-- package.json
|   `-- tsconfig.json
|-- frontend/
|   |-- public/
|   |   `-- index.html
|   |-- src/
|   |   |-- components/
|   |   |   `-- ProtectedRoute.tsx
|   |   |-- contexts/
|   |   |   `-- AuthContext.tsx
|   |   |-- pages/
|   |   |   |-- Admin.tsx
|   |   |   |-- Login.tsx
|   |   |   |-- MyJobs.tsx
|   |   |   |-- OperatorView.tsx
|   |   |   `-- Upload.tsx
|   |   |-- types/
|   |   |   |-- Job.ts
|   |   |   `-- User.ts
|   |   |-- App.tsx
|   |   `-- index.tsx
|   `-- package.json
`-- sql/
    `-- database_setup.sql       # Database setup script
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - User logout

### Jobs
- `GET /api/jobs/search` - Search jobs (public)
- `GET /api/jobs` - Get all jobs (admin only)
- `GET /api/jobs/my-jobs` - Get user's jobs (sales/admin)
- `POST /api/jobs` - Create new job (sales/admin)
- `PUT /api/jobs/:id` - Update job (admin only)
- `DELETE /api/jobs/:id` - Delete job (admin only)

### Users
- `GET /api/users` - Get all users (admin only)
- `POST /api/users` - Create user (admin only)
- `PUT /api/users/:id` - Update user (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)

## Deployment

### Backend Deployment
1. Build the TypeScript code:
   ```bash
   npm run build
   ```

2. Set production environment variables

3. Start the production server:
   ```bash
   npm start
   ```

### Frontend Deployment
1. Build the React app:
   ```bash
   npm run build
   ```

2. Deploy the `build` folder to your web server

3. Configure your web server to proxy API requests to the backend

## Security Features

- JWT token authentication
- Password hashing with bcrypt
- Role-based access control
- File upload validation
- SQL injection prevention with prepared statements
- CORS configuration
- Rate limiting

## Development

### Running Tests
```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test
```

### Code Style
The project uses TypeScript for type safety and follows React best practices.

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Verify MySQL is running
   - Check database credentials in `.env`
   - Ensure database exists and schema is imported

2. **Cloudinary Upload Error**
   - Verify Cloudinary credentials
   - Check folder permissions
   - Ensure file size is under 20MB

3. **JWT Authentication Error**
   - Check JWT_SECRET is set
   - Verify token is being sent in Authorization header
   - Check token expiration

## Migration from PHP Version

This React version provides the same functionality as the original PHP application with these improvements:

- Modern UI/UX with responsive design
- Better performance with client-side routing
- Enhanced security with JWT authentication
- Improved developer experience with TypeScript
- Easier maintenance and scaling

The database schema remains compatible with the PHP version, allowing for seamless migration.
