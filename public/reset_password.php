<?php
// Simple script to hash a new password for admin
// Usage: http://localhost/qc_portal/public/reset_password.php?pw=YourNewPassword
$pw = $_GET['pw'] ?? 'Admin@123';
$hash = password_hash($pw, PASSWORD_DEFAULT);
echo "Hash for '$pw':<br><pre>$hash</pre>";
// Optionally update DB directly (uncomment to use)
/*
require_once __DIR__ . '/../services/Database.php';
$pdo = Database::conn();
$stmt = $pdo->prepare('UPDATE users SET password = ? WHERE email = ?');
$stmt->execute([$hash, 'admin@example.com']);
echo '<br>Updated admin password in DB.';
*/
?>
