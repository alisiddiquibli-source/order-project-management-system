<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;
use PDO;

/**
 * Supplier companies (docs/ARCHITECTURE.md — the entity `orders.supplier_id`
 * and `users.supplier_id` (a supplier login) both reference). Simple
 * directory, no visibility scoping: any authenticated internal role can see
 * the list, since it's just company names/contacts, never commercial terms.
 */
final class SupplierRepository
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public static function listAll(): array
    {
        $stmt = Database::connection()->query('SELECT * FROM suppliers ORDER BY name');

        return $stmt->fetchAll();
    }

    public static function exists(int $id): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM suppliers WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return $stmt->fetch() !== false;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function create(array $data): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO suppliers (name, contact_email, contact_phone) VALUES (:name, :contact_email, :contact_phone)'
        );
        $stmt->execute([
            'name' => $data['name'],
            'contact_email' => $data['contact_email'] ?? null,
            'contact_phone' => $data['contact_phone'] ?? null,
        ]);

        $stmt = $db->prepare('SELECT * FROM suppliers WHERE id = :id');
        $stmt->execute(['id' => $db->lastInsertId()]);

        return $stmt->fetch();
    }
}
