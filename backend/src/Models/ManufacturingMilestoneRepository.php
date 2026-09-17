<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

final class ManufacturingMilestoneRepository
{
    public static function create(int $orderStageId, string $name, int $sequence, ?string $plannedDate): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO manufacturing_milestones (order_stage_id, name, sequence, planned_date)
             VALUES (:order_stage_id, :name, :sequence, :planned_date)'
        );
        $stmt->execute([
            'order_stage_id' => $orderStageId,
            'name' => $name,
            'sequence' => $sequence,
            'planned_date' => $plannedDate,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    public static function markStatus(int $id, string $status): array
    {
        $params = ['status' => $status, 'id' => $id];
        $sql = 'UPDATE manufacturing_milestones SET status = :status';
        if ($status === 'done') {
            $sql .= ', actual_date = COALESCE(actual_date, CURDATE())';
        }
        $sql .= ' WHERE id = :id';

        Database::connection()->prepare($sql)->execute($params);

        return self::find($id);
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM manufacturing_milestones WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listForStage(int $orderStageId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM manufacturing_milestones WHERE order_stage_id = :id ORDER BY sequence'
        );
        $stmt->execute(['id' => $orderStageId]);

        return $stmt->fetchAll();
    }
}
