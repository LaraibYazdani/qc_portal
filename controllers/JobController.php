<?php
require_once __DIR__ . '/../services/JobService.php';
require_once __DIR__ . '/../services/Auth.php';
require_once __DIR__ . '/../services/CloudinaryService.php';

class JobController {

    // ── Shared file validation ──────────────────────────────────────────────

    private static function validateUploadedFile(array $file, int $maxBytes): ?string {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            return 'File upload failed';
        }
        if ($file['size'] > $maxBytes) {
            return 'File too large (max 20 MB)';
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime  = $finfo->file($file['tmp_name']);
        $ext   = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

        $allowed = [
            'png'  => 'image/png',
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'pdf'  => 'application/pdf',
        ];

        if (!isset($allowed[$ext])) {
            return 'Invalid file type';
        }
        // PDFs may carry a secondary MIME on some systems
        if ($ext === 'pdf') {
            if (!in_array($mime, ['application/pdf', 'application/x-pdf'], true)) {
                return 'Invalid file type';
            }
        } elseif ($allowed[$ext] !== $mime) {
            return 'Invalid file type';
        }

        return null; // no error
    }

    // ── Handlers ────────────────────────────────────────────────────────────

    public static function handleUpload(): array {
        Auth::requireRole(['admin', 'sales']);
        $config = require __DIR__ . '/../config/config.php';

        $jobNumber  = strtoupper(trim($_POST['job_number'] ?? ''));
        $poNumber   = trim($_POST['po_number']   ?? '') ?: null;
        $designName = trim($_POST['design_name'] ?? '') ?: null;
        $user       = Auth::user();

        if ($jobNumber === '') {
            return ['success' => false, 'message' => 'Job Number is required'];
        }

        if (!isset($_FILES['design'])) {
            return ['success' => false, 'message' => 'No file received'];
        }

        $file     = $_FILES['design'];
        $maxBytes = (int)$config['app']['max_upload_mb'] * 1024 * 1024;
        $error    = self::validateUploadedFile($file, $maxBytes);
        if ($error) {
            return ['success' => false, 'message' => $error];
        }

        // Reject duplicates before touching Cloudinary
        if (JobService::findByJobOrPo($jobNumber, null)) {
            return ['success' => false, 'message' => 'Job Number already exists'];
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime  = $finfo->file($file['tmp_name']);
        $ext   = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

        try {
            $secureUrl = CloudinaryService::upload(
                $file['tmp_name'],
                $jobNumber,
                $mime,
                $ext
            );
        } catch (RuntimeException $e) {
            return ['success' => false, 'message' => 'Storage error: ' . $e->getMessage()];
        }

        JobService::create($jobNumber, $poNumber, $designName, $secureUrl, (int)$user['id']);

        return ['success' => true, 'message' => 'Upload successful'];
    }

    public static function handleReplace(int $id): array {
        Auth::requireRole(['admin']);
        $config = require __DIR__ . '/../config/config.php';

        $job = JobService::getById($id);
        if (!$job) {
            return ['success' => false, 'message' => 'Job not found'];
        }

        if (!isset($_FILES['design'])) {
            return ['success' => false, 'message' => 'No file received'];
        }

        $file     = $_FILES['design'];
        $maxBytes = (int)$config['app']['max_upload_mb'] * 1024 * 1024;
        $error    = self::validateUploadedFile($file, $maxBytes);
        if ($error) {
            return ['success' => false, 'message' => $error];
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime  = $finfo->file($file['tmp_name']);
        $ext   = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

        // Delete the old Cloudinary asset first
        if (!empty($job['image_path'])) {
            CloudinaryService::deleteByUrl($job['image_path']);
        }

        try {
            $secureUrl = CloudinaryService::upload(
                $file['tmp_name'],
                $job['job_number'],
                $mime,
                $ext
            );
        } catch (RuntimeException $e) {
            return ['success' => false, 'message' => 'Storage error: ' . $e->getMessage()];
        }

        JobService::replaceFile($id, $secureUrl);

        return ['success' => true, 'message' => 'Design replaced'];
    }

    public static function handleDelete(int $id): array {
        Auth::requireRole(['admin']);

        $job = JobService::getById($id);
        if ($job) {
            CloudinaryService::deleteByUrl($job['image_path'] ?? '');
            JobService::delete($id);
        }

        return ['success' => true, 'message' => 'Job deleted'];
    }
}
