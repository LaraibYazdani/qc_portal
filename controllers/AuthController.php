<?php
require_once __DIR__ . '/../services/Auth.php';

class AuthController {
    public static function handleLogin(): array {
        $email = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        if ($email === '' || $password === '') {
            return ['success' => false, 'message' => 'Email and password are required.'];
        }
        if (Auth::login($email, $password)) {
            $user = Auth::user();
            $config = require __DIR__ . '/../config/config.php';
            $base = rtrim($config['app']['base_url'], '/');
            $redirect = $user['role'] === 'admin' ? ($base . '/admin.php') : ($base . '/upload.php');
            return ['success' => true, 'redirect' => $redirect];
        }
        return ['success' => false, 'message' => 'Invalid credentials.'];
    }
}
