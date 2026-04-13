<?php
require_once __DIR__ . '/Database.php';

class Auth {
    public static function start(): void {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }

    public static function login(string $email, string $password): bool {
        self::start();
        $pdo = Database::conn();
        $stmt = $pdo->prepare('SELECT id, name, email, password, role FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if ($user && password_verify($password, $user['password'])) {
            $_SESSION['user'] = [
                'id' => (int)$user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $user['role']
            ];
            return true;
        }
        return false;
    }

    public static function logout(): void {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
    }

    public static function user(): ?array {
        self::start();
        return $_SESSION['user'] ?? null;
    }

    public static function requireRole(array $roles): void {
        self::start();
        $u = self::user();
        if (!$u || !in_array($u['role'], $roles, true)) {
            $config = require __DIR__ . '/../config/config.php';
            $base = rtrim($config['app']['base_url'], '/');
            header('Location: ' . $base . '/login.php');
            exit;
        }
    }
}
