<?php
require_once __DIR__ . '/../services/Auth.php';
require_once __DIR__ . '/../services/JobService.php';
require_once __DIR__ . '/../controllers/JobController.php';
Auth::requireRole(['admin']);

$msg = null; $ok = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['action']) && $_POST['action'] === 'delete') {
        $res = JobController::handleDelete((int)$_POST['id']);
        $msg = $res['message']; $ok = $res['success'];
    } elseif (isset($_POST['action']) && $_POST['action'] === 'replace') {
        $res = JobController::handleReplace((int)$_POST['id']);
        $msg = $res['message']; $ok = $res['success'];
    }
}

$q = trim($_GET['q'] ?? '');
$jobs = JobService::all($q !== '' ? $q : null);
$user = Auth::user();
$config = require __DIR__ . '/../config/config.php';
$base = rtrim($config['app']['base_url'], '/');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Packages QC Assistant – Admin</title>
  <style>
    body { font-family: Arial, sans-serif; background:#f7fbff; color:#0f172a; margin:0; }
    .topbar { background:#ffffff; border-bottom:1px solid #e2e8f0; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; }
    .brand { color:#0b3d91; font-weight:700; }
    a { color:#2563eb; text-decoration:none; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .msg { padding:12px; border-radius:8px; margin-bottom:12px; border:1px solid transparent; }
    .ok { background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }
    .err { background:#fee2e2; color:#7f1d1d; border-color:#fecaca; }
    table { width:100%; border-collapse: collapse; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,0.04); }
    th, td { border-bottom:1px solid #e2e8f0; padding:10px; text-align:left; }
    th { background:#f1f5f9; color:#0b3d91; }
    input[type=text] { padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; min-width:260px; }
    button { padding:8px 12px; background:#2563eb; border:none; border-radius:8px; color:#ffffff; font-weight:600; cursor:pointer; }
    button:hover { background:#1d4ed8; }
    form.inline { display:inline; }
    .danger { background:#ef4444; }
  </style>
</head>
<body>
  <div class="topbar">
    <div><span class="brand">Packages QC Assistant</span></div>
    <div>Logged in as <?= htmlspecialchars($user['name']) ?> (admin)</div>
    <div>
      <a href="<?= htmlspecialchars($base) ?>/index.php">Operator View</a> | 
      <a href="<?= htmlspecialchars($base) ?>/upload.php">Upload</a> | 
      <a href="<?= htmlspecialchars($base) ?>/logout.php">Logout</a>
    </div>
  </div>
  <div class="container">
    <h1>Jobs</h1>
    <?php if ($msg): ?><div class="msg <?= $ok ? 'ok' : 'err' ?>"><?= htmlspecialchars($msg) ?></div><?php endif; ?>
    <form method="get" action="<?= htmlspecialchars($base) ?>/admin.php" style="margin-bottom:12px; display:flex; gap:10px; align-items:center;">
      <input type="text" name="q" placeholder="Search by Job, PO, Design" value="<?= htmlspecialchars($q) ?>">
      <button type="submit">Search</button>
    </form>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Job Number</th>
          <th>PO Number</th>
          <th>Design Name</th>
          <th>File</th>
          <th>Uploaded By</th>
          <th>Created At</th>
          <th>Actions</th>
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
            <td><?= htmlspecialchars($j['uploader_name'] ?? '') ?></td>
            <td><?= htmlspecialchars($j['created_at']) ?></td>
            <td>
              <form class="inline" method="post" action="<?= htmlspecialchars($base) ?>/admin.php" enctype="multipart/form-data">
                <input type="hidden" name="id" value="<?= (int)$j['id'] ?>">
                <input type="hidden" name="action" value="replace">
                <input type="file" name="design" accept=".png,.jpg,.jpeg,.pdf" required>
                <button type="submit">Replace</button>
              </form>
              <form class="inline" method="post" action="<?= htmlspecialchars($base) ?>/admin.php" onsubmit="return confirm('Delete this job?');">
                <input type="hidden" name="id" value="<?= (int)$j['id'] ?>">
                <input type="hidden" name="action" value="delete">
                <button type="submit" class="danger" style="color:white;">Delete</button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</body>
</html>
