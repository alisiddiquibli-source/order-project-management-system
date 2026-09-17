<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

/**
 * Stage 6 evidence. Completing stage 6 requires actual_dispatch_date —
 * a carrier/ETD booking alone only supports `in_progress`
 * (docs/ARCHITECTURE.md §3.1/§3.2) — enforced in
 * StageCompletionEvaluator, not here; this repository just stores the data.
 */
final class ShipmentRepository
{
    /**
     * @param array<string, mixed> $data
     */
    public static function create(int $orderId, array $data): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO shipments (order_id, carrier, mode, port_of_loading, port_of_discharge,
                                     bl_awb_number, etd, eta, customs_status, notes)
             VALUES (:order_id, :carrier, :mode, :port_of_loading, :port_of_discharge,
                     :bl_awb_number, :etd, :eta, :customs_status, :notes)'
        );
        $stmt->execute([
            'order_id' => $orderId,
            'carrier' => $data['carrier'] ?? null,
            'mode' => $data['mode'] ?? null,
            'port_of_loading' => $data['port_of_loading'] ?? null,
            'port_of_discharge' => $data['port_of_discharge'] ?? null,
            'bl_awb_number' => $data['bl_awb_number'] ?? null,
            'etd' => $data['etd'] ?? null,
            'eta' => $data['eta'] ?? null,
            'customs_status' => $data['customs_status'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function update(int $id, array $data): array
    {
        $allowedFields = ['carrier', 'mode', 'port_of_loading', 'port_of_discharge', 'bl_awb_number',
            'etd', 'eta', 'actual_dispatch_date', 'customs_status', 'notes'];

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
                ->prepare('UPDATE shipments SET ' . implode(', ', $updates) . ' WHERE id = :id')
                ->execute($params);
        }

        return self::find($id);
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM shipments WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listForOrder(int $orderId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM shipments WHERE order_id = :order_id ORDER BY id DESC'
        );
        $stmt->execute(['order_id' => $orderId]);

        return $stmt->fetchAll();
    }
}
