USE qc_portal;

-- Reset the admin password to "Admin@123"
UPDATE users
SET password = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
WHERE email = 'admin@example.com' AND role = 'admin';

-- Verify
SELECT id, name, email, role, created_at FROM users WHERE email = 'admin@example.com';
