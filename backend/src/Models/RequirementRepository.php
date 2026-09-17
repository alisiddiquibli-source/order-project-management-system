<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

final class RequirementRepository
{
    public static function create(int $orderId, string $description, ?string $documentRef): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO requirements (order_id, description, document_ref, version)
             VALUES (:order_id, :description, :document_ref,
                     (SELECT COALESCE(MAX(version), 0) + 1 FROM (SELECT version FROM requirements WHERE order_id = :order_id_2) t))'
        );
        $stmt->execute([
            'order_id' => $orderId,
            'description' => $description,
            'document_ref' => $documentRef,
            'order_id_2' => $orderId,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    public static function approve(int $id, int $approvedBy): array
    {
        Database::connection()
            ->prepare('UPDATE requirements SET approved_by = :approved_by, approved_at = NOW() WHERE id = :id')
            ->execute(['approved_by' => $approvedBy, 'id' => $id]);

        return self::find($id);
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM requirements WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listForOrder(int $orderId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM requirements WHERE order_id = :order_id ORDER BY version DESC'
        );
        $stmt->execute(['order_id' => $orderId]);

        return $stmt->fetchAll();
    }
}
