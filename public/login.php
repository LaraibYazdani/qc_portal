<?php
require_once __DIR__ . '/../controllers/AuthController.php';
require_once __DIR__ . '/../services/Auth.php';

Auth::start();
$config = require __DIR__ . '/../config/config.php';
$base = rtrim($config['app']['base_url'], '/');
if (Auth::user()) {
    $u = Auth::user();
    header('Location: ' . ($u['role'] === 'admin' ? ($base . '/admin.php') : ($base . '/upload.php')));
    exit;
}

$message = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $res = AuthController::handleLogin();
    if ($res['success']) {
        header('Location: ' . $res['redirect']);
        exit;
    } else {
        $message = $res['message'];
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Packages QC Assistant – Login</title>
  <style>
    body { font-family: Arial, sans-serif; background:#f7fbff; color:#0f172a; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .card { background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:24px; width:380px; box-shadow:0 4px 10px rgba(2, 6, 23, 0.06); }
    h1 { margin:0 0 16px; color:#0b3d91; font-size:24px; }
    .brand { font-weight:700; }
    input { width:100%; padding:12px; margin:10px 0; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; font-size:16px; }
    button { width:100%; padding:12px; background:#2563eb; border:none; border-radius:8px; color:#ffffff; font-weight:600; cursor:pointer; margin-top:10px; font-size:16px; }
    button:hover { background:#1d4ed8; }
    .error { background:#fee2e2; color:#7f1d1d; padding:12px; border-radius:8px; margin-bottom:10px; border:1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="card">
    <h1><span class="brand">Packages QC Assistant</span> – Login</h1>
    <?php if ($message): ?><div class="error"><?= htmlspecialchars($message) ?></div><?php endif; ?>
    <form method="post" action="<?= htmlspecialchars($base) ?>/login.php">
      <input type="email" name="email" placeholder="Email" required>
      <input type="password" name="password" placeholder="Password" required>
      <button type="submit">Login</button>
    </form>
  </div>
</body>
</html>
