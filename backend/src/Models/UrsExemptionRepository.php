<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

/**
 * Stage 1 normally requires a URS document on file
 * (StageCompletionEvaluator) — this is the one escape hatch, Owner-only,
 * one per order (docs/ROADMAP.md).
 */
final class UrsExemptionRepository
{
    public static function findForOrder(int $orderId): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM urs_exemptions WHERE order_id = :order_id');
        $stmt->execute(['order_id' => $orderId]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function create(int $orderId, string $reason, int $approvedBy): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO urs_exemptions (order_id, reason, approved_by) VALUES (:order_id, :reason, :approved_by)'
        );
        $stmt->execute(['order_id' => $orderId, 'reason' => $reason, 'approved_by' => $approvedBy]);

        return self::findForOrder($orderId);
    }
}
