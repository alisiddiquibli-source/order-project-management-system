<?php

declare(strict_types=1);

namespace Bli\Models;

use Bli\Config\Database;
use Bli\Notifications\Mailer;

/**
 * Single point of entry for both halves of a notification
 * (docs/ROADMAP.md Phase 3b): the in-app row in `notifications` (source of
 * truth, always written) and the best-effort email alongside it (never
 * blocks the caller — see Bli\Notifications\Mailer). Callers that need
 * same-day dedup (the deadline cron) go through createIfNotAlreadySentToday;
 * callers that don't (one notification per distinct comment) call create()
 * directly.
 */
final class NotificationRepository
{
    public static function create(int $userId, ?int $orderId, string $type, string $message): void
    {
        $db = Database::connection();
        $db->prepare(
            'INSERT INTO notifications (user_id, order_id, type, message) VALUES (:user_id, :order_id, :type, :message)'
        )->execute(['user_id' => $userId, 'order_id' => $orderId, 'type' => $type, 'message' => $message]);

        $stmt = $db->prepare('SELECT name, email FROM users WHERE id = :id');
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch();
        if ($user === false) {
            return;
        }

        Mailer::send($user['email'], $user['name'], self::subjectFor($type), $message);
    }

    public static function createIfNotAlreadySentToday(int $userId, ?int $orderId, string $type, string $message): void
    {
        if ($orderId !== null && self::alreadyNotifiedToday($userId, $orderId, $type)) {
            return;
        }

        self::create($userId, $orderId, $type, $message);
    }

    private static function alreadyNotifiedToday(int $userId, int $orderId, string $type): bool
    {
        $stmt = Database::connection()->prepare(
            'SELECT 1 FROM notifications
             WHERE user_id = :user_id AND order_id = :order_id AND type = :type AND DATE(created_at) = CURDATE()'
        );
        $stmt->execute(['user_id' => $userId, 'order_id' => $orderId, 'type' => $type]);

        return $stmt->fetch() !== false;
    }

    /**
     * Recipients for a new comment (docs/ARCHITECTURE.md §6): the relevant
     * internal custodians always (PC, Sales Manager, every Owner), plus
     * whichever external party the channel is addressed to — a project's
     * customer login(s) for 'customer', the named supplier's login(s) for
     * 'supplier'. The author never gets their own comment back.
     *
     * @param array<string, mixed> $comment a freshly-created row from CommentRepository::create()
     */
    public static function notifyForNewComment(array $comment): void
    {
        $db = Database::connection();
        $authorId = (int) $comment['user_id'];

        $projectId = $comment['project_id'] !== null ? (int) $comment['project_id'] : null;
        $orderId = $comment['order_id'] !== null ? (int) $comment['order_id'] : null;
        $orderSupplierId = null;
        $orderPc = null;

        if ($orderId !== null) {
            $stmt = $db->prepare(
                'SELECT o.project_id, o.project_coordinator_id AS order_pc, o.supplier_id
                 FROM orders o WHERE o.id = :order_id'
            );
            $stmt->execute(['order_id' => $orderId]);
            $order = $stmt->fetch();
            if ($order === false) {
                return;
            }
            $projectId ??= (int) $order['project_id'];
            $orderSupplierId = $order['supplier_id'] !== null ? (int) $order['supplier_id'] : null;
            $orderPc = $order['order_pc'] !== null ? (int) $order['order_pc'] : null;
        }

        if ($projectId === null) {
            return;
        }

        $stmt = $db->prepare(
            'SELECT sales_manager_id, project_coordinator_id AS project_pc FROM projects WHERE id = :project_id'
        );
        $stmt->execute(['project_id' => $projectId]);
        $project = $stmt->fetch();
        if ($project === false) {
            return;
        }

        $recipientIds = [
            $orderPc ?? $project['project_pc'] ?? null,
            $project['sales_manager_id'],
        ];

        $ownersStmt = $db->query("SELECT id FROM users WHERE role = 'company_owner' AND status = 'active'");
        foreach ($ownersStmt->fetchAll() as $owner) {
            $recipientIds[] = $owner['id'];
        }

        $channel = $comment['channel'];
        if ($channel === 'customer') {
            $stmt = $db->prepare(
                "SELECT id FROM users WHERE role = 'customer' AND status = 'active' AND scope_project_id = :project_id"
            );
            $stmt->execute(['project_id' => $projectId]);
            foreach ($stmt->fetchAll() as $customerUser) {
                $recipientIds[] = $customerUser['id'];
            }
        } elseif ($channel === 'supplier') {
            $supplierId = $orderId !== null ? $orderSupplierId
                : ($comment['shared_with_supplier_id'] !== null ? (int) $comment['shared_with_supplier_id'] : null);

            if ($supplierId !== null) {
                $stmt = $db->prepare(
                    "SELECT id FROM users WHERE role = 'supplier' AND status = 'active' AND supplier_id = :supplier_id"
                );
                $stmt->execute(['supplier_id' => $supplierId]);
                foreach ($stmt->fetchAll() as $supplierUser) {
                    $recipientIds[] = $supplierUser['id'];
                }
            }
        }

        $authorStmt = $db->prepare('SELECT name FROM users WHERE id = :id');
        $authorStmt->execute(['id' => $authorId]);
        $authorName = $authorStmt->fetchColumn() ?: 'Someone';

        $excerpt = mb_strlen($comment['message']) > 200 ? mb_substr($comment['message'], 0, 200) . '…' : $comment['message'];
        $message = "{$authorName} commented: {$excerpt}";

        foreach (array_unique(array_filter($recipientIds)) as $userId) {
            if ((int) $userId === $authorId) {
                continue;
            }

            self::create((int) $userId, $orderId, 'new_comment', $message);
        }
    }

    private static function subjectFor(string $type): string
    {
        return match ($type) {
            'stage_at_risk' => 'BLI system: a stage is coming due',
            'stage_overdue' => 'BLI system: a stage is overdue',
            'blocker_escalation' => 'BLI system: a blocker needs attention',
            'new_comment' => 'BLI system: new comment',
            'ticket_opened' => 'BLI system: new service ticket',
            'ticket_response_overdue' => 'BLI system: service ticket response SLA breached',
            'ticket_resolution_overdue' => 'BLI system: service ticket resolution SLA breached',
            'ai_daily_digest' => 'BLI system: your daily AI digest is ready',
            default => 'BLI system notification',
        };
    }
}
