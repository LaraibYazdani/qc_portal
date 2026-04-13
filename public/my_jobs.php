<?php
require_once __DIR__ . '/../services/Auth.php';
require_once __DIR__ . '/../services/JobService.php';
Auth::requireRole(['admin','sales']);

$user   = Auth::user();
$jobs   = JobService::byUser((int)$user['id']);
$config = require __DIR__ . '/../config/config.php';
$base   = rtrim($config['app']['base_url'], '/');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Packages QC Assistant – My Jobs</title>
  <style>
    body { font-family: Arial, sans-serif; background:#f7fbff; color:#0f172a; margin:0; }
    .topbar { background:#ffffff; border-bottom:1px solid #e2e8f0; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; }
    .brand { color:#0b3d91; font-weight:700; }
    a { color:#2563eb; text-decoration:none; }
    .container { max-width: 1100px; margin: 0 auto; padding: 20px; }
    table { width:100%; border-collapse: collapse; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,0.04); }
    th, td { border-bottom:1px solid #e2e8f0; padding:10px; text-align:left; }
    th { background:#f1f5f9; color:#0b3d91; }
    .muted { color:#475569; }
  </style>
</head>
<body>
  <div class="topbar">
    <div><span class="brand">Packages QC Assistant</span></div>
    <div>Logged in as <?= htmlspecialchars($user['name']) ?> (<?= htmlspecialchars($user['role']) ?>)</div>
    <div>
      <a href="<?= htmlspecialchars($base) ?>/index.php">Operator View</a> |
      <a href="<?= htmlspecialchars($base) ?>/upload.php">Upload</a> |
      <?php if ($user['role'] === 'admin'): ?><a href="<?= htmlspecialchars($base) ?>/admin.php">Admin</a> | <?php endif; ?>
      <a href="<?= htmlspecialchars($base) ?>/logout.php">Logout</a>
    </div>
  </div>
  <div class="container">
    <h1>My Uploaded Jobs</h1>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Job Number</th>
          <th>PO Number</th>
          <th>Design Name</th>
          <th>File</th>
          <th>Created At</th>
        </tr>
      </thead>
      <tbody>
        <?php foreach ($jobs as $j): ?>
          <tr>
            <td><?= (int)$j['id'] ?></td>
            <td><strong><?= htmlspecialchars($j['job_number']) ?></strong></td>
            <td><?= htmlspecialchars($j['po_number'] ?? '') ?></td>
            <td><?= htmlspecialchars($j['design_name'] ?? '') ?></td>
            <td><a href="<?= htmlspecialchars($j['image_path']) ?>" target="_blank">View</a></td>
            <td class="muted"><?= htmlspecialchars($j['created_at']) ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</body>
</html>
