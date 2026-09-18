<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Auth\Scope;
use Bli\Config\Database;

/**
 * `ai_reports` (docs/ARCHITECTURE.md §10) — every AI output, logged with
 * an acknowledge/dismiss/action lifecycle. Advisory only: nothing here
 * ever triggers a write anywhere else in the system on its own.
 */
final class AiReportRepository
{
    public static function create(
        ?int $orderId,
        ?int $projectId,
        string $type,
        string $provider,
        string $prompt,
        string $response,
        ?int $createdBy,
    ): array {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO ai_reports (order_id, project_id, type, provider, prompt, response, created_by)
             VALUES (:order_id, :project_id, :type, :provider, :prompt, :response, :created_by)'
        );
        $stmt->execute([
            'order_id' => $orderId,
            'project_id' => $projectId,
            'type' => $type,
            'provider' => $provider,
            'prompt' => $prompt,
            'response' => $response,
            'created_by' => $createdBy,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM ai_reports WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * Single-row version of the same authorization used by
     * findVisibleToUser() — for routes acting on one report (e.g. the
     * acknowledge/dismiss/action PATCH) rather than listing them.
     *
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null
     */
    public static function findByIdForUser(int $id, array $claims): ?array
    {
        $report = self::find($id);
        if ($report === null) {
            return null;
        }

        if ($report['order_id'] !== null) {
            return OrderRepository::findByIdForUser((int) $report['order_id'], $claims) !== null ? $report : null;
        }
        if ($report['project_id'] !== null) {
            return ProjectRepository::findByIdForUser((int) $report['project_id'], $claims) !== null ? $report : null;
        }

        return ($claims['role'] ?? null) === 'company_owner' ? $report : null;
    }

    /**
     * Scoped the same way orders/projects are (§7): an order-level report
     * follows order scope, a project-level report follows project scope,
     * and a portfolio-level report (both NULL) is Owner-only — never
     * "any authenticated user", since it's cross-project data. Run as
     * three separate queries (one per report kind) rather than one
     * merged query — each of `Scope::forOrders()`/`forProjects()` expects
     * its own specific table aliases, and forcing them into a single
     * query means either alias collisions or fragile string surgery to
     * avoid them.
     *
     * @param array<string, mixed> $claims
     * @return array<int, array<string, mixed>>
     */
    public static function findVisibleToUser(array $claims, ?string $status = null): array
    {
        $db = Database::connection();
        $statusFilter = $status !== null ? ' AND ar.status = :status' : '';
        $results = [];

        $orderScope = Scope::forOrders($claims);
        $stmt = $db->prepare(
            "SELECT ar.* FROM ai_reports ar
             JOIN orders o ON o.id = ar.order_id
             JOIN projects pr ON pr.id = o.project_id
             WHERE ar.order_id IS NOT NULL AND {$orderScope['sql']}{$statusFilter}"
        );
        $stmt->execute([...$orderScope['params'], ...($status !== null ? ['status' => $status] : [])]);
        array_push($results, ...$stmt->fetchAll());

        $projectScope = Scope::forProjects($claims);
        $stmt = $db->prepare(
            "SELECT ar.* FROM ai_reports ar
             JOIN projects p ON p.id = ar.project_id
             WHERE ar.project_id IS NOT NULL AND {$projectScope['sql']}{$statusFilter}"
        );
        $stmt->execute([...$projectScope['params'], ...($status !== null ? ['status' => $status] : [])]);
        array_push($results, ...$stmt->fetchAll());

        if (($claims['role'] ?? null) === 'company_owner') {
            $stmt = $db->prepare(
                "SELECT ar.* FROM ai_reports ar
                 WHERE ar.order_id IS NULL AND ar.project_id IS NULL{$statusFilter}"
            );
            $stmt->execute($status !== null ? ['status' => $status] : []);
            array_push($results, ...$stmt->fetchAll());
        }

        usort($results, fn (array $a, array $b) => strcmp($b['created_at'], $a['created_at']));

        return $results;
    }

    /**
     * @return array{ok: bool, reason?: string, report?: array<string, mixed>}
     */
    public static function updateStatus(array $report, string $newStatus, int $actorId, ?string $actionNotes): array
    {
        if (!in_array($newStatus, ['acknowledged', 'dismissed', 'actioned'], true)) {
            return ['ok' => false, 'reason' => 'status must be acknowledged|dismissed|actioned.'];
        }

        $db = Database::connection();
        $updates = ['status = :status'];
        $params = ['status' => $newStatus, 'id' => $report['id']];

        if ($report['acknowledged_by'] === null) {
            $updates[] = 'acknowledged_by = :acknowledged_by';
            $updates[] = 'acknowledged_at = NOW()';
            $params['acknowledged_by'] = $actorId;
        }
        if ($actionNotes !== null) {
            $updates[] = 'action_notes = :action_notes';
            $params['action_notes'] = $actionNotes;
        }

        $db->prepare('UPDATE ai_reports SET ' . implode(', ', $updates) . ' WHERE id = :id')->execute($params);

        return ['ok' => true, 'report' => self::find((int) $report['id'])];
    }
}
