<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;
use Bli\Domain\StageCompletionEvaluator;
use PDO;

final class OrderStageRepository
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public static function listForOrder(int $orderId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT os.*, s.name AS stage_name, s.sequence
             FROM order_stages os JOIN stages s ON s.id = os.stage_id
             WHERE os.order_id = :order_id ORDER BY s.sequence'
        );
        $stmt->execute(['order_id' => $orderId]);

        return $stmt->fetchAll();
    }

    /**
     * Raw lookup by the order_stages primary key — for resolving a flat
     * evidence-resource route (e.g. /api/fat-sat/{id}/result) back to its
     * order, so OrderAccess can authorize it. Never call this with a
     * client-supplied id and treat the result as authorized on its own.
     *
     * @return array<string, mixed>|null
     */
    public static function findByPk(int $orderStageId): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM order_stages WHERE id = :id');
        $stmt->execute(['id' => $orderStageId]);
        $stage = $stmt->fetch();

        return $stage === false ? null : $stage;
    }

    /**
     * Looks up by the pipeline stage number (1-12, matching `stages.id` /
     * `stages.sequence`) scoped to one order — NOT `order_stages.id`, which
     * is a global auto-increment shared across every order and would make
     * "stage 5" mean a different thing depending which order you're on.
     *
     * @return array<string, mixed>|null
     */
    public static function find(int $orderId, int $stageId): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM order_stages WHERE order_id = :order_id AND stage_id = :stage_id'
        );
        $stmt->execute(['order_id' => $orderId, 'stage_id' => $stageId]);
        $stage = $stmt->fetch();

        return $stage === false ? null : $stage;
    }

    /**
     * @return array{ok: bool, reason?: string, stage?: array<string, mixed>}
     */
    public static function updateStatus(
        int $orderId,
        array $stage,
        string $newStatus,
        int $actorId,
        ?string $notes,
    ): array {
        if ($newStatus === 'blocked') {
            return ['ok' => false, 'reason' => 'Use POST .../stages/{id}/block to mark a stage blocked — it requires a blocker record.'];
        }

        $stageId = (int) $stage['stage_id'];

        // Stage 5 (FAT) starting before manufacturing (stage 3) is fully
        // done is allowed, but only with a PC note justifying it — §3.1.
        if ($stageId === 5 && in_array($newStatus, ['in_progress', 'completed'], true)) {
            $db = Database::connection();
            $stmt = $db->prepare(
                "SELECT status FROM order_stages WHERE order_id = :order_id AND stage_id = 3"
            );
            $stmt->execute(['order_id' => $orderId]);
            $manufacturingStatus = $stmt->fetchColumn();

            if ($manufacturingStatus !== 'completed' && empty($notes) && empty($stage['notes'])) {
                return [
                    'ok' => false,
                    'reason' => 'Starting FAT before manufacturing is complete requires a note justifying it.',
                ];
            }
        }

        if ($newStatus === 'completed') {
            $result = StageCompletionEvaluator::canComplete($orderId, (int) $stage['id'], $stageId);
            if (!$result['ok']) {
                return ['ok' => false, 'reason' => $result['reason']];
            }
        }

        $db = Database::connection();
        $updates = ['status = :status', 'updated_by = :updated_by'];
        $params = ['status' => $newStatus, 'updated_by' => $actorId, 'id' => $stage['id']];

        if ($notes !== null) {
            $updates[] = 'notes = :notes';
            $params['notes'] = $notes;
        }
        if ($newStatus === 'in_progress' && $stage['actual_start'] === null) {
            $updates[] = 'actual_start = CURDATE()';
        }
        if ($newStatus === 'completed' && $stage['actual_end'] === null) {
            $updates[] = 'actual_end = CURDATE()';
        }

        $sql = 'UPDATE order_stages SET ' . implode(', ', $updates) . ' WHERE id = :id';
        $db->prepare($sql)->execute($params);

        $db->prepare(
            'INSERT INTO activity_log (order_id, entity_type, entity_id, action, old_value, new_value, user_id)
             VALUES (:order_id, "order_stage", :entity_id, "status_change", :old_value, :new_value, :user_id)'
        )->execute([
            'order_id' => $orderId,
            'entity_id' => $stage['id'],
            'old_value' => $stage['status'],
            'new_value' => $newStatus,
            'user_id' => $actorId,
        ]);

        return ['ok' => true, 'stage' => self::find($orderId, (int) $stage['stage_id'])];
    }

    /**
     * Sets or changes a stage's planned dates. The first time a date is
     * set it's also recorded as the immutable original commitment.
     * Changing an ALREADY-set date that was previously flagged
     * customer_informed requires a Sales Manager/Owner approver — §4.1.
     *
     * @return array{ok: bool, reason?: string, stage?: array<string, mixed>}
     */
    public static function updatePlannedDates(
        int $orderId,
        array $stage,
        ?string $plannedStart,
        ?string $plannedEnd,
        string $reason,
        int $changedBy,
        bool $customerInformed,
        ?int $approvedBy,
    ): array {
        $db = Database::connection();
        $isFirstSet = $stage['original_planned_end'] === null;

        if (!$isFirstSet && $plannedEnd !== null && $plannedEnd !== $stage['planned_end']) {
            $stmt = $db->prepare(
                "SELECT 1 FROM commitment_changes
                 WHERE order_stage_id = :id AND field_name = 'planned_end' AND customer_informed = 1"
            );
            $stmt->execute(['id' => $stage['id']]);
            $wasCustomerInformed = $stmt->fetch() !== false;

            if ($wasCustomerInformed && $approvedBy === null) {
                return [
                    'ok' => false,
                    'reason' => 'This date was already communicated to the customer — changing it needs a Sales Manager/Owner approver.',
                ];
            }
        }

        $db->beginTransaction();
        try {
            $updates = [];
            $params = ['id' => $stage['id']];

            // Distinct placeholder names even where the same value is written
            // to two columns — native (non-emulated) prepares reject reusing
            // one named placeholder twice in a statement (see Bli\Auth\Scope
            // for the same fix applied to the authorization queries).
            if ($plannedStart !== null) {
                $updates[] = 'planned_start = :planned_start';
                $params['planned_start'] = $plannedStart;
                if ($isFirstSet) {
                    $updates[] = 'original_planned_start = :original_planned_start';
                    $params['original_planned_start'] = $plannedStart;
                }
            }
            if ($plannedEnd !== null) {
                $updates[] = 'planned_end = :planned_end';
                $params['planned_end'] = $plannedEnd;
                if ($isFirstSet) {
                    $updates[] = 'original_planned_end = :original_planned_end';
                    $params['original_planned_end'] = $plannedEnd;
                }
            }

            if ($updates !== []) {
                $db->prepare('UPDATE order_stages SET ' . implode(', ', $updates) . ' WHERE id = :id')
                    ->execute($params);
            }

            if ($plannedEnd !== null && $plannedEnd !== $stage['planned_end']) {
                $db->prepare(
                    'INSERT INTO commitment_changes
                        (order_id, order_stage_id, field_name, old_value, new_value, reason, changed_by, approved_by, customer_informed)
                     VALUES (:order_id, :order_stage_id, "planned_end", :old_value, :new_value, :reason, :changed_by, :approved_by, :customer_informed)'
                )->execute([
                    'order_id' => $orderId,
                    'order_stage_id' => $stage['id'],
                    'old_value' => $stage['planned_end'],
                    'new_value' => $plannedEnd,
                    'reason' => $reason,
                    'changed_by' => $changedBy,
                    'approved_by' => $approvedBy,
                    'customer_informed' => $customerInformed ? 1 : 0,
                ]);
            }

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        return ['ok' => true, 'stage' => self::find($orderId, (int) $stage['stage_id'])];
    }

    /**
     * Updates notes only, with no status/date change — e.g. a PC leaving a
     * progress comment without moving the stage forward.
     *
     * @return array{ok: bool, stage: array<string, mixed>}
     */
    public static function updateNotes(int $orderId, array $stage, string $notes): array
    {
        Database::connection()
            ->prepare('UPDATE order_stages SET notes = :notes WHERE id = :id')
            ->execute(['notes' => $notes, 'id' => $stage['id']]);

        return ['ok' => true, 'stage' => self::find($orderId, (int) $stage['stage_id'])];
    }

    /**
     * Marks a stage blocked — always through here, never a bare status
     * update, so the required blocker fields can't be skipped (§4.5).
     */
    public static function block(
        int $orderId,
        array $stage,
        string $description,
        string $responsibleParty,
        ?string $responsiblePartyDetail,
        string $nextAction,
        string $nextReviewDate,
        int $actorId,
    ): array {
        $db = Database::connection();
        $db->beginTransaction();
        try {
            $db->prepare('UPDATE order_stages SET status = "blocked", updated_by = :updated_by WHERE id = :id')
                ->execute(['updated_by' => $actorId, 'id' => $stage['id']]);

            $db->prepare(
                'INSERT INTO blockers (order_stage_id, description, responsible_party, responsible_party_detail,
                                        next_action, next_review_date, raised_by)
                 VALUES (:order_stage_id, :description, :responsible_party, :responsible_party_detail,
                         :next_action, :next_review_date, :raised_by)'
            )->execute([
                'order_stage_id' => $stage['id'],
                'description' => $description,
                'responsible_party' => $responsibleParty,
                'responsible_party_detail' => $responsiblePartyDetail,
                'next_action' => $nextAction,
                'next_review_date' => $nextReviewDate,
                'raised_by' => $actorId,
            ]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        return ['ok' => true, 'stage' => self::find($orderId, (int) $stage['stage_id'])];
    }
}
