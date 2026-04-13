<?php
require_once __DIR__ . '/Database.php';

class JobService {
    public static function create(string $jobNumber, ?string $poNumber, ?string $designName, string $imagePath, int $uploadedBy): int {
        $pdo = Database::conn();
        $stmt = $pdo->prepare('INSERT INTO jobs (job_number, po_number, design_name, image_path, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())');
        $stmt->execute([$jobNumber, $poNumber, $designName, $imagePath, $uploadedBy]);
        return (int)$pdo->lastInsertId();
    }

    public static function findByJobOrPo(?string $jobNumber, ?string $poNumber): array {
        $pdo = Database::conn();
        if ($jobNumber) {
            $stmt = $pdo->prepare('SELECT j.*, u.name as uploader_name, u.email as uploader_email FROM jobs j LEFT JOIN users u ON j.uploaded_by = u.id WHERE j.job_number = ? LIMIT 1');
            $stmt->execute([$jobNumber]);
            $row = $stmt->fetch();
            return $row ? [$row] : [];
        }
        if ($poNumber) {
            $stmt = $pdo->prepare('SELECT j.*, u.name as uploader_name, u.email as uploader_email FROM jobs j LEFT JOIN users u ON j.uploaded_by = u.id WHERE j.po_number = ? ORDER BY j.created_at DESC');
            $stmt->execute([$poNumber]);
            return $stmt->fetchAll();
        }
        return [];
    }

    public static function all(?string $q = null): array {
        $pdo = Database::conn();
        if ($q) {
            $like = "%" . $q . "%";
            $stmt = $pdo->prepare('SELECT j.*, u.name as uploader_name FROM jobs j LEFT JOIN users u ON j.uploaded_by = u.id WHERE j.job_number LIKE ? OR j.po_number LIKE ? OR j.design_name LIKE ? ORDER BY j.created_at DESC');
            $stmt->execute([$like, $like, $like]);
            return $stmt->fetchAll();
        }
        $stmt = $pdo->query('SELECT j.*, u.name as uploader_name FROM jobs j LEFT JOIN users u ON j.uploaded_by = u.id ORDER BY j.created_at DESC');
        return $stmt->fetchAll();
    }

    public static function byUser(int $userId): array {
        $pdo = Database::conn();
        $stmt = $pdo->prepare('SELECT j.*, u.name as uploader_name FROM jobs j LEFT JOIN users u ON j.uploaded_by = u.id WHERE j.uploaded_by = ? ORDER BY j.created_at DESC');
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function getById(int $id): ?array {
        $pdo = Database::conn();
        $stmt = $pdo->prepare('SELECT * FROM jobs WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function replaceFile(int $id, string $newPath): void {
        $pdo = Database::conn();
        $stmt = $pdo->prepare('UPDATE jobs SET image_path = ? WHERE id = ?');
        $stmt->execute([$newPath, $id]);
    }

    public static function delete(int $id): void {
        $pdo = Database::conn();
        $stmt = $pdo->prepare('DELETE FROM jobs WHERE id = ?');
        $stmt->execute([$id]);
    }
}
