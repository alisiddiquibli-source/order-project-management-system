<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\OrderAccess;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\CustomerImportTrackingRepository;
use Bli\Models\OrderStageRepository;
use Bli\Models\ShipmentRepository;

/** @var \Bli\Http\Router $router */

// ---------------------------------------------------------------------
// Shipments (stage 6) — Project Coordinator's to record.
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/shipments', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    Response::json(ShipmentRepository::listForOrder($orderId));
});

$router->post('/api/orders/{id}/shipments', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    $shipment = ShipmentRepository::create($orderId, $request->body);
    Response::json($shipment, 201);
});

$router->patch('/api/shipments/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $shipment = ShipmentRepository::find((int) $params['id']);
    if ($shipment === null) {
        Response::error('Shipment not found.', 404);
    }
    OrderAccess::requireVisibleOrder((int) $shipment['order_id'], $claims);

    Response::json(ShipmentRepository::update((int) $shipment['id'], $request->body));
});

// ---------------------------------------------------------------------
// Customer import tracking (stages 7-8) — the customer's own import team
// executes these; the PC records what's reported (§8). Import Manager
// has no edit rights anywhere (§7) — their engagement window is logged
// by the PC, not self-service.
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/stages/{stageId}/import-tracking', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    $stage = OrderAccess::requireVisibleStage($orderId, (int) $params['stageId'], $claims);

    $tracking = CustomerImportTrackingRepository::findForStage((int) $stage['id']);
    if ($tracking === null) {
        Response::json(null);
    }

    Response::json([
        ...$tracking,
        'history' => CustomerImportTrackingRepository::listHistory((int) $tracking['id']),
    ]);
});

$router->post('/api/orders/{id}/stages/{stageId}/import-tracking', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $orderId = (int) $params['id'];
    $stageId = (int) $params['stageId'];
    if (!in_array($stageId, [7, 8], true)) {
        Response::error('Import tracking only applies to stages 7 (import clearance) and 8 (delivery).', 422);
    }
    $stage = OrderAccess::requireVisibleStage($orderId, $stageId, $claims);

    if (CustomerImportTrackingRepository::findForStage((int) $stage['id']) !== null) {
        Response::error('This stage already has an import-tracking record — use PATCH to update it.', 422);
    }

    $tracking = CustomerImportTrackingRepository::create((int) $stage['id'], $request->body, (int) $claims['sub']);
    Response::json($tracking, 201);
});

$router->patch('/api/import-tracking/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $tracking = CustomerImportTrackingRepository::find((int) $params['id']);
    if ($tracking === null) {
        Response::error('Import-tracking record not found.', 404);
    }
    OrderAccess::requireVisibleStageByPk((int) $tracking['order_stage_id'], $claims);

    // Stage 7 completes on latest_status='cleared', stage 8 on 'delivered'
    // (§3.2) — the value itself isn't restricted here (BLI reports
    // whatever the customer's team actually told them), the completion
    // gate lives in StageCompletionEvaluator, not this endpoint.
    Response::json(CustomerImportTrackingRepository::update((int) $tracking['id'], $request->body, (int) $claims['sub']));
});
