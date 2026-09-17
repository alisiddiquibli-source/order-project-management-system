<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

final class FatSatRepository
{
    /**
     * Creates a new FAT/SAT record. If the stage already has a current
     * (non-superseded) record of this type, it's marked superseded by
     * the new one — this is how a retest works (§3.3): the old result
     * and its acceptance no longer count toward completion.
     */
    public static function create(int $orderStageId, string $type, ?string $scheduledDate): array
    {
        $db = Database::connection();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                'SELECT id FROM fat_sat_records
                 WHERE order_stage_id = :id AND type = :type AND superseded_by IS NULL'
            );
            $stmt->execute(['id' => $orderStageId, 'type' => $type]);
            $current = $stmt->fetchColumn();

            $db->prepare(
                'INSERT INTO fat_sat_records (order_stage_id, type, scheduled_date)
                 VALUES (:order_stage_id, :type, :scheduled_date)'
            )->execute([
                'order_stage_id' => $orderStageId,
                'type' => $type,
                'scheduled_date' => $scheduledDate,
            ]);
            $newId = (int) $db->lastInsertId();

            if ($current !== false) {
                $db->prepare('UPDATE fat_sat_records SET superseded_by = :new_id WHERE id = :old_id')
                    ->execute(['new_id' => $newId, 'old_id' => $current]);
            }

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        return self::find($newId);
    }

    public static function recordResult(int $id, string $result, ?int $reportDocumentId, ?string $notes): array
    {
        Database::connection()->prepare(
            'UPDATE fat_sat_records SET result = :result, actual_date = COALESCE(actual_date, CURDATE()),
                                         report_document_id = :report_document_id, notes = :notes
             WHERE id = :id'
        )->execute([
            'result' => $result,
            'report_document_id' => $reportDocumentId,
            'notes' => $notes,
            'id' => $id,
        ]);

        return self::find($id);
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM fat_sat_records WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listForStage(int $orderStageId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM fat_sat_records WHERE order_stage_id = :id ORDER BY id DESC'
        );
        $stmt->execute(['id' => $orderStageId]);

        return $stmt->fetchAll();
    }

    public static function addPunchListItem(
        int $fatSatRecordId,
        string $description,
        string $severity,
        ?int $assignedTo,
        ?string $targetResolutionDate,
        int $raisedBy,
    ): array {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO punch_list_items (fat_sat_record_id, description, severity, assigned_to,
                                             target_resolution_date, raised_by)
             VALUES (:fat_sat_record_id, :description, :severity, :assigned_to,
                     :target_resolution_date, :raised_by)'
        );
        $stmt->execute([
            'fat_sat_record_id' => $fatSatRecordId,
            'description' => $description,
            'severity' => $severity,
            'assigned_to' => $assignedTo,
            'target_resolution_date' => $targetResolutionDate,
            'raised_by' => $raisedBy,
        ]);

        return self::findPunchListItem((int) $db->lastInsertId());
    }

    public static function resolvePunchListItem(int $id, int $resolvedBy): array
    {
        Database::connection()->prepare(
            'UPDATE punch_list_items SET status = "resolved", resolved_at = NOW(), resolved_by = :resolved_by
             WHERE id = :id'
        )->execute(['resolved_by' => $resolvedBy, 'id' => $id]);

        return self::findPunchListItem($id);
    }

    public static function verifyPunchListItem(int $id, int $verifiedBy): array
    {
        Database::connection()->prepare(
            'UPDATE punch_list_items SET verified_by = :verified_by, verified_at = NOW() WHERE id = :id'
        )->execute(['verified_by' => $verifiedBy, 'id' => $id]);

        return self::findPunchListItem($id);
    }

    public static function findPunchListItem(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM punch_list_items WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listPunchListForRecord(int $fatSatRecordId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM punch_list_items WHERE fat_sat_record_id = :id ORDER BY id'
        );
        $stmt->execute(['id' => $fatSatRecordId]);

        return $stmt->fetchAll();
    }

    public static function hasOpenCriticalItems(int $fatSatRecordId): bool
    {
        $stmt = Database::connection()->prepare(
            "SELECT 1 FROM punch_list_items
             WHERE fat_sat_record_id = :id AND severity = 'critical' AND status = 'open'"
        );
        $stmt->execute(['id' => $fatSatRecordId]);

        return $stmt->fetch() !== false;
    }
}
