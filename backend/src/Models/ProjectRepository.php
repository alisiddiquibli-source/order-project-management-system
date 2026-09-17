<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Auth\Scope;
use Bli\Config\Database;
use PDO;

final class ProjectRepository
{
    /**
     * @param array<string, mixed> $claims
     * @return array<int, array<string, mixed>>
     */
    public static function findVisibleToUser(array $claims): array
    {
        $scope = Scope::forProjects($claims);

        $stmt = Database::connection()->prepare(
            "SELECT p.* FROM projects p WHERE {$scope['sql']} ORDER BY p.created_at DESC"
        );
        $stmt->execute($scope['params']);

        return $stmt->fetchAll();
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>|null null when not found OR not visible to this user —
     *         deliberately the same response either way (§ security notes: never
     *         confirm existence of a resource the requester isn't authorized for).
     */
    public static function findByIdForUser(int $id, array $claims): ?array
    {
        $scope = Scope::forProjects($claims);

        $stmt = Database::connection()->prepare(
            "SELECT p.* FROM projects p WHERE p.id = :id AND {$scope['sql']}"
        );
        $stmt->execute(['id' => $id, ...$scope['params']]);
        $project = $stmt->fetch();

        return $project === false ? null : $project;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed> the created project
     */
    public static function create(array $data, int $createdBy): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO projects (project_number, customer_name, customer_contact, title,
                                    sales_manager_id, project_coordinator_id, created_by)
             VALUES (:project_number, :customer_name, :customer_contact, :title,
                     :sales_manager_id, :project_coordinator_id, :created_by)'
        );
        $stmt->execute([
            'project_number' => $data['project_number'],
            'customer_name' => $data['customer_name'],
            'customer_contact' => $data['customer_contact'] ?? null,
            'title' => $data['title'],
            'sales_manager_id' => $data['sales_manager_id'],
            'project_coordinator_id' => $data['project_coordinator_id'],
            'created_by' => $createdBy,
        ]);

        return self::findById((int) $db->lastInsertId());
    }

    /**
     * @return array<string, mixed>
     */
    private static function findById(int $id): array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM projects WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return $stmt->fetch();
    }

    public static function userExistsWithRole(int $userId, string $role): bool
    {
        $stmt = Database::connection()->prepare(
            "SELECT 1 FROM users WHERE id = :id AND role = :role AND status = 'active'"
        );
        $stmt->execute(['id' => $userId, 'role' => $role]);

        return $stmt->fetch() !== false;
    }
}
