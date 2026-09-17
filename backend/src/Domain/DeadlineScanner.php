<?php

declare(strict_types=1);

namespace Bli\Domain;

use Bli\Config\Database;
use Bli\Models\NotificationRepository;
use PDO;

/**
 * The daily deadline/blocker scan (docs/ARCHITECTURE.md §4.4-4.5). Run by
 * cron/check_stage_deadlines.php. Idempotent within a calendar day — safe
 * to run more than once without spamming duplicate notifications.
 */
final class DeadlineScanner
{
    private const AT_RISK_WARNING_DAYS = 3;
    private const BLOCKER_ESCALATION_DAYS = 7;

    /**
     * @return array{at_risk: int, overdue: int, blockers_escalated: int}
     */
    public function run(): array
    {
        $atRisk = $this->scanAtRiskStages();
        $overdue = $this->scanOverdueStages();
        $escalated = $this->scanStaleBlockers();

        return ['at_risk' => $atRisk, 'overdue' => $overdue, 'blockers_escalated' => $escalated];
    }

    private function scanAtRiskStages(): int
    {
        $db = Database::connection();
        $stmt = $db->query(
            "SELECT os.id, os.order_id, os.stage_id, os.planned_end, s.name AS stage_name
             FROM order_stages os
             JOIN stages s ON s.id = os.stage_id
             WHERE os.status IN ('not_started', 'in_progress')
               AND os.planned_end IS NOT NULL
               AND os.planned_end BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL "
            . self::AT_RISK_WARNING_DAYS . " DAY)"
        );

        $count = 0;
        foreach ($stmt->fetchAll() as $stage) {
            $message = "Stage '{$stage['stage_name']}' on order #{$stage['order_id']} is due "
                . "{$stage['planned_end']} — at risk.";
            $this->notifyOrderStakeholders((int) $stage['order_id'], 'stage_at_risk', $message);
            $count++;
        }

        return $count;
    }

    private function scanOverdueStages(): int
    {
        $db = Database::connection();
        // Deliberately includes stages already `delayed` or `blocked` — a
        // delay keeps accruing and stays visible, never excluded once
        // flagged (§4.4-4.5 — the earlier draft that stopped here was wrong).
        $stmt = $db->query(
            "SELECT os.id, os.order_id, os.stage_id, os.status, os.planned_end, s.name AS stage_name,
                    DATEDIFF(CURDATE(), os.planned_end) AS days_overdue
             FROM order_stages os
             JOIN stages s ON s.id = os.stage_id
             WHERE os.status IN ('not_started', 'in_progress', 'delayed', 'blocked')
               AND os.planned_end IS NOT NULL
               AND os.planned_end < CURDATE()"
        );

        $count = 0;
        foreach ($stmt->fetchAll() as $stage) {
            if ($stage['status'] === 'in_progress' || $stage['status'] === 'not_started') {
                $db->prepare("UPDATE order_stages SET status = 'delayed' WHERE id = :id")
                    ->execute(['id' => $stage['id']]);
            }

            $message = "Stage '{$stage['stage_name']}' on order #{$stage['order_id']} is "
                . "{$stage['days_overdue']} day(s) overdue" . ($stage['status'] === 'blocked' ? ' and blocked' : '') . '.';
            $this->notifyOrderStakeholders((int) $stage['order_id'], 'stage_overdue', $message);
            $count++;
        }

        return $count;
    }

    private function scanStaleBlockers(): int
    {
        $db = Database::connection();
        $stmt = $db->query(
            "SELECT b.id, b.order_stage_id, b.next_review_date, b.raised_at, os.order_id, s.name AS stage_name
             FROM blockers b
             JOIN order_stages os ON os.id = b.order_stage_id
             JOIN stages s ON s.id = os.stage_id
             WHERE b.resolved_at IS NULL
               AND (b.next_review_date < CURDATE()
                    OR DATEDIFF(CURDATE(), b.raised_at) >= " . self::BLOCKER_ESCALATION_DAYS . ')'
        );

        $count = 0;
        foreach ($stmt->fetchAll() as $blocker) {
            $message = "Blocker on stage '{$blocker['stage_name']}' (order #{$blocker['order_id']}) "
                . "needs attention — review date {$blocker['next_review_date']} has passed, or it's been open "
                . self::BLOCKER_ESCALATION_DAYS . '+ days.';
            // Escalates beyond the PC — Sales Manager + Owner specifically,
            // not routine tracking (§4.5).
            $this->notifyOrderStakeholders((int) $blocker['order_id'], 'blocker_escalation', $message, includePc: false);
            $count++;
        }

        return $count;
    }

    /**
     * Recipients: the order's PC, its Sales Manager, and every Company
     * Owner (§4.4). Skips a recipient if the same (user, order, type)
     * notification was already sent today — idempotent across re-runs.
     */
    private function notifyOrderStakeholders(int $orderId, string $type, string $message, bool $includePc = true): void
    {
        $db = Database::connection();

        $stmt = $db->prepare(
            'SELECT o.project_coordinator_id AS order_pc, pr.project_coordinator_id AS project_pc,
                    pr.sales_manager_id
             FROM orders o JOIN projects pr ON pr.id = o.project_id
             WHERE o.id = :order_id'
        );
        $stmt->execute(['order_id' => $orderId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return;
        }

        $recipientIds = [];
        if ($includePc) {
            $recipientIds[] = $row['order_pc'] ?? $row['project_pc'];
        }
        $recipientIds[] = $row['sales_manager_id'];

        $ownersStmt = $db->query("SELECT id FROM users WHERE role = 'company_owner' AND status = 'active'");
        foreach ($ownersStmt->fetchAll() as $owner) {
            $recipientIds[] = $owner['id'];
        }

        foreach (array_unique(array_filter($recipientIds)) as $userId) {
            NotificationRepository::createIfNotAlreadySentToday((int) $userId, $orderId, $type, $message);
        }
    }
}
