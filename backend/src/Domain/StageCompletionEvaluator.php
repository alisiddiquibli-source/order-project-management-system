<?php

declare(strict_types=1);

namespace Bli\Domain;

use Bli\Config\Database;
use PDO;

/**
 * Gatekeeps marking an order_stage `completed`, per docs/ARCHITECTURE.md
 * §3.1 (hard prerequisites) and §3.2 (per-stage completion criteria).
 * This is the single place those rules are enforced — a stage's status
 * is never flipped to `completed` from anywhere else without going
 * through here.
 */
final class StageCompletionEvaluator
{
    /** @var array<int, int[]> stage_id => stage_ids that must already be `completed` */
    private const HARD_PREREQUISITES = [
        3 => [2],
        4 => [2],
        6 => [5], // special-cased below: an approved exception can stand in for this
        7 => [6],
        8 => [7],
        9 => [8],
        10 => [9],
        12 => [10, 11],
    ];

    /**
     * @return array{ok: bool, reason: ?string}
     */
    public static function canComplete(int $orderId, int $orderStageId, int $stageId): array
    {
        $prereq = self::checkPrerequisites($orderId, $stageId, $orderStageId);
        if (!$prereq['ok']) {
            return $prereq;
        }

        return self::checkEvidence($orderId, $orderStageId, $stageId);
    }

    /**
     * @return array{ok: bool, reason: ?string}
     */
    private static function checkPrerequisites(int $orderId, int $stageId, int $orderStageId): array
    {
        $required = self::HARD_PREREQUISITES[$stageId] ?? [];
        if ($required === []) {
            return ['ok' => true, 'reason' => null];
        }

        $db = Database::connection();

        foreach ($required as $requiredStageId) {
            $stmt = $db->prepare(
                'SELECT status FROM order_stages WHERE order_id = :order_id AND stage_id = :stage_id'
            );
            $stmt->execute(['order_id' => $orderId, 'stage_id' => $requiredStageId]);
            $status = $stmt->fetchColumn();

            if ($status !== 'completed') {
                // Stage 6's only prerequisite (5, FAT) can be stood in for
                // by an approved exception — never for any other stage.
                if ($stageId === 6 && $requiredStageId === 5
                    && self::hasApprovedException($orderStageId, 5)) {
                    continue;
                }

                return [
                    'ok' => false,
                    'reason' => "Stage {$requiredStageId} must be completed first (or, for stage 6 only, have an approved exception).",
                ];
            }
        }

        return ['ok' => true, 'reason' => null];
    }

    private static function hasApprovedException(int $orderStageId, int $prerequisiteStageId): bool
    {
        $stmt = Database::connection()->prepare(
            'SELECT 1 FROM stage_exceptions
             WHERE order_stage_id = :order_stage_id AND prerequisite_stage_id = :prerequisite_stage_id'
        );
        $stmt->execute(['order_stage_id' => $orderStageId, 'prerequisite_stage_id' => $prerequisiteStageId]);

        return $stmt->fetch() !== false;
    }

    /**
     * @return array{ok: bool, reason: ?string}
     */
    private static function checkEvidence(int $orderId, int $orderStageId, int $stageId): array
    {
        $db = Database::connection();

        return match ($stageId) {
            1 => self::check(
                $db,
                'SELECT 1 FROM requirements WHERE order_id = :order_id AND approved_at IS NOT NULL',
                ['order_id' => $orderId],
                'Requirements must be approved (requirements.approved_by/approved_at).'
            ),
            2 => self::check(
                $db,
                "SELECT 1 FROM documents WHERE order_id = :order_id AND type = 'PO'",
                ['order_id' => $orderId],
                'A PO document must be uploaded.'
            ),
            3 => self::checkManufacturingMilestones($db, $orderStageId),
            4 => self::check(
                $db,
                "SELECT 1 FROM order_stages WHERE id = :id AND notes IS NOT NULL AND notes <> ''",
                ['id' => $orderStageId],
                'Testing material coordination needs PC-confirmed notes.'
            ),
            5 => self::checkFatOrSat($db, $orderStageId, 'FAT', requireCustomerAcceptance: false),
            6 => self::check(
                $db,
                'SELECT 1 FROM shipments WHERE order_id = :order_id AND actual_dispatch_date IS NOT NULL',
                ['order_id' => $orderId],
                'Shipment needs an actual_dispatch_date — a booking alone is not dispatch.'
            ),
            7 => self::checkImportTracking($db, $orderStageId, 'cleared'),
            8 => self::checkDelivery($db, $orderId, $orderStageId),
            9 => self::checkEngineerReport($db, $orderStageId, 'installation'),
            10 => self::checkFatOrSat($db, $orderStageId, 'SAT', requireCustomerAcceptance: true),
            11 => self::checkTraining($db, $orderStageId),
            12 => self::checkHandover($db, $orderId, $orderStageId),
            default => ['ok' => true, 'reason' => null],
        };
    }

    /**
     * @param array<string, mixed> $params
     * @return array{ok: bool, reason: ?string}
     */
    private static function check(PDO $db, string $sql, array $params, string $failureReason): array
    {
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetch() !== false
            ? ['ok' => true, 'reason' => null]
            : ['ok' => false, 'reason' => $failureReason];
    }

    /**
     * @return array{ok: bool, reason: ?string}
     */
    private static function checkManufacturingMilestones(PDO $db, int $orderStageId): array
    {
        $stmt = $db->prepare(
            "SELECT COUNT(*) AS total, SUM(status = 'done') AS done
             FROM manufacturing_milestones WHERE order_stage_id = :id"
        );
        $stmt->execute(['id' => $orderStageId]);
        $row = $stmt->fetch();

        if ((int) $row['total'] === 0) {
            return ['ok' => false, 'reason' => 'Manufacturing checklist is empty — add at least one milestone.'];
        }

        return (int) $row['total'] === (int) $row['done']
            ? ['ok' => true, 'reason' => null]
            : ['ok' => false, 'reason' => 'Not every manufacturing milestone is done.'];
    }

    /**
     * The current (non-superseded) FAT/SAT record must be `pass`, or
     * `conditional_pass` with a valid acceptance tied to that exact record.
     * SAT additionally requires that acceptance to be a genuine customer
     * acceptance (§3.4) — a Sales Manager alone is not enough.
     *
     * @return array{ok: bool, reason: ?string}
     */
    private static function checkFatOrSat(PDO $db, int $orderStageId, string $type, bool $requireCustomerAcceptance): array
    {
        $stmt = $db->prepare(
            'SELECT id, result FROM fat_sat_records
             WHERE order_stage_id = :id AND type = :type AND superseded_by IS NULL
             ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute(['id' => $orderStageId, 'type' => $type]);
        $record = $stmt->fetch();

        if ($record === false) {
            return ['ok' => false, 'reason' => "No {$type} record on file."];
        }

        if ($record['result'] === 'pass') {
            if (!$requireCustomerAcceptance) {
                return ['ok' => true, 'reason' => null];
            }
            // Even a straight pass needs the customer's sign-off recorded for SAT.
        } elseif ($record['result'] !== 'conditional_pass') {
            return ['ok' => false, 'reason' => "{$type} result is not pass or conditional_pass."];
        }

        $acceptanceType = $type === 'FAT' ? 'fat_conditional' : 'sat_result';
        $stmt = $db->prepare(
            'SELECT constitutes_customer_acceptance FROM acceptances
             WHERE order_stage_id = :order_stage_id AND target_record_type = "fat_sat_record"
               AND target_record_id = :record_id AND type = :type
             ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute(['order_stage_id' => $orderStageId, 'record_id' => $record['id'], 'type' => $acceptanceType]);
        $acceptance = $stmt->fetch();

        if ($acceptance === false) {
            return ['ok' => false, 'reason' => "{$type} needs an acceptance record tied to this exact result."];
        }

        if ($requireCustomerAcceptance && !(bool) $acceptance['constitutes_customer_acceptance']) {
            return [
                'ok' => false,
                'reason' => 'SAT needs genuine customer acceptance — a Sales Manager acceptance without '
                    . 'customer_authorization_evidence_document_id does not satisfy this.',
            ];
        }

        return ['ok' => true, 'reason' => null];
    }

    /**
     * @return array{ok: bool, reason: ?string}
     */
    private static function checkImportTracking(PDO $db, int $orderStageId, string $requiredStatus): array
    {
        return self::check(
            $db,
            'SELECT 1 FROM customer_import_tracking WHERE order_stage_id = :id AND latest_status = :status',
            ['id' => $orderStageId, 'status' => $requiredStatus],
            "customer_import_tracking.latest_status must be '{$requiredStatus}'."
        );
    }

    /**
     * @return array{ok: bool, reason: ?string}
     */
    private static function checkDelivery(PDO $db, int $orderId, int $orderStageId): array
    {
        $delivered = self::check(
            $db,
            "SELECT 1 FROM customer_import_tracking WHERE order_stage_id = :id AND latest_status = 'delivered'",
            ['id' => $orderStageId],
            ''
        );
        if ($delivered['ok']) {
            return $delivered;
        }

        return self::check(
            $db,
            "SELECT 1 FROM documents WHERE order_id = :order_id AND type LIKE '%delivery%'",
            ['order_id' => $orderId],
            "Delivery needs customer_import_tracking.latest_status='delivered' or a delivery document."
        );
    }

    /**
     * @return array{ok: bool, reason: ?string}
     */
    private static function checkEngineerReport(PDO $db, int $orderStageId, string $type): array
    {
        $stmt = $db->prepare(
            "SELECT completion_status, outstanding_issues FROM engineer_reports
             WHERE order_stage_id = :id AND type = :type ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute(['id' => $orderStageId, 'type' => $type]);
        $report = $stmt->fetch();

        if ($report === false) {
            return ['ok' => false, 'reason' => "No {$type} engineer report on file."];
        }

        if ($report['completion_status'] !== 'complete') {
            return ['ok' => false, 'reason' => "Engineer marked {$type} incomplete."];
        }

        if (!empty($report['outstanding_issues'])) {
            return ['ok' => false, 'reason' => 'Engineer report lists outstanding issues.'];
        }

        return ['ok' => true, 'reason' => null];
    }

    /**
     * @return array{ok: bool, reason: ?string}
     */
    private static function checkTraining(PDO $db, int $orderStageId): array
    {
        $stmt = $db->prepare(
            "SELECT id FROM training_records WHERE order_stage_id = :id
             AND attendees IS NOT NULL AND attendees <> '' ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute(['id' => $orderStageId]);
        $record = $stmt->fetch();

        if ($record === false) {
            return ['ok' => false, 'reason' => 'No training record with attendees on file.'];
        }

        $stmt = $db->prepare(
            "SELECT constitutes_customer_acceptance FROM acceptances
             WHERE order_stage_id = :order_stage_id AND target_record_type = 'training_record'
               AND target_record_id = :record_id AND type = 'training_ack'
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute(['order_stage_id' => $orderStageId, 'record_id' => $record['id']]);
        $acceptance = $stmt->fetch();

        if ($acceptance === false) {
            return ['ok' => false, 'reason' => 'Training needs a training_ack acceptance tied to this record.'];
        }

        // Same genuine-customer-acceptance bar as SAT/Handover — training
        // is signed off with the customer present, same as those two.
        if (!(bool) $acceptance['constitutes_customer_acceptance']) {
            return [
                'ok' => false,
                'reason' => 'Training needs genuine customer acceptance — a Sales Manager acceptance without '
                    . 'customer_authorization_evidence_document_id does not satisfy this.',
            ];
        }

        return ['ok' => true, 'reason' => null];
    }

    /**
     * @return array{ok: bool, reason: ?string}
     */
    private static function checkHandover(PDO $db, int $orderId, int $orderStageId): array
    {
        $engineerCheck = self::checkEngineerReport($db, $orderStageId, 'handover_readiness');
        if (!$engineerCheck['ok']) {
            return $engineerCheck;
        }

        $stmt = $db->prepare(
            "SELECT id FROM engineer_reports WHERE order_stage_id = :id
             AND type = 'handover_readiness' ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute(['id' => $orderStageId]);
        $report = $stmt->fetch();

        $certificateCheck = self::check(
            $db,
            "SELECT 1 FROM documents WHERE order_id = :order_id AND type LIKE '%handover%'",
            ['order_id' => $orderId],
            'A handover certificate document must be uploaded.'
        );
        if (!$certificateCheck['ok']) {
            return $certificateCheck;
        }

        $stmt = $db->prepare(
            "SELECT constitutes_customer_acceptance FROM acceptances
             WHERE order_stage_id = :order_stage_id AND target_record_type = 'engineer_report'
               AND target_record_id = :record_id AND type = 'handover_confirmation'
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute(['order_stage_id' => $orderStageId, 'record_id' => $report['id']]);
        $acceptance = $stmt->fetch();

        if ($acceptance === false) {
            return ['ok' => false, 'reason' => 'Handover needs a handover_confirmation acceptance record.'];
        }

        if (!(bool) $acceptance['constitutes_customer_acceptance']) {
            return [
                'ok' => false,
                'reason' => 'Handover needs genuine customer acceptance — a Sales Manager acceptance without '
                    . 'customer_authorization_evidence_document_id does not satisfy this.',
            ];
        }

        return ['ok' => true, 'reason' => null];
    }
}
