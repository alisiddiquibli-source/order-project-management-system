<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;
use PDO;

final class UserRepository
{
    /**
     * @return array<string, mixed>|null
     */
    public static function findByEmail(string $email): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, email, password_hash, role, status, scope_project_id, supplier_id
             FROM users WHERE email = :email LIMIT 1'
        );
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        return $user === false ? null : $user;
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function findById(int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, email, role, status, scope_project_id, supplier_id
             FROM users WHERE id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch();

        return $user === false ? null : $user;
    }
}
