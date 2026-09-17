<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

/**
 * Append-only (§ security notes) — a correction is a new acceptance, not
 * an edit. See docs/ARCHITECTURE.md §3.4 for the genuine-customer-
 * acceptance rule this table exists to enforce.
 */
final class AcceptanceRepository
{
    public static function create(
        int $orderStageId,
        string $targetRecordType,
        int $targetRecordId,
        string $type,
        string $acceptedByType,
        int $acceptedByUserId,
        ?int $customerAuthorizationEvidenceDocumentId,
        ?string $conditionsNotes,
    ): array {
        // A customer's own acceptance is always genuine. A Sales Manager's
        // only counts as genuine customer acceptance when backed by actual
        // evidence the customer agreed — otherwise it's recorded (so the
        // decision to proceed isn't lost) but doesn't satisfy SAT/Handover/
        // Training completion (§3.4).
        $constitutesCustomerAcceptance = $acceptedByType === 'customer'
            || $customerAuthorizationEvidenceDocumentId !== null;

        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO acceptances (order_stage_id, target_record_type, target_record_id, type,
                                       accepted_by_type, accepted_by_user_id,
                                       customer_authorization_evidence_document_id,
                                       constitutes_customer_acceptance, conditions_notes)
             VALUES (:order_stage_id, :target_record_type, :target_record_id, :type,
                     :accepted_by_type, :accepted_by_user_id,
                     :customer_authorization_evidence_document_id,
                     :constitutes_customer_acceptance, :conditions_notes)'
        );
        $stmt->execute([
            'order_stage_id' => $orderStageId,
            'target_record_type' => $targetRecordType,
            'target_record_id' => $targetRecordId,
            'type' => $type,
            'accepted_by_type' => $acceptedByType,
            'accepted_by_user_id' => $acceptedByUserId,
            'customer_authorization_evidence_document_id' => $customerAuthorizationEvidenceDocumentId,
            'constitutes_customer_acceptance' => $constitutesCustomerAcceptance ? 1 : 0,
            'conditions_notes' => $conditionsNotes,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM acceptances WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listForStage(int $orderStageId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM acceptances WHERE order_stage_id = :id ORDER BY id DESC'
        );
        $stmt->execute(['id' => $orderStageId]);

        return $stmt->fetchAll();
    }
}
