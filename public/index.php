<?php
require_once __DIR__ . '/../services/JobService.php';
$config = require __DIR__ . '/../config/config.php';

$base = rtrim($config['app']['base_url'], '/');

$results = [];
$error = null;
$q_job = strtoupper(trim($_GET['job_number'] ?? ''));
$q_po = trim($_GET['po_number'] ?? '');
if ($q_job !== '' || $q_po !== '') {
    $results = JobService::findByJobOrPo($q_job ?: null, $q_po ?: null);
    if (!$results) {
        $error = 'No design found for this job';
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Packages QC Assistant – Operator View</title>
  <style>
    body { font-family: Arial, sans-serif; background:#f7fbff; color:#0f172a; margin:0; }
    .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 28px; margin: 12px 0; color:#0b3d91; }
    .brand { font-weight:700; color:#0b3d91; }
    form { display:flex; gap:12px; flex-wrap:wrap; margin:16px 0 20px; }
    input[type=text] { font-size:18px; padding:12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; flex:1; min-width:280px; }
    button { font-size:18px; padding:12px 16px; border:none; border-radius:8px; background:#2563eb; color:#ffffff; font-weight:600; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.06); }
    button:hover { background:#1d4ed8; }
    .error { background:#fee2e2; color:#7f1d1d; padding:12px; border-radius:8px; border:1px solid #fecaca; }
    .card { background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:16px; box-shadow:0 1px 2px rgba(0,0,0,0.04); }
    .detail { font-size:16px; margin:6px 0; }
    .viewer { background:#f1f5f9; display:flex; justify-content:center; align-items:center; overflow:auto; max-height:75vh; border:1px solid #e2e8f0; border-radius:12px; padding:8px; }
    img { max-width:100%; height:auto; }
    .label { color:#475569; }
  </style>
</head>
<body>
  <div class="container">
    <h1><span class="brand">Packages QC Assistant</span> – Operator Design Lookup</h1>
    <form method="get" action="<?= htmlspecialchars($base) ?>/index.php">
      <input type="text" name="job_number" placeholder="Job Number" value="<?= htmlspecialchars($q_job) ?>">
      <input type="text" name="po_number" placeholder="PO Number" value="<?= htmlspecialchars($q_po) ?>">
      <button type="submit">Search</button>
    </form>
    <?php if ($error): ?>
      <div class="error"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <?php foreach ($results as $job): ?>
      <div class="card">
        <div class="detail"><span class="label">Job Number:</span> <strong><?= htmlspecialchars($job['job_number']) ?></strong></div>
        <?php if (!empty($job['po_number'])): ?>
          <div class="detail"><span class="label">PO Number:</span> <?= htmlspecialchars($job['po_number']) ?></div>
        <?php endif; ?>
        <?php if (!empty($job['design_name'])): ?>
          <div class="detail"><span class="label">Design Name:</span> <?= htmlspecialchars($job['design_name']) ?></div>
        <?php endif; ?>
        <div class="viewer">
          <?php $path = $job['image_path']; $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION)); ?>
          <?php if (in_array($ext, ['png','jpg','jpeg'])): ?>
            <img src="<?= htmlspecialchars($path) ?>" alt="Design Image">
          <?php elseif ($ext === 'pdf'): ?>
            <object data="<?= htmlspecialchars($path) ?>" type="application/pdf" width="100%" height="700px">
              <p>PDF cannot be displayed. <a href="<?= htmlspecialchars($path) ?>">Download</a></p>
            </object>
          <?php else: ?>
            <p>Unsupported file type.</p>
          <?php endif; ?>
        </div>
      </div>
    <?php endforeach; ?>
  </div>
</body>
</html>
