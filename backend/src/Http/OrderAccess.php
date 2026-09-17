<?php

declare(strict_types=1);

namespace Bli\Http;

use Bli\Models\OrderRepository;
use Bli\Models\OrderStageRepository;

/**
 * Small shared helper for route handlers: load an order/stage the
 * requester is actually authorized to see, or exit 404 — never
 * distinguishing "doesn't exist" from "not yours" (§ security notes).
 */
final class OrderAccess
{
    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>
     */
    public static function requireVisibleOrder(int $orderId, array $claims): array
    {
        $order = OrderRepository::findByIdForUser($orderId, $claims);
        if ($order === null) {
            Response::error('Order not found.', 404);
        }

        return $order;
    }

    /**
     * @param array<string, mixed> $claims
     * @return array<string, mixed>
     */
    public static function requireVisibleStage(int $orderId, int $stageId, array $claims): array
    {
        self::requireVisibleOrder($orderId, $claims);

        $stage = OrderStageRepository::find($orderId, $stageId);
        if ($stage === null) {
            Response::error('Stage not found.', 404);
        }

        return $stage;
    }
}
