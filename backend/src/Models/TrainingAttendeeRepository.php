<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

/**
 * The customer's own staff who need to be reachable after handover —
 * structured, alongside training_records.attendees (kept as a freeform
 * summary of the session itself).
 */
final class TrainingAttendeeRepository
{
    public static function create(
        int $trainingRecordId,
        string $name,
        ?string $department,
        ?string $designation,
        ?string $phone,
        ?string $email,
    ): array {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO training_attendees (training_record_id, name, department, designation, phone, email)
             VALUES (:training_record_id, :name, :department, :designation, :phone, :email)'
        );
        $stmt->execute([
            'training_record_id' => $trainingRecordId,
            'name' => $name,
            'department' => $department,
            'designation' => $designation,
            'phone' => $phone,
            'email' => $email,
        ]);

        return self::find((int) $db->lastInsertId());
    }

    public static function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM training_attendees WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function listForTrainingRecord(int $trainingRecordId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM training_attendees WHERE training_record_id = :id ORDER BY id ASC'
        );
        $stmt->execute(['id' => $trainingRecordId]);

        return $stmt->fetchAll();
    }
}
