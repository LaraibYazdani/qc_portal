<?php
require_once __DIR__ . '/../services/Auth.php';
require_once __DIR__ . '/../controllers/JobController.php';
Auth::requireRole(['admin','sales']);

$message = null;
$ok = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $res = JobController::handleUpload();
    $message = $res['message'];
    $ok = $res['success'];
}
$user = Auth::user();
$config = require __DIR__ . '/../config/config.php';
$base = rtrim($config['app']['base_url'], '/');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Packages QC Assistant – Upload Design</title>
  <style>
    body { font-family: Arial, sans-serif; background:#f7fbff; color:#0f172a; margin:0; }
    .topbar { background:#ffffff; border-bottom:1px solid #e2e8f0; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; }
    .brand { color:#0b3d91; font-weight:700; }
    a { color:#2563eb; text-decoration:none; }
    .container { max-width: 900px; margin: 0 auto; padding: 20px; }
    .card { background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; box-shadow:0 1px 2px rgba(0,0,0,0.04); }
    input, label { display:block; width:100%; }
    input[type=text] { padding:12px; margin:10px 0; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; font-size:16px; }
    input[type=file] { margin:10px 0; }
    button { padding:12px 16px; background:#2563eb; border:none; border-radius:8px; color:#ffffff; font-weight:600; cursor:pointer; margin-top:10px; font-size:16px; }
    button:hover { background:#1d4ed8; }
    .msg { padding:12px; border-radius:8px; margin-bottom:12px; border:1px solid transparent; }
    .ok { background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }
    .err { background:#fee2e2; color:#7f1d1d; border-color:#fecaca; }
  </style>
</head>
<body>
  <div class="topbar">
    <div><span class="brand">Packages QC Assistant</span></div>
    <div>Logged in as <?= htmlspecialchars($user['name']) ?> (<?= htmlspecialchars($user['role']) ?>)</div>
    <div>
      <a href="<?= htmlspecialchars($base) ?>/index.php">Operator View</a> | 
      <a href="<?= htmlspecialchars($base) ?>/my_jobs.php">My Jobs</a> | 
      <?php if ($user['role'] === 'admin'): ?><a href="<?= htmlspecialchars($base) ?>/admin.php">Admin</a> | <?php endif; ?>
      <a href="<?= htmlspecialchars($base) ?>/logout.php">Logout</a>
    </div>
  </div>
  <div class="container">
    <h1>Upload Approved Design</h1>
    <?php if ($message): ?><div class="msg <?= $ok ? 'ok' : 'err' ?>"><?= htmlspecialchars($message) ?></div><?php endif; ?>
    <div class="card">
      <form method="post" action="<?= htmlspecialchars($base) ?>/upload.php" enctype="multipart/form-data">
        <label>Job Number (unique)
          <input type="text" name="job_number" required>
        </label>
        <label>PO Number (optional)
          <input type="text" name="po_number">
        </label>
        <label>Design Name (optional)
          <input type="text" name="design_name">
        </label>
        <label>Design File (PNG, JPG, PDF)
          <input type="file" name="design" accept=".png,.jpg,.jpeg,.pdf" required>
        </label>
        <button type="submit">Upload</button>
      </form>
    </div>
  </div>
</body>
</html>
