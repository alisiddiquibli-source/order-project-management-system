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
     * Plain names for error messages — a PC reading "Stage 5 must be
     * completed first" has to go look up what stage 5 even is; naming it
     * here means the message alone is actionable.
     */
    private const STAGE_NAMES = [
        1 => 'Requirements captured',
        2 => 'Order placed',
        3 => 'Machine manufacturing progress',
        4 => 'Machine testing material coordination',
        5 => 'Machine FAT readiness / FAT execution',
        6 => 'Shipment coordination',
        7 => 'Import clearance in Pakistan',
        8 => 'Delivery to customer',
        9 => 'Installation at customer site',
        10 => 'SAT (Site Acceptance Test)',
        11 => 'Training',
        12 => 'Handover',
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

                $requiredName = self::STAGE_NAMES[$requiredStageId] ?? "stage {$requiredStageId}";
                $exceptionNote = $stageId === 6 && $requiredStageId === 5
                    ? ' — or a Sales Manager/Owner can approve an exception if this is a minor/procedural delay'
                    : '';
                return [
                    'ok' => false,
                    'reason' => "\"{$requiredName}\" must be completed first{$exceptionNote}.",
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
                'Add a requirement below, then ask a Sales Manager or the Owner to approve it, before this stage can be marked complete.'
            ),
            2 => self::check(
                $db,
                "SELECT 1 FROM documents WHERE order_id = :order_id AND type = 'PO'",
                ['order_id' => $orderId],
                "Upload the Purchase Order in the Documents section below (set its type to \"PO\") before this stage can be marked complete."
            ),
            3 => self::checkManufacturingMilestones($db, $orderStageId),
            4 => self::check(
                $db,
                "SELECT 1 FROM order_stages WHERE id = :id AND notes IS NOT NULL AND notes <> ''",
                ['id' => $orderStageId],
                'Add a note confirming testing material coordination (using the note field when updating this stage) before it can be marked complete.'
            ),
            5 => self::checkFatOrSat($db, $orderStageId, 'FAT', requireCustomerAcceptance: false),
            6 => self::check(
                $db,
                'SELECT 1 FROM shipments WHERE order_id = :order_id AND actual_dispatch_date IS NOT NULL',
                ['order_id' => $orderId],
                'Record the shipment\'s actual dispatch date in the Shipment section — a booking alone is not enough to mark this stage complete.'
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
            return ['ok' => false, 'reason' => 'Add at least one manufacturing milestone below before this stage can be marked complete.'];
        }

        return (int) $row['total'] === (int) $row['done']
            ? ['ok' => true, 'reason' => null]
            : ['ok' => false, 'reason' => 'Mark every manufacturing milestone as done before this stage can be marked complete.'];
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
            return ['ok' => false, 'reason' => "Schedule and record the {$type} result before this stage can be marked complete."];
        }

        if ($record['result'] === 'pass') {
            if (!$requireCustomerAcceptance) {
                return ['ok' => true, 'reason' => null];
            }
            // Even a straight pass needs the customer's sign-off recorded for SAT.
        } elseif ($record['result'] !== 'conditional_pass') {
            return ['ok' => false, 'reason' => "The {$type} result must be Pass or Conditional Pass before this stage can move forward — a Fail requires starting a retest."];
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
            return ['ok' => false, 'reason' => "Record an acceptance for this {$type} result before this stage can be marked complete."];
        }

        if ($requireCustomerAcceptance && !(bool) $acceptance['constitutes_customer_acceptance']) {
            return [
                'ok' => false,
                'reason' => 'SAT needs the customer\'s own sign-off, not just a Sales Manager\'s — attach the '
                    . 'customer\'s acceptance evidence document before this stage can be marked complete.',
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
            "Update the import tracking status to \"{$requiredStatus}\" before this stage can be marked complete."
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
            'Mark the import tracking status as "delivered", or upload a delivery document, before this stage can be marked complete.'
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

        $label = $type === 'installation' ? 'installation report' : 'handover-readiness report';

        if ($report === false) {
            return ['ok' => false, 'reason' => "The Installation Engineer must submit an {$label} before this stage can be marked complete."];
        }

        if ($report['completion_status'] !== 'complete') {
            return ['ok' => false, 'reason' => "The Installation Engineer's {$label} is marked incomplete — it must be resubmitted as complete before this stage can move forward."];
        }

        if (!empty($report['outstanding_issues'])) {
            return ['ok' => false, 'reason' => "The Installation Engineer's {$label} lists outstanding issues that must be resolved first."];
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
            return ['ok' => false, 'reason' => 'Record the training session and its attendees before this stage can be marked complete.'];
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
            return ['ok' => false, 'reason' => 'Record the customer\'s acknowledgement of the training before this stage can be marked complete.'];
        }

        // Same genuine-customer-acceptance bar as SAT/Handover — training
        // is signed off with the customer present, same as those two.
        if (!(bool) $acceptance['constitutes_customer_acceptance']) {
            return [
                'ok' => false,
                'reason' => 'This needs the customer\'s own sign-off, not just a Sales Manager\'s — attach the '
                    . 'customer\'s acceptance evidence document before this stage can be marked complete.',
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
            'Upload the handover certificate document before this stage can be marked complete.'
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
            return ['ok' => false, 'reason' => 'Record the customer\'s handover confirmation before this stage can be marked complete.'];
        }

        if (!(bool) $acceptance['constitutes_customer_acceptance']) {
            return [
                'ok' => false,
                'reason' => 'Handover needs the customer\'s own sign-off, not just a Sales Manager\'s — attach the '
                    . 'customer\'s acceptance evidence document before this stage can be marked complete.',
            ];
        }

        return ['ok' => true, 'reason' => null];
    }
}
