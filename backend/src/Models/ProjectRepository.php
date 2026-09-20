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

        return array_map(fn (array $project) => self::redactForRole($project, $claims), $stmt->fetchAll());
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

        return $project === false ? null : self::redactForRole($project, $claims);
    }

    /**
     * A supplier-facing read never includes customer identity
     * (docs/ARCHITECTURE.md §6) — enforced here, once, rather than per-route.
     *
     * @param array<string, mixed> $project
     * @param array<string, mixed> $claims
     * @return array<string, mixed>
     */
    private static function redactForRole(array $project, array $claims): array
    {
        if (($claims['role'] ?? null) === 'supplier') {
            unset($project['customer_name'], $project['customer_contact']);
        }

        return $project;
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

    /**
     * Unscoped existence check for the delete route — deletion is Owner-only
     * and the Owner can see every project anyway (Scope::forProjects grants
     * company_owner unrestricted access), so no separate visibility check
     * is needed here beyond "does this id exist at all."
     */
    public static function exists(int $id): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM projects WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return $stmt->fetch() !== false;
    }

    public static function userExistsWithRole(int $userId, string $role): bool
    {
        $stmt = Database::connection()->prepare(
            "SELECT 1 FROM users WHERE id = :id AND role = :role AND status = 'active'"
        );
        $stmt->execute(['id' => $userId, 'role' => $role]);

        return $stmt->fetch() !== false;
    }

    /**
     * A project can only be deleted while it's still just a mistaken
     * entry — no real activity recorded against it yet. Anything beyond
     * that (an order, a document, a comment, a scoped customer login) is
     * real data this system's whole design treats as an audit trail, not
     * something to silently cascade away — so deletion is blocked rather
     * than cascaded, and the Owner reassigns/deactivates first if needed.
     *
     * @return string|null a human-readable reason deletion is blocked, or null if it's clear
     */
    public static function blockingDeleteReason(int $id): ?string
    {
        $db = Database::connection();
        $checks = [
            'orders' => 'an existing order',
            'documents' => 'a document',
            'comments' => 'a comment',
        ];
        foreach ($checks as $table => $label) {
            $stmt = $db->prepare("SELECT 1 FROM {$table} WHERE project_id = :id LIMIT 1");
            $stmt->execute(['id' => $id]);
            if ($stmt->fetch() !== false) {
                return "Cannot delete a project with {$label} attached to it.";
            }
        }

        $stmt = $db->prepare('SELECT 1 FROM users WHERE scope_project_id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        if ($stmt->fetch() !== false) {
            return 'Cannot delete a project with a customer login scoped to it — reassign or deactivate that login first.';
        }

        return null;
    }

    public static function delete(int $id): void
    {
        Database::connection()->prepare('DELETE FROM projects WHERE id = :id')->execute(['id' => $id]);
    }
}
