<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Auth\Scope;
use Bli\Config\Database;

/**
 * Service tickets (docs/ARCHITECTURE.md §5) — the Engineer manages these
 * directly post-handover, no PC hand-off. Customers raise tickets via
 * their project login; only a genuine customer confirmation (or the
 * SLA cron's auto-close after silence) can close one — an Engineer alone
 * can only take it through open -> in_progress -> resolved.
 */
final class ServiceTicketRepository
{
    /**
     * Default SLA targets by severity, business hours (§5). Not exposed as
     * an env setting like the day/hour-window constants — a caller may
     * still override per ticket (e.g. a contract with a tighter SLA) by
     * passing response_target_hours/resolution_target_hours explicitly.
     */
    private const DEFAULT_SLA_HOURS = [
        'critical' => ['response' => 2, 'resolution' => 24],
        'high' => ['response' => 4, 'resolution' => 48],
        'medium' => ['response' => 8, 'resolution' => 96],
        'low' => ['response' => 24, 'resolution' => 120],
    ];

    /**
     * @param array<string, mixed> $data
     */
    public static function create(int $orderId, array $data, int $openedBy): array
    {
        $db = Database::connection();
        $severity = $data['severity'] ?? 'medium';
        $defaults = self::DEFAULT_SLA_HOURS[$severity] ?? self::DEFAULT_SLA_HOURS['medium'];

        $order = OrderRepository::findByIdUnscoped($orderId);
        $assignedEngineerId = $order['installation_engineer_id'] ?? null;

        $stmt = $db->prepare(
            'INSERT INTO service_tickets (order_id, type, severity, response_target_hours,
                resolution_target_hours, opened_by, assigned_engineer_id, description)
             VALUES (:order_id, :type, :severity, :response_target_hours,
                     :resolution_target_hours, :opened_by, :assigned_engineer_id, :description)'
        );
        $stmt->execute([
            'order_id' => $orderId,
            'type' => $data['type'],
            'severity' => $severity,
            'response_target_hours' => $data['response_target_hours'] ?? $defaults['response'],
            'resolution_target_hours' => $data['resolution_target_hours'] ?? $defaults['resolution'],
            'opened_by' => $openedBy,
            'assigned_engineer_id' => $assignedEngineerId,
            'description' => $data['description'],
        ]);

        return self::find((int) $db->lastInsertId());
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM service_tickets WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function listForOrder(int $orderId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM service_tickets WHERE order_id = :order_id ORDER BY opened_at DESC'
        );
        $stmt->execute(['order_id' => $orderId]);

        return $stmt->fetchAll();
    }

    /**
     * Portfolio-wide list scoped the same way orders are (§7) — Company
     * Owner sees everything, an Engineer sees their own assigned orders'
     * tickets, and so on. Used for the "open/overdue tickets" view.
     *
     * @param array<string, mixed> $claims
     * @return array<int, array<string, mixed>>
     */
    public static function findVisibleToUser(array $claims, ?string $status = null): array
    {
        $scope = Scope::forOrders($claims);
        $params = $scope['params'];

        $statusFilter = '';
        if ($status !== null) {
            $statusFilter = 'AND st.status = :status';
            $params['status'] = $status;
        }

        $stmt = Database::connection()->prepare(
            "SELECT st.* FROM service_tickets st
             JOIN orders o ON o.id = st.order_id
             JOIN projects pr ON pr.id = o.project_id
             WHERE {$scope['sql']} {$statusFilter}
             ORDER BY st.opened_at DESC"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /**
     * Engineer-only forward transitions: open -> in_progress -> resolved.
     * Closing a ticket always goes through confirmClosure() or the SLA
     * cron's auto-close — never this method (§5).
     *
     * @return array{ok: bool, reason?: string, ticket?: array<string, mixed>}
     */
    public static function advanceStatus(array $ticket, string $newStatus, int $actorId, ?string $resolutionNotes): array
    {
        $allowed = ['open' => 'in_progress', 'in_progress' => 'resolved'];
        $current = $ticket['status'];

        if (($allowed[$current] ?? null) !== $newStatus) {
            return [
                'ok' => false,
                'reason' => "Cannot move a ticket from '{$current}' to '{$newStatus}' this way.",
            ];
        }

        if ($newStatus === 'resolved' && ($resolutionNotes === null || trim($resolutionNotes) === '')) {
            return ['ok' => false, 'reason' => 'resolution_notes is required to mark a ticket resolved.'];
        }

        $db = Database::connection();
        $updates = ['status = :status'];
        $params = ['status' => $newStatus, 'id' => $ticket['id']];

        if ($newStatus === 'in_progress' && $ticket['first_response_at'] === null) {
            $updates[] = 'first_response_at = NOW()';
        }
        if ($newStatus === 'resolved') {
            $updates[] = 'resolved_at = NOW()';
            $updates[] = 'resolved_by = :resolved_by';
            $params['resolved_by'] = $actorId;
            $updates[] = 'resolution_notes = :resolution_notes';
            $params['resolution_notes'] = $resolutionNotes;
        }

        $db->prepare('UPDATE service_tickets SET ' . implode(', ', $updates) . ' WHERE id = :id')->execute($params);

        $db->prepare(
            'INSERT INTO activity_log (order_id, entity_type, entity_id, action, old_value, new_value, user_id)
             VALUES (:order_id, "service_ticket", :entity_id, "status_change", :old_value, :new_value, :user_id)'
        )->execute([
            'order_id' => $ticket['order_id'],
            'entity_id' => $ticket['id'],
            'old_value' => $current,
            'new_value' => $newStatus,
            'user_id' => $actorId,
        ]);

        return ['ok' => true, 'ticket' => self::find((int) $ticket['id'])];
    }

    /**
     * The only normal path to `closed` — the customer confirming the fix
     * (§5). Requires the ticket to already be `resolved`.
     *
     * @return array{ok: bool, reason?: string, ticket?: array<string, mixed>}
     */
    public static function confirmClosure(array $ticket, int $customerId): array
    {
        if ($ticket['status'] !== 'resolved') {
            return ['ok' => false, 'reason' => "Only a resolved ticket can be confirmed closed (this one is '{$ticket['status']}')."];
        }

        Database::connection()->prepare(
            "UPDATE service_tickets
             SET status = 'closed', closure_type = 'customer_confirmed', closed_at = NOW(), closed_by = :closed_by
             WHERE id = :id"
        )->execute(['closed_by' => $customerId, 'id' => $ticket['id']]);

        return ['ok' => true, 'ticket' => self::find((int) $ticket['id'])];
    }

    /**
     * The SLA cron's auto-close after silence (§5) — recorded explicitly
     * as unconfirmed, never presented as if the customer agreed.
     */
    public static function autoClose(int $ticketId): void
    {
        Database::connection()->prepare(
            "UPDATE service_tickets
             SET status = 'closed', closure_type = 'auto_closed_no_response', closed_at = NOW(), closed_by = NULL
             WHERE id = :id"
        )->execute(['id' => $ticketId]);
    }
}
