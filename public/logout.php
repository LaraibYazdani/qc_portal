<?php
require_once __DIR__ . '/../services/Auth.php';
Auth::logout();
$config = require __DIR__ . '/../config/config.php';
$base = rtrim($config['app']['base_url'], '/');
header('Location: ' . $base . '/login.php');
exit;
