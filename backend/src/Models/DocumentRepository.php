<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;
use PDO;

/**
 * Documents split by weight (docs/ARCHITECTURE.md §4.3.1): local storage
 * for PDFs/certificates, served only through the authenticated
 * /api/documents/{id}/file endpoint; Google Drive file IDs for FAT/SAT
 * photo/video. Visibility is enforced here, not just in the UI — internal
 * roles with order/project access see everything; supplier/customer only
 * see rows tagged for them.
 */
final class DocumentRepository
{
    public static function storageDir(): string
    {
        return dirname(__DIR__, 2) . '/storage/documents';
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function create(array $data, int $uploadedBy): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO documents (project_id, order_id, order_stage_id, fat_sat_record_id,
                                     type, storage_type, file_path, uploaded_by, visibility,
                                     shared_with_supplier_id)
             VALUES (:project_id, :order_id, :order_stage_id, :fat_sat_record_id,
                     :type, :storage_type, :file_path, :uploaded_by, :visibility,
                     :shared_with_supplier_id)'
        );
        $stmt->execute([
            'project_id' => $data['project_id'] ?? null,
            'order_id' => $data['order_id'] ?? null,
            'order_stage_id' => $data['order_stage_id'] ?? null,
            'fat_sat_record_id' => $data['fat_sat_record_id'] ?? null,
            'type' => $data['type'],
            'storage_type' => $data['storage_type'],
            'file_path' => $data['file_path'],
            'uploaded_by' => $uploadedBy,
            'visibility' => $data['visibility'] ?? 'internal',
            'shared_with_supplier_id' => $data['shared_with_supplier_id'] ?? null,
        ]);

        return self::findByIdUnscoped((int) $db->lastInsertId());
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function findByIdUnscoped(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM documents WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $doc = $stmt->fetch();

        return $doc === false ? null : $doc;
    }

    /**
     * Order-scoped list, filtered by what this role's visibility allows.
     * Caller must have already confirmed order-level access
     * (Bli\Http\OrderAccess::requireVisibleOrder) — this only narrows
     * further by document visibility.
     *
     * @param array<string, mixed> $claims
     * @return array<int, array<string, mixed>>
     */
    public static function findForOrder(int $orderId, array $claims): array
    {
        [$sql, $params] = self::visibilityFilter($claims);
        $params['order_id'] = $orderId;

        $stmt = Database::connection()->prepare(
            "SELECT * FROM documents WHERE order_id = :order_id AND ({$sql}) ORDER BY created_at DESC"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null null for not-found OR not-visible — same non-disclosure as elsewhere
     */
    public static function findByIdForUser(int $id, array $claims): ?array
    {
        [$sql, $params] = self::visibilityFilter($claims);
        $params['id'] = $id;

        $stmt = Database::connection()->prepare(
            "SELECT * FROM documents WHERE id = :id AND ({$sql})"
        );
        $stmt->execute($params);
        $doc = $stmt->fetch();

        return $doc === false ? null : $doc;
    }

    /**
     * @param array<string, mixed> $claims
     * @return array{0: string, 1: array<string, mixed>}
     */
    private static function visibilityFilter(array $claims): array
    {
        $role = $claims['role'] ?? null;

        // Internal roles see everything on an order/project they already
        // have access to — visibility only restricts what's shown externally.
        if (in_array($role, ['company_owner', 'sales_manager', 'project_coordinator',
            'import_manager', 'installation_engineer'], true)) {
            return ['1=1', []];
        }

        if ($role === 'supplier') {
            return [
                "visibility IN ('supplier', 'shared')
                 AND (shared_with_supplier_id IS NULL OR shared_with_supplier_id = :supplier_id)",
                ['supplier_id' => (int) ($claims['supplier_id'] ?? 0)],
            ];
        }

        if ($role === 'customer') {
            return ["visibility IN ('customer', 'shared')", []];
        }

        return ['1=0', []];
    }

    /**
     * Moves an uploaded temp file into private storage under a
     * collision-proof name. Never trusts the original filename for the
     * path — only for the extension, and even that's whitelisted.
     */
    public static function storeUploadedFile(string $tmpPath, string $originalName): string
    {
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!array_key_exists($extension, self::MIME_TYPES)) {
            throw new \InvalidArgumentException('Unsupported file type.');
        }

        $filename = bin2hex(random_bytes(16)) . '.' . $extension;
        $destination = self::storageDir() . '/' . $filename;

        if (!move_uploaded_file($tmpPath, $destination)) {
            throw new \RuntimeException('Failed to store the uploaded file.');
        }

        return $filename;
    }

    /**
     * Whitelisted extension -> MIME type, doubling as the set of accepted
     * upload types (docs/ARCHITECTURE.md §4.3.1 — extended to cover project
     * media/video alongside the original document types). Used both to
     * validate uploads and to serve the right Content-Type back.
     */
    private const MIME_TYPES = [
        'pdf' => 'application/pdf',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'mp4' => 'video/mp4',
        'mov' => 'video/quicktime',
        'webm' => 'video/webm',
        'm4v' => 'video/mp4',
    ];

    public static function mimeType(string $filePath): string
    {
        $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));

        return self::MIME_TYPES[$extension] ?? 'application/octet-stream';
    }

    public static function isInlineViewable(string $filePath): bool
    {
        return str_starts_with(self::mimeType($filePath), 'image/') || str_starts_with(self::mimeType($filePath), 'video/');
    }

    /**
     * Documents attached directly to a project (general project media not
     * tied to a specific order/stage) plus every document belonging to one
     * of the project's orders — same visibility rule as findForOrder().
     *
     * @param array<string, mixed> $claims
     * @return array<int, array<string, mixed>>
     */
    public static function findForProject(int $projectId, array $claims): array
    {
        [$sql, $params] = self::visibilityFilter($claims);
        $params['project_id_direct'] = $projectId;
        $params['project_id_via_order'] = $projectId;

        $stmt = Database::connection()->prepare(
            "SELECT d.* FROM documents d
             LEFT JOIN orders o ON o.id = d.order_id
             WHERE (d.project_id = :project_id_direct OR o.project_id = :project_id_via_order) AND ({$sql})
             ORDER BY d.created_at DESC"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }
}
