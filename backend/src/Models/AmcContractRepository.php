<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

/**
 * AMC contracts/visits (docs/ARCHITECTURE.md §5) — managed directly by the
 * Installation & Service Engineer post-handover, no PC hand-off.
 */
final class AmcContractRepository
{
    /**
     * @param array<string, mixed> $data
     */
    public static function create(int $orderId, array $data): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO amc_contracts (order_id, start_date, end_date, frequency, coverage_terms, notes)
             VALUES (:order_id, :start_date, :end_date, :frequency, :coverage_terms, :notes)'
        );
        $stmt->execute([
            'order_id' => $orderId,
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
            'frequency' => $data['frequency'],
            'coverage_terms' => $data['coverage_terms'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function update(int $id, array $data): array
    {
        $allowedFields = ['start_date', 'end_date', 'frequency', 'coverage_terms', 'notes'];
        $updates = [];
        $params = ['id' => $id];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $data)) {
                $updates[] = "{$field} = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if ($updates !== []) {
            Database::connection()
                ->prepare('UPDATE amc_contracts SET ' . implode(', ', $updates) . ' WHERE id = :id')
                ->execute($params);
        }

        return self::find($id);
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM amc_contracts WHERE id = :id');
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
            'SELECT * FROM amc_contracts WHERE order_id = :order_id ORDER BY start_date DESC'
        );
        $stmt->execute(['order_id' => $orderId]);

        return $stmt->fetchAll();
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function createVisit(int $contractId, array $data): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO amc_visits (amc_contract_id, scheduled_date, assigned_engineer_id, notes)
             VALUES (:amc_contract_id, :scheduled_date, :assigned_engineer_id, :notes)'
        );
        $stmt->execute([
            'amc_contract_id' => $contractId,
            'scheduled_date' => $data['scheduled_date'],
            'assigned_engineer_id' => $data['assigned_engineer_id'],
            'notes' => $data['notes'] ?? null,
        ]);

        return self::findVisit((int) $db->lastInsertId());
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function updateVisit(int $id, array $data): array
    {
        $allowedFields = ['scheduled_date', 'actual_date', 'assigned_engineer_id', 'notes'];
        $updates = [];
        $params = ['id' => $id];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $data)) {
                $updates[] = "{$field} = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if ($updates !== []) {
            Database::connection()
                ->prepare('UPDATE amc_visits SET ' . implode(', ', $updates) . ' WHERE id = :id')
                ->execute($params);
        }

        return self::findVisit($id);
    }

    public static function findVisit(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM amc_visits WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function listVisitsForContract(int $contractId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM amc_visits WHERE amc_contract_id = :contract_id ORDER BY scheduled_date'
        );
        $stmt->execute(['contract_id' => $contractId]);

        return $stmt->fetchAll();
    }

    /**
     * Portfolio-wide, for Company Owner visibility (§5): visits not yet
     * carried out, due within the given window (defaults to overdue-or-
     * soon — negative days shows only what's already overdue).
     *
     * @return array<int, array<string, mixed>>
     */
    public static function dueVisits(int $withinDays = 14): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT v.*, c.order_id, o.order_number, o.machine_name
             FROM amc_visits v
             JOIN amc_contracts c ON c.id = v.amc_contract_id
             JOIN orders o ON o.id = c.order_id
             WHERE v.actual_date IS NULL
               AND v.scheduled_date <= DATE_ADD(CURDATE(), INTERVAL :within_days DAY)
             ORDER BY v.scheduled_date'
        );
        $stmt->execute(['within_days' => $withinDays]);

        return $stmt->fetchAll();
    }
}
