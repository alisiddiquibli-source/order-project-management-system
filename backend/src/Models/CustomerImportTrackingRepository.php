<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

/**
 * Stage 7/8 evidence — one row per order_stage (not shared between the
 * two stages, each has its own document chase — docs/ARCHITECTURE.md §8),
 * with an append-only history child table so latest_status changes don't
 * overwrite the trail.
 */
final class CustomerImportTrackingRepository
{
    /**
     * @param array<string, mixed> $data
     */
    public static function create(int $orderStageId, array $data, int $recordedBy): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO customer_import_tracking (order_stage_id, customer_contact_name,
                customer_contact_email, customer_contact_phone, latest_status,
                outstanding_documents, expected_date, next_follow_up_date)
             VALUES (:order_stage_id, :customer_contact_name, :customer_contact_email,
                     :customer_contact_phone, :latest_status, :outstanding_documents,
                     :expected_date, :next_follow_up_date)'
        );
        $stmt->execute([
            'order_stage_id' => $orderStageId,
            'customer_contact_name' => $data['customer_contact_name'] ?? null,
            'customer_contact_email' => $data['customer_contact_email'] ?? null,
            'customer_contact_phone' => $data['customer_contact_phone'] ?? null,
            'latest_status' => $data['latest_status'] ?? null,
            'outstanding_documents' => $data['outstanding_documents'] ?? null,
            'expected_date' => $data['expected_date'] ?? null,
            'next_follow_up_date' => $data['next_follow_up_date'] ?? null,
        ]);
        $id = (int) $db->lastInsertId();

        if (!empty($data['latest_status'])) {
            self::recordUpdate($id, (string) $data['latest_status'], $data['note'] ?? null, $recordedBy);
        }

        return self::find($id);
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function update(int $id, array $data, int $recordedBy): array
    {
        $allowedFields = ['customer_contact_name', 'customer_contact_email', 'customer_contact_phone',
            'outstanding_documents', 'expected_date', 'next_follow_up_date',
            'import_manager_engaged_at', 'import_manager_disengaged_at'];

        $db = Database::connection();
        $updates = [];
        $params = ['id' => $id];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $data)) {
                $updates[] = "{$field} = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        $statusChanged = array_key_exists('latest_status', $data);
        if ($statusChanged) {
            $updates[] = 'latest_status = :latest_status';
            $params['latest_status'] = $data['latest_status'];
        }

        if ($updates !== []) {
            $db->prepare('UPDATE customer_import_tracking SET ' . implode(', ', $updates) . ' WHERE id = :id')
                ->execute($params);
        }

        if ($statusChanged) {
            self::recordUpdate($id, (string) $data['latest_status'], $data['note'] ?? null, $recordedBy);
        }

        return self::find($id);
    }

    private static function recordUpdate(int $trackingId, string $status, ?string $note, int $recordedBy): void
    {
        Database::connection()->prepare(
            'INSERT INTO customer_import_tracking_updates (customer_import_tracking_id, status, note, recorded_by)
             VALUES (:tracking_id, :status, :note, :recorded_by)'
        )->execute([
            'tracking_id' => $trackingId,
            'status' => $status,
            'note' => $note,
            'recorded_by' => $recordedBy,
        ]);
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM customer_import_tracking WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function findForStage(int $orderStageId): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM customer_import_tracking WHERE order_stage_id = :id'
        );
        $stmt->execute(['id' => $orderStageId]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listHistory(int $trackingId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM customer_import_tracking_updates WHERE customer_import_tracking_id = :id ORDER BY id'
        );
        $stmt->execute(['id' => $trackingId]);

        return $stmt->fetchAll();
    }
}
