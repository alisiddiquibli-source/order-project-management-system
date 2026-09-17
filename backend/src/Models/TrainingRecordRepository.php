<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

final class TrainingRecordRepository
{
    public static function create(
        int $orderStageId,
        ?string $scheduledDate,
        ?string $actualDate,
        string $attendees,
        ?string $materialsProvided,
        ?int $reportDocumentId,
        ?string $notes,
    ): array {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO training_records (order_stage_id, scheduled_date, actual_date, attendees,
                                             materials_provided, report_document_id, notes)
             VALUES (:order_stage_id, :scheduled_date, :actual_date, :attendees,
                     :materials_provided, :report_document_id, :notes)'
        );
        $stmt->execute([
            'order_stage_id' => $orderStageId,
            'scheduled_date' => $scheduledDate,
            'actual_date' => $actualDate,
            'attendees' => $attendees,
            'materials_provided' => $materialsProvided,
            'report_document_id' => $reportDocumentId,
            'notes' => $notes,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM training_records WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listForStage(int $orderStageId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM training_records WHERE order_stage_id = :id ORDER BY id DESC'
        );
        $stmt->execute(['id' => $orderStageId]);

        return $stmt->fetchAll();
    }
}
