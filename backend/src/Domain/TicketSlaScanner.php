<?php

declare(strict_types=1);

namespace Bli\Domain;

use Bli\Config\Database;
use Bli\Models\NotificationRepository;
use Bli\Models\ServiceTicketRepository;
use DateTimeImmutable;

/**
 * The hourly SLA scan (docs/ARCHITECTURE.md §5). A daily scan can't catch
 * an hour-level SLA breach in time, hence a separate cron from the
 * (daily) stage-deadline scanner. Idempotent same-day, same as that one.
 */
final class TicketSlaScanner
{
    /**
     * @return array{response_breaches: int, resolution_breaches: int, auto_closed: int}
     */
    public function run(): array
    {
        return [
            'response_breaches' => $this->scanResponseBreaches(),
            'resolution_breaches' => $this->scanResolutionBreaches(),
            'auto_closed' => $this->autoCloseStaleResolved(),
        ];
    }

    private function scanResponseBreaches(): int
    {
        $now = new DateTimeImmutable();
        $db = Database::connection();
        $stmt = $db->query(
            "SELECT * FROM service_tickets WHERE status = 'open' AND first_response_at IS NULL"
        );

        $count = 0;
        foreach ($stmt->fetchAll() as $ticket) {
            $opened = new DateTimeImmutable($ticket['opened_at']);
            $elapsed = BusinessHours::elapsedBusinessHours($opened, $now);

            if ($elapsed > (float) $ticket['response_target_hours']) {
                $this->notifyBreach($ticket, 'ticket_response_overdue',
                    "Service ticket #{$ticket['id']} on order #{$ticket['order_id']} has had no response "
                    . "in {$ticket['response_target_hours']} business hour(s) — response SLA breached.");
                $count++;
            }
        }

        return $count;
    }

    private function scanResolutionBreaches(): int
    {
        $now = new DateTimeImmutable();
        $db = Database::connection();
        $stmt = $db->query(
            "SELECT * FROM service_tickets WHERE status IN ('open', 'in_progress') AND resolved_at IS NULL"
        );

        $count = 0;
        foreach ($stmt->fetchAll() as $ticket) {
            $opened = new DateTimeImmutable($ticket['opened_at']);
            $elapsed = BusinessHours::elapsedBusinessHours($opened, $now);

            if ($elapsed > (float) $ticket['resolution_target_hours']) {
                $this->notifyBreach($ticket, 'ticket_resolution_overdue',
                    "Service ticket #{$ticket['id']} on order #{$ticket['order_id']} has exceeded its "
                    . "{$ticket['resolution_target_hours']}-business-hour resolution SLA.");
                $count++;
            }
        }

        return $count;
    }

    private function autoCloseStaleResolved(): int
    {
        $now = new DateTimeImmutable();
        $autoCloseDays = (int) ($_ENV['TICKET_AUTO_CLOSE_BUSINESS_DAYS'] ?? 5);

        $db = Database::connection();
        $stmt = $db->query("SELECT * FROM service_tickets WHERE status = 'resolved'");

        $count = 0;
        foreach ($stmt->fetchAll() as $ticket) {
            $resolvedAt = new DateTimeImmutable($ticket['resolved_at']);
            $elapsedDays = BusinessHours::businessDaysElapsedSince($resolvedAt, $now);

            if ($elapsedDays >= $autoCloseDays) {
                ServiceTicketRepository::autoClose((int) $ticket['id']);
                $count++;
            }
        }

        return $count;
    }

    /**
     * Recipients: the assigned Engineer and every Company Owner (§5 —
     * Owner has portfolio-wide visibility into open/overdue tickets).
     * Same-day dedup per (user, ticket-as-order-context, type) via
     * NotificationRepository, consistent with the deadline cron.
     *
     * @param array<string, mixed> $ticket
     */
    private function notifyBreach(array $ticket, string $type, string $message): void
    {
        $db = Database::connection();
        $recipientIds = [];
        if ($ticket['assigned_engineer_id'] !== null) {
            $recipientIds[] = (int) $ticket['assigned_engineer_id'];
        }

        $ownersStmt = $db->query("SELECT id FROM users WHERE role = 'company_owner' AND status = 'active'");
        foreach ($ownersStmt->fetchAll() as $owner) {
            $recipientIds[] = (int) $owner['id'];
        }

        foreach (array_unique($recipientIds) as $userId) {
            NotificationRepository::createIfNotAlreadySentToday($userId, (int) $ticket['order_id'], $type, $message);
        }
    }
}
