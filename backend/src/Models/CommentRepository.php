<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;

/**
 * Channel-scoped comments (docs/ARCHITECTURE.md §6) — internal discussion
 * is never exposed to a customer or supplier login by accident. A
 * project-level comment shared with a supplier must name exactly which
 * one, so a multi-supplier project never leaks one supplier's discussion
 * to another.
 */
final class CommentRepository
{
    /**
     * @param array<string, mixed> $data
     */
    public static function create(array $data, int $userId): array
    {
        $db = Database::connection();
        $stmt = $db->prepare(
            'INSERT INTO comments (project_id, order_id, order_stage_id, channel,
                                    shared_with_supplier_id, user_id, message)
             VALUES (:project_id, :order_id, :order_stage_id, :channel,
                     :shared_with_supplier_id, :user_id, :message)'
        );
        $stmt->execute([
            'project_id' => $data['project_id'] ?? null,
            'order_id' => $data['order_id'] ?? null,
            'order_stage_id' => $data['order_stage_id'] ?? null,
            'channel' => $data['channel'],
            'shared_with_supplier_id' => $data['shared_with_supplier_id'] ?? null,
            'user_id' => $userId,
            'message' => $data['message'],
        ]);

        return self::findByIdUnscoped((int) $db->lastInsertId());
    }

    public static function findByIdUnscoped(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM comments WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * Order-scoped list. Caller must have already confirmed order-level
     * access — this only narrows further by channel.
     *
     * @param array<string, mixed> $claims
     * @return array<int, array<string, mixed>>
     */
    public static function findForOrder(int $orderId, array $claims): array
    {
        [$sql, $params] = self::channelFilter($claims);
        $params['order_id'] = $orderId;

        $stmt = Database::connection()->prepare(
            "SELECT c.*, u.name AS user_name FROM comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.order_id = :order_id AND ({$sql}) ORDER BY c.created_at"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<int, array<string, mixed>>
     */
    public static function findForProject(int $projectId, array $claims): array
    {
        [$sql, $params] = self::channelFilter($claims);
        $params['project_id'] = $projectId;

        $stmt = Database::connection()->prepare(
            "SELECT c.*, u.name AS user_name FROM comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.project_id = :project_id AND c.order_id IS NULL AND ({$sql}) ORDER BY c.created_at"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /**
     * Validates the channel a caller is trying to post to against their
     * role, and returns it. Internal roles may address any channel;
     * external roles are locked to their own regardless of what they ask for.
     *
     * @param array<string, mixed> $claims
     */
    public static function resolveChannelForWrite(array $claims, ?string $requestedChannel): string
    {
        $role = $claims['role'] ?? null;

        if ($role === 'customer') {
            return 'customer';
        }
        if ($role === 'supplier') {
            return 'supplier';
        }

        $channel = $requestedChannel ?? 'internal';
        if (!in_array($channel, ['internal', 'customer', 'supplier'], true)) {
            throw new \InvalidArgumentException('channel must be internal|customer|supplier.');
        }

        return $channel;
    }

    /**
     * @param array<string, mixed> $claims
     * @return array{0: string, 1: array<string, mixed>}
     */
    private static function channelFilter(array $claims): array
    {
        $role = $claims['role'] ?? null;

        if (in_array($role, ['company_owner', 'sales_manager', 'project_coordinator',
            'import_manager', 'installation_engineer'], true)) {
            return ['1=1', []];
        }

        if ($role === 'supplier') {
            return [
                "channel = 'supplier'
                 AND (shared_with_supplier_id IS NULL OR shared_with_supplier_id = :supplier_id)",
                ['supplier_id' => (int) ($claims['supplier_id'] ?? 0)],
            ];
        }

        if ($role === 'customer') {
            return ["channel = 'customer'", []];
        }

        return ['1=0', []];
    }
}
