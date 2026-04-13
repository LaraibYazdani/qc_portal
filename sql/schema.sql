-- Run this against your Aiven 'defaultdb' database.
-- Do NOT include CREATE DATABASE / USE statements — Aiven manages the database for you.

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('sales','admin') NOT NULL DEFAULT 'sales',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_number VARCHAR(100) NOT NULL UNIQUE,
  po_number VARCHAR(100) NULL,
  design_name VARCHAR(191) NULL,
  image_path VARCHAR(255) NOT NULL,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_jobs_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_jobs_po_number (po_number)
) ENGINE=InnoDB;

-- Create an initial admin user (email: admin@example.com / password: Admin@123)
INSERT INTO users (name, email, password, role)
VALUES ('Administrator', 'admin@example.com', '$2y$10$N0eZZXr5vN3F/0H3Hf0H9uFsk0Q0VjB2GhyS8mNwFZrX3g9cQ0mGq', 'admin')
ON DUPLICATE KEY UPDATE email = email;
