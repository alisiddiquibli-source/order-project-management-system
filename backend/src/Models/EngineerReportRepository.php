<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

final class EngineerReportRepository
{
    public static function create(
        int $orderStageId,
        string $type,
        int $completedBy,
        string $completionStatus,
        ?string $outstandingIssues,
        ?int $reportDocumentId,
        ?string $notes,
    ): array {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO engineer_reports (order_stage_id, type, completed_by, completion_status,
                                             outstanding_issues, report_document_id, notes)
             VALUES (:order_stage_id, :type, :completed_by, :completion_status,
                     :outstanding_issues, :report_document_id, :notes)'
        );
        $stmt->execute([
            'order_stage_id' => $orderStageId,
            'type' => $type,
            'completed_by' => $completedBy,
            'completion_status' => $completionStatus,
            'outstanding_issues' => $outstandingIssues,
            'report_document_id' => $reportDocumentId,
            'notes' => $notes,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM engineer_reports WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listForStage(int $orderStageId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM engineer_reports WHERE order_stage_id = :id ORDER BY id DESC'
        );
        $stmt->execute(['id' => $orderStageId]);

        return $stmt->fetchAll();
    }
}
