<?php

declare(strict_types=1);

namespace Bli\Domain;

use Bli\Config\Database;
use Bli\Models\OrderRepository;
use Bli\Models\ProjectRepository;

/**
 * Assembles the scoped facts an AI prompt is built from
 * (docs/ARCHITECTURE.md §10). **The scope filter lives here, not in the
 * route or the caller** — every method re-authorizes against the
 * database from the requester's own claims, the same as any other read,
 * so a prompt can never end up including another customer's or another
 * Sales Manager's data because a route forgot to check first. Each
 * method returns `null` for "not found or not visible to this user" —
 * callers turn that into a 404, same convention as everywhere else.
 */
final class AiDataGatherer
{
    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null
     */
    public static function orderRiskFacts(int $orderId, array $claims): ?array
    {
        $order = OrderRepository::findByIdForUser($orderId, $claims);
        if ($order === null) {
            return null;
        }

        $db = Database::connection();

        $stmt = $db->prepare(
            'SELECT os.stage_id, s.name AS stage_name, os.status, os.planned_end, os.actual_end, os.notes
             FROM order_stages os JOIN stages s ON s.id = os.stage_id
             WHERE os.order_id = :order_id ORDER BY s.sequence'
        );
        $stmt->execute(['order_id' => $orderId]);
        $stages = $stmt->fetchAll();

        $stmt = $db->prepare(
            'SELECT b.description, b.responsible_party, b.responsible_party_detail, b.next_action,
                    b.next_review_date, b.raised_at, s.name AS stage_name
             FROM blockers b
             JOIN order_stages os ON os.id = b.order_stage_id
             JOIN stages s ON s.id = os.stage_id
             WHERE os.order_id = :order_id AND b.resolved_at IS NULL
             ORDER BY b.raised_at'
        );
        $stmt->execute(['order_id' => $orderId]);
        $openBlockers = $stmt->fetchAll();

        $stmt = $db->prepare(
            "SELECT field_name, old_value, new_value, reason, customer_informed, changed_at
             FROM commitment_changes WHERE order_id = :order_id ORDER BY changed_at DESC LIMIT 10"
        );
        $stmt->execute(['order_id' => $orderId]);
        $recentCommitmentChanges = $stmt->fetchAll();

        $stmt = $db->prepare(
            "SELECT COUNT(*) AS open_count FROM service_tickets
             WHERE order_id = :order_id AND status IN ('open', 'in_progress')"
        );
        $stmt->execute(['order_id' => $orderId]);
        $openTickets = (int) $stmt->fetchColumn();

        return [
            'order' => $order,
            'stages' => $stages,
            'open_blockers' => $openBlockers,
            'recent_commitment_changes' => $recentCommitmentChanges,
            'open_service_tickets' => $openTickets,
        ];
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null
     */
    public static function projectStatusFacts(int $projectId, array $claims): ?array
    {
        $project = ProjectRepository::findByIdForUser($projectId, $claims);
        if ($project === null) {
            return null;
        }

        return self::buildProjectStatusFacts($project, OrderRepository::findVisibleToUser($claims, $projectId));
    }

    /**
     * Unscoped variant for the daily digest cron (docs/ROADMAP.md) — no
     * request claims exist outside a real HTTP request, so this trusts
     * its caller (`AiDigestScanner`) to have already picked a legitimate
     * project rather than re-deriving authorization from nothing.
     *
     * @return array<string, mixed>|null null if the project doesn't exist
     */
    public static function projectStatusFactsUnscoped(int $projectId): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM projects WHERE id = :id');
        $stmt->execute(['id' => $projectId]);
        $project = $stmt->fetch();
        if ($project === false) {
            return null;
        }

        $stmt = Database::connection()->prepare('SELECT * FROM orders WHERE project_id = :project_id');
        $stmt->execute(['project_id' => $projectId]);

        return self::buildProjectStatusFacts($project, $stmt->fetchAll());
    }

    /**
     * @param array<string, mixed> $project
     * @param array<int, array<string, mixed>> $orders
     * @return array<string, mixed>
     */
    private static function buildProjectStatusFacts(array $project, array $orders): array
    {
        $db = Database::connection();
        $orderSummaries = [];
        foreach ($orders as $order) {
            $stmt = $db->prepare(
                "SELECT COUNT(*) AS total, SUM(status = 'completed') AS completed,
                        SUM(status IN ('delayed', 'blocked')) AS at_risk
                 FROM order_stages WHERE order_id = :order_id"
            );
            $stmt->execute(['order_id' => $order['id']]);
            $progress = $stmt->fetch();

            $orderSummaries[] = [
                'order_number' => $order['order_number'],
                'machine_name' => $order['machine_name'],
                'status' => $order['status'],
                'target_handover_date' => $order['target_handover_date'],
                'stages_completed' => (int) $progress['completed'],
                'stages_total' => (int) $progress['total'],
                'stages_at_risk' => (int) $progress['at_risk'],
            ];
        }

        return ['project' => $project, 'orders' => $orderSummaries];
    }

    /**
     * Owner-only, checked here independent of the route — the whole point
     * of enforcing scope in the gathering function, not the caller.
     *
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null
     */
    public static function portfolioFacts(array $claims): ?array
    {
        if (($claims['role'] ?? null) !== 'company_owner') {
            return null;
        }

        return self::buildPortfolioFacts();
    }

    /**
     * Unscoped variant for the daily digest cron — see
     * projectStatusFactsUnscoped() for why this exists separately from
     * the claims-gated version rather than faking an owner's claims.
     *
     * @return array<string, mixed>
     */
    public static function portfolioFactsUnscoped(): array
    {
        return self::buildPortfolioFacts();
    }

    /**
     * @return array<string, mixed>
     */
    private static function buildPortfolioFacts(): array
    {
        $db = Database::connection();

        // Attribution by responsible_party, per project — never a raw
        // overdue count and never "who typed the entry" (§10).
        $stmt = $db->query(
            "SELECT pr.id AS project_id, pr.project_number, b.responsible_party, COUNT(*) AS open_count
             FROM blockers b
             JOIN order_stages os ON os.id = b.order_stage_id
             JOIN orders o ON o.id = os.order_id
             JOIN projects pr ON pr.id = o.project_id
             WHERE b.resolved_at IS NULL
             GROUP BY pr.id, pr.project_number, b.responsible_party
             ORDER BY pr.project_number"
        );
        $blockersByProjectAndParty = $stmt->fetchAll();

        $stmt = $db->query(
            "SELECT pr.id AS project_id, pr.project_number, COUNT(*) AS change_count,
                    SUM(cc.customer_informed) AS customer_informed_count
             FROM commitment_changes cc
             JOIN orders o ON o.id = cc.order_id
             JOIN projects pr ON pr.id = o.project_id
             WHERE cc.changed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY pr.id, pr.project_number
             ORDER BY pr.project_number"
        );
        $commitmentChangesByProject = $stmt->fetchAll();

        $stmt = $db->query(
            "SELECT status, COUNT(*) AS count FROM orders GROUP BY status"
        );
        $ordersByStatus = $stmt->fetchAll();

        $stmt = $db->query(
            "SELECT COUNT(*) AS open_count FROM service_tickets WHERE status IN ('open', 'in_progress')"
        );
        $openTickets = (int) $stmt->fetchColumn();

        return [
            'orders_by_status' => $ordersByStatus,
            'open_blockers_by_project_and_party' => $blockersByProjectAndParty,
            'commitment_changes_last_30_days_by_project' => $commitmentChangesByProject,
            'open_service_tickets_portfolio_wide' => $openTickets,
        ];
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null
     */
    public static function followUpDraftFacts(int $orderId, string $channel, array $claims): ?array
    {
        $order = OrderRepository::findByIdForUser($orderId, $claims);
        if ($order === null) {
            return null;
        }

        $stmt = Database::connection()->prepare(
            'SELECT c.message, c.created_at, u.name AS user_name
             FROM comments c JOIN users u ON u.id = c.user_id
             WHERE c.order_id = :order_id AND c.channel = :channel
             ORDER BY c.created_at DESC LIMIT 10'
        );
        $stmt->execute(['order_id' => $orderId, 'channel' => $channel]);
        $recentComments = array_reverse($stmt->fetchAll());

        return ['order' => $order, 'channel' => $channel, 'recent_comments' => $recentComments];
    }
}
