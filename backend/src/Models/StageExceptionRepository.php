<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

/**
 * §3.1 — a stage_exceptions row is the only thing that can stand in for
 * an unmet hard prerequisite (currently: stage 6 dispatch standing in for
 * stage 5/FAT not yet complete), and only for open minor items or a
 * procedural delay — never a fail or an open critical item. Only a Sales
 * Manager or Company Owner may create one; a PC can request one via a
 * comment but can't self-approve.
 */
final class StageExceptionRepository
{
    public static function create(
        int $orderStageId,
        int $prerequisiteStageId,
        string $appliesTo,
        string $reason,
        int $approvedBy,
    ): array {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO stage_exceptions (order_stage_id, prerequisite_stage_id, applies_to, reason, approved_by)
             VALUES (:order_stage_id, :prerequisite_stage_id, :applies_to, :reason, :approved_by)'
        );
        $stmt->execute([
            'order_stage_id' => $orderStageId,
            'prerequisite_stage_id' => $prerequisiteStageId,
            'applies_to' => $appliesTo,
            'reason' => $reason,
            'approved_by' => $approvedBy,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM stage_exceptions WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listForStage(int $orderStageId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM stage_exceptions WHERE order_stage_id = :id ORDER BY id DESC'
        );
        $stmt->execute(['id' => $orderStageId]);

        return $stmt->fetchAll();
    }
}
