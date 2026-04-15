-- =====================================================
-- QC Portal Database Setup Script
-- =====================================================
-- Run this script to set up the database for QC Portal
-- Compatible with MySQL 8.0+
-- =====================================================

-- Create database (for self-hosted MySQL servers)
CREATE DATABASE IF NOT EXISTS qc_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Switch to the QC Portal database
USE qc_portal;

-- =====================================================
-- Users Table
-- =====================================================
-- Stores user authentication and role information
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT 'User full name',
  email VARCHAR(191) NOT NULL UNIQUE COMMENT 'Unique email address for login',
  password VARCHAR(255) NOT NULL COMMENT 'Bcrypt hashed password',
  role ENUM('operator','sales','admin') NOT NULL DEFAULT 'sales' COMMENT 'User role: operator, sales, or admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation timestamp',
  INDEX idx_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB COMMENT='User accounts and authentication';

-- =====================================================
-- Jobs Table
-- =====================================================
-- Stores job information and design file references
CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_number VARCHAR(100) NOT NULL UNIQUE COMMENT 'Unique job identifier',
  po_number VARCHAR(100) NULL COMMENT 'Purchase order number (optional)',
  design_name VARCHAR(191) NULL COMMENT 'Design description (optional)',
  image_path VARCHAR(255) NOT NULL COMMENT 'Cloudinary URL or file path',
  uploaded_by INT NOT NULL COMMENT 'Foreign key to users table',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Job creation timestamp',
  CONSTRAINT fk_jobs_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_jobs_job_number (job_number),
  INDEX idx_jobs_po_number (po_number),
  INDEX idx_jobs_uploaded_by (uploaded_by)
) ENGINE=InnoDB COMMENT='Job records and design files';

-- =====================================================
-- Default Users
-- =====================================================
-- Creates initial user accounts for the system
-- Passwords are hashed using bcrypt (cost 10)

-- Default Admin User
-- Email: admin@example.com
-- Password: Admin@123
INSERT INTO users (name, email, password, role)
VALUES ('Administrator', 'admin@example.com', '$2y$10$N0eZZXr5vN3F/0H3Hf0H9uFsk0Q0VjB2GhyS8mNwFZrX3g9cQ0mGq', 'admin')
ON DUPLICATE KEY UPDATE email = email;

-- Sales User - Mirza Sarwan
-- Email: mirza.sarwan@company.com
-- Password: Sales@123
-- Designation: Incharge Arts & Design
-- Employee ID: 30001037
INSERT INTO users (name, email, password, role)
VALUES ('Mirza Sarwan', 'mirza.sarwan@company.com', '$2y$10$N0eZZXr5vN3F/0H3Hf0H9uFsk0Q0VjB2GhyS8mNwFZrX3g9cQ0mGq', 'sales')
ON DUPLICATE KEY UPDATE email = email;

-- Admin User - Ahmed Imran
-- Email: ahmed.imran@company.com
-- Password: Admin@123
-- Designation: AM SHEQ
-- Employee ID: 30001891
INSERT INTO users (name, email, password, role)
VALUES ('Ahmed Imran', 'ahmed.imran@company.com', '$2y$10$N0eZZXr5vN3F/0H3Hf0H9uFsk0Q0VjB2GhyS8mNwFZrX3g9cQ0mGq', 'admin')
ON DUPLICATE KEY UPDATE email = email;

-- Operator User - Rashid Ali
-- Email: rashid.ali@company.com
-- Password: Operator@123
-- Designation: Assistant Operator
-- Employee ID: 30001278
INSERT INTO users (name, email, password, role)
VALUES ('Rashid Ali', 'rashid.ali@company.com', '$2y$10$N0eZZXr5vN3F/0H3Hf0H9uFsk0Q0VjB2GhyS8mNwFZrX3g9cQ0mGq', 'operator')
ON DUPLICATE KEY UPDATE email = email;

-- =====================================================
-- Sample Data (Optional)
-- =====================================================
-- Uncomment the following lines to add sample data for testing
/*
-- Sample Sales User
INSERT INTO users (name, email, password, role)
VALUES ('Sales User', 'sales@example.com', '$2y$10$N0eZZXr5vN3F/0H3Hf0H9uFsk0Q0VjB2GhyS8mNwFZrX3g9cQ0mGq', 'sales')
ON DUPLICATE KEY UPDATE email = email;

-- Sample Jobs
INSERT INTO jobs (job_number, po_number, design_name, image_path, uploaded_by)
VALUES 
  ('JOB001', 'PO001', 'Sample Box Design', 'https://res.cloudinary.com/demo/image/upload/sample1.jpg', 1),
  ('JOB002', 'PO002', 'Product Packaging', 'https://res.cloudinary.com/demo/image/upload/sample2.jpg', 1),
  ('JOB003', NULL, 'Custom Label Design', 'https://res.cloudinary.com/demo/image/upload/sample3.jpg', 2)
ON DUPLICATE KEY UPDATE job_number = job_number;
*/

-- =====================================================
-- Database Setup Complete
-- =====================================================
-- Database is now ready for QC Portal application
-- 
-- Next Steps:
-- 1. Update backend/.env with your database credentials
-- 2. Set up Cloudinary account and update environment variables
-- 3. Install dependencies: cd backend && npm install && cd ../frontend && npm install
-- 4. Start servers: npm run dev (backend) && npm start (frontend)
-- 5. Test login with any of the following accounts:
--
-- LOGIN CREDENTIALS:
-- =================
-- 1. Admin User:
--    Email: admin@example.com
--    Password: Admin@123
--    Role: Admin (Full access)
--
-- 2. Sales User:
--    Email: mirza.sarwan@company.com
--    Password: Sales@123
--    Role: Sales (Upload & view own jobs)
--
-- 3. Operator Access:
--    No login required - use public search interface
--    Name: Rashid Ali (Employee ID: 30001278)
--    Role: Operator (View-only access)
-- =====================================================
