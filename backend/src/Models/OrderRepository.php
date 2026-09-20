<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Auth\Scope;
use Bli\Config\Database;
use PDO;

final class OrderRepository
{
    /**
     * @param array<string, mixed> $claims
     * @param int|null $projectId optional filter to one project's orders
     * @return array<int, array<string, mixed>>
     */
    public static function findVisibleToUser(array $claims, ?int $projectId = null): array
    {
        $scope = Scope::forOrders($claims);
        $params = $scope['params'];

        $projectFilter = '';
        if ($projectId !== null) {
            $projectFilter = 'AND o.project_id = :project_id';
            $params['project_id'] = $projectId;
        }

        $stmt = Database::connection()->prepare(
            "SELECT o.* FROM orders o
             JOIN projects pr ON pr.id = o.project_id
             WHERE {$scope['sql']} {$projectFilter}
             ORDER BY o.created_at DESC"
        );
        $stmt->execute($params);

        return array_map(fn (array $order) => self::redactForRole($order, $claims), $stmt->fetchAll());
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null same not-found-vs-not-authorized non-disclosure as ProjectRepository
     */
    public static function findByIdForUser(int $id, array $claims): ?array
    {
        $scope = Scope::forOrders($claims);

        $stmt = Database::connection()->prepare(
            "SELECT o.* FROM orders o
             JOIN projects pr ON pr.id = o.project_id
             WHERE o.id = :id AND {$scope['sql']}"
        );
        $stmt->execute(['id' => $id, ...$scope['params']]);
        $order = $stmt->fetch();

        return $order === false ? null : self::redactForRole($order, $claims);
    }

    /**
     * A supplier-facing read never includes commercial terms
     * (docs/ARCHITECTURE.md §6) — enforced here, once, for every path an
     * order can reach a supplier login through, rather than per-route.
     *
     * @param array<string, mixed> $order
     * @param array<string, mixed> $claims
     * @return array<string, mixed>
     */
    private static function redactForRole(array $order, array $claims): array
    {
        if (($claims['role'] ?? null) === 'supplier') {
            unset($order['contract_value'], $order['currency']);
        }

        return $order;
    }

    /**
     * Raw lookup with no scope filter — for internal use only, once a
     * caller has already established the requester's access some other
     * way (e.g. loading the parent order after an order_stage was already
     * authorized). Never call this directly from a route handler with a
     * client-supplied id.
     *
     * @return array<string, mixed>|null
     */
    public static function findByIdUnscoped(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM orders WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $order = $stmt->fetch();

        return $order === false ? null : $order;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function create(array $data, int $createdBy): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO orders (project_id, order_number, machine_name, machine_spec,
                                  supplier_id, contract_value, currency, start_date,
                                  target_handover_date, project_coordinator_id,
                                  installation_engineer_id, warranty_start_trigger, created_by)
             VALUES (:project_id, :order_number, :machine_name, :machine_spec,
                     :supplier_id, :contract_value, :currency, :start_date,
                     :target_handover_date, :project_coordinator_id,
                     :installation_engineer_id, :warranty_start_trigger, :created_by)'
        );
        $stmt->execute([
            'project_id' => $data['project_id'],
            'order_number' => $data['order_number'],
            'machine_name' => $data['machine_name'],
            'machine_spec' => $data['machine_spec'] ?? null,
            'supplier_id' => $data['supplier_id'],
            'contract_value' => $data['contract_value'] ?? null,
            'currency' => $data['currency'] ?? null,
            'start_date' => $data['start_date'],
            'target_handover_date' => $data['target_handover_date'],
            'project_coordinator_id' => $data['project_coordinator_id'] ?? null,
            'installation_engineer_id' => $data['installation_engineer_id'],
            'warranty_start_trigger' => $data['warranty_start_trigger'] ?? 'handover',
            'created_by' => $createdBy,
        ]);

        $orderId = (int) $db->lastInsertId();

        // Seed the full 12-stage pipeline for this order — every order gets
        // every stage, not_started, so the pipeline view is always complete.
        $db->prepare(
            "INSERT INTO order_stages (order_id, stage_id, status)
             SELECT :order_id, id, 'not_started' FROM stages"
        )->execute(['order_id' => $orderId]);

        return self::findByIdUnscoped($orderId);
    }

    /**
     * Corrects an order's own details (machine name/spec, supplier,
     * engineer, PC override, start date) — never status or
     * target_handover_date, which go through their own audited paths
     * below instead of a plain UPDATE.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function update(int $id, array $data): array
    {
        $fields = ['machine_name', 'machine_spec', 'supplier_id', 'installation_engineer_id',
            'project_coordinator_id', 'start_date'];
        $sets = [];
        $params = ['id' => $id];
        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if ($sets !== []) {
            Database::connection()
                ->prepare('UPDATE orders SET ' . implode(', ', $sets) . ' WHERE id = :id')
                ->execute($params);
        }

        return self::findByIdUnscoped($id);
    }

    /**
     * Order-level lifecycle change (active/on_hold/cancelled/completed) —
     * always logged, never a silent UPDATE. Caller has already verified
     * the requester is a Sales Manager or Company Owner (§ARCHITECTURE.md §2).
     */
    public static function changeStatus(int $orderId, string $newStatus, string $reason, int $changedBy): void
    {
        $db = Database::connection();
        $order = self::findByIdUnscoped($orderId);
        if ($order === null) {
            throw new \RuntimeException('Order not found.');
        }

        $db->beginTransaction();
        try {
            $db->prepare('UPDATE orders SET status = :status WHERE id = :id')
                ->execute(['status' => $newStatus, 'id' => $orderId]);

            $db->prepare(
                'INSERT INTO order_status_changes (order_id, old_status, new_status, reason, changed_by)
                 VALUES (:order_id, :old_status, :new_status, :reason, :changed_by)'
            )->execute([
                'order_id' => $orderId,
                'old_status' => $order['status'],
                'new_status' => $newStatus,
                'reason' => $reason,
                'changed_by' => $changedBy,
            ]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Changing target_handover_date always requires a Sales Manager/Owner
     * approver — it's the whole-order external commitment, never a PC's
     * call alone (§4.1). Caller has already validated $approvedBy's role.
     */
    public static function updateTargetHandoverDate(
        int $orderId,
        string $newDate,
        string $reason,
        int $changedBy,
        int $approvedBy,
    ): array {
        $db = Database::connection();
        $order = self::findByIdUnscoped($orderId);
        if ($order === null) {
            throw new \RuntimeException('Order not found.');
        }

        $db->beginTransaction();
        try {
            $db->prepare('UPDATE orders SET target_handover_date = :date WHERE id = :id')
                ->execute(['date' => $newDate, 'id' => $orderId]);

            $db->prepare(
                'INSERT INTO commitment_changes
                    (order_id, order_stage_id, field_name, old_value, new_value, reason, changed_by, approved_by, customer_informed)
                 VALUES (:order_id, NULL, "target_handover_date", :old_value, :new_value, :reason, :changed_by, :approved_by, 1)'
            )->execute([
                'order_id' => $orderId,
                'old_value' => $order['target_handover_date'],
                'new_value' => $newDate,
                'reason' => $reason,
                'changed_by' => $changedBy,
                'approved_by' => $approvedBy,
            ]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        return self::findByIdUnscoped($orderId);
    }

    public static function userExistsWithRole(int $userId, string $role): bool
    {
        $stmt = Database::connection()->prepare(
            "SELECT 1 FROM users WHERE id = :id AND role = :role AND status = 'active'"
        );
        $stmt->execute(['id' => $userId, 'role' => $role]);

        return $stmt->fetch() !== false;
    }

    public static function supplierExists(int $supplierId): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM suppliers WHERE id = :id');
        $stmt->execute(['id' => $supplierId]);

        return $stmt->fetch() !== false;
    }

    /**
     * The stage each `warranty_start_trigger` value maps to (§5) — the
     * pipeline stage number whose completion starts the warranty clock.
     */
    private const WARRANTY_TRIGGER_STAGE = [
        'shipment' => 6,
        'installation' => 9,
        'sat' => 10,
        'handover' => 12,
    ];

    /**
     * Called after a stage completes (docs/ARCHITECTURE.md §5): if this
     * order's chosen trigger stage is the one that just completed and
     * warranty hasn't already started, stamps `warranty_start_date`.
     * `warranty_end_date` is deliberately left for the PC/Sales Manager to
     * set from the actual contract terms — there's no fixed system-wide
     * warranty length to derive it from.
     */
    public static function maybeStartWarranty(int $orderId, int $completedStageId): void
    {
        $order = self::findByIdUnscoped($orderId);
        if ($order === null || $order['warranty_start_date'] !== null) {
            return;
        }

        $triggerStage = self::WARRANTY_TRIGGER_STAGE[$order['warranty_start_trigger']] ?? null;
        if ($triggerStage !== $completedStageId) {
            return;
        }

        Database::connection()
            ->prepare('UPDATE orders SET warranty_start_date = CURDATE() WHERE id = :id')
            ->execute(['id' => $orderId]);
    }
}
