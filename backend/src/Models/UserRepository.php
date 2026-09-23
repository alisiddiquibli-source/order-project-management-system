<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;
use PDO;

final class UserRepository
{
    public const VALID_ROLES = [
        'company_owner', 'sales_manager', 'project_coordinator',
        'import_manager', 'installation_engineer', 'hr_manager', 'supplier', 'customer',
    ];

    private const INTERNAL_EMAIL_DOMAIN = '@businesslinks-pk.com';
    private const EMAIL_DOMAIN_EXEMPT_ROLES = ['supplier', 'customer'];

    /**
     * Same rule as the trg_users_email_domain_insert/_update triggers on
     * the users table (docs/ARCHITECTURE.md §7.1) — validated here too so
     * a bad request from the account-admin API gets a clean 422 instead
     * of a raw database error, with the triggers as the real backstop
     * regardless of this code path.
     */
    public static function validateEmailDomain(string $role, string $email): ?string
    {
        if (!in_array($role, self::EMAIL_DOMAIN_EXEMPT_ROLES, true) && !str_ends_with($email, self::INTERNAL_EMAIL_DOMAIN)) {
            return 'Internal-role users must have a ' . self::INTERNAL_EMAIL_DOMAIN . ' email address.';
        }

        return null;
    }

    public static function generateTemporaryPassword(): string
    {
        return bin2hex(random_bytes(6));
    }

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

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function listAll(?string $role = null, ?int $scopeProjectId = null): array
    {
        if ($role !== null) {
            $sql = "SELECT id, name, email, role, status, scope_project_id, supplier_id, created_at
                    FROM users WHERE role = :role AND status = 'active'";
            $params = ['role' => $role];
            if ($scopeProjectId !== null) {
                $sql .= ' AND scope_project_id = :scope_project_id';
                $params['scope_project_id'] = $scopeProjectId;
            }
            $stmt = Database::connection()->prepare($sql . ' ORDER BY name');
            $stmt->execute($params);

            return $stmt->fetchAll();
        }

        $stmt = Database::connection()->query(
            'SELECT id, name, email, role, status, scope_project_id, supplier_id, created_at
             FROM users ORDER BY role, name'
        );

        return $stmt->fetchAll();
    }

    public static function emailExists(string $email): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);

        return $stmt->fetch() !== false;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function create(array $data, string $passwordHash): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO users (name, email, password_hash, role, status, scope_project_id, supplier_id)
             VALUES (:name, :email, :password_hash, :role, :status, :scope_project_id, :supplier_id)'
        );
        $stmt->execute([
            'name' => $data['name'],
            'email' => $data['email'],
            'password_hash' => $passwordHash,
            'role' => $data['role'],
            'status' => $data['status'] ?? 'active',
            'scope_project_id' => $data['scope_project_id'] ?? null,
            'supplier_id' => $data['supplier_id'] ?? null,
        ]);

        return self::findById((int) $db->lastInsertId());
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function update(int $id, array $data): array
    {
        $fields = ['name', 'email', 'role', 'status', 'scope_project_id', 'supplier_id'];
        $sets = [];
        $params = ['id' => $id];
        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if ($sets !== []) {
            $db = Database::connection();
            $db->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        }

        return self::findById($id);
    }

    public static function updatePassword(int $id, string $passwordHash): void
    {
        Database::connection()
            ->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id')
            ->execute(['password_hash' => $passwordHash, 'id' => $id]);
    }

    /**
     * Only for verifying a user's OWN current password (self password
     * change) — never returned to any API response.
     *
     * @return array<string, mixed>|null
     */
    public static function findByIdWithHash(int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, password_hash FROM users WHERE id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch();

        return $user === false ? null : $user;
    }
}
