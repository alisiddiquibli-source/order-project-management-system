<?php

declare(strict_types=1);

namespace Bli\Auth;

/**
 * Builds the SQL WHERE fragment + bound params that scope a query to what
 * the requesting user is allowed to see, per docs/ARCHITECTURE.md §7.
 * The scope filter IS the authorization check — every repository query
 * that lists or loads a project/order runs through here rather than
 * trusting a client-supplied id.
 */
final class Scope
{
    /**
     * @param array<string, mixed> $claims decoded JWT claims (see Authenticator)
     * @return array{sql: string, params: array<string, mixed>}
     */
    public static function forProjects(array $claims): array
    {
        $role = $claims['role'] ?? null;
        $userId = (int) ($claims['sub'] ?? 0);

        return match ($role) {
            'company_owner', 'import_manager' => ['sql' => '1=1', 'params' => []],
            'sales_manager' => [
                'sql' => 'p.sales_manager_id = :scope_user_id',
                'params' => ['scope_user_id' => $userId],
            ],
            'project_coordinator' => [
                // Native (non-emulated) prepares don't allow the same named
                // placeholder twice in one statement — two distinct names,
                // same bound value.
                'sql' => '(p.project_coordinator_id = :scope_user_id_a
                            OR EXISTS (SELECT 1 FROM orders o
                                       WHERE o.project_id = p.id
                                       AND o.project_coordinator_id = :scope_user_id_b))',
                'params' => ['scope_user_id_a' => $userId, 'scope_user_id_b' => $userId],
            ],
            'installation_engineer' => [
                'sql' => 'EXISTS (SELECT 1 FROM orders o
                                   WHERE o.project_id = p.id
                                   AND o.installation_engineer_id = :scope_user_id)',
                'params' => ['scope_user_id' => $userId],
            ],
            'customer' => [
                'sql' => 'p.id = :scope_project_id',
                'params' => ['scope_project_id' => (int) ($claims['scope_project_id'] ?? 0)],
            ],
            'supplier' => [
                'sql' => 'EXISTS (SELECT 1 FROM orders o
                                   WHERE o.project_id = p.id
                                   AND o.supplier_id = :scope_supplier_id)',
                'params' => ['scope_supplier_id' => (int) ($claims['supplier_id'] ?? 0)],
            ],
            default => ['sql' => '1=0', 'params' => []],
        };
    }

    /**
     * @param array<string, mixed> $claims
     * @return array{sql: string, params: array<string, mixed>}
     */
    public static function forOrders(array $claims): array
    {
        $role = $claims['role'] ?? null;
        $userId = (int) ($claims['sub'] ?? 0);

        return match ($role) {
            'company_owner', 'import_manager' => ['sql' => '1=1', 'params' => []],
            'sales_manager' => [
                'sql' => 'pr.sales_manager_id = :scope_user_id',
                'params' => ['scope_user_id' => $userId],
            ],
            'project_coordinator' => [
                'sql' => '(o.project_coordinator_id = :scope_user_id_a
                            OR (o.project_coordinator_id IS NULL AND pr.project_coordinator_id = :scope_user_id_b))',
                'params' => ['scope_user_id_a' => $userId, 'scope_user_id_b' => $userId],
            ],
            'installation_engineer' => [
                'sql' => 'o.installation_engineer_id = :scope_user_id',
                'params' => ['scope_user_id' => $userId],
            ],
            'customer' => [
                'sql' => 'o.project_id = :scope_project_id',
                'params' => ['scope_project_id' => (int) ($claims['scope_project_id'] ?? 0)],
            ],
            'supplier' => [
                'sql' => 'o.supplier_id = :scope_supplier_id',
                'params' => ['scope_supplier_id' => (int) ($claims['supplier_id'] ?? 0)],
            ],
            default => ['sql' => '1=0', 'params' => []],
        };
    }
}
