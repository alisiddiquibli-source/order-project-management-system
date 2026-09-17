<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\OrderAccess;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\OrderRepository;
use Bli\Models\OrderStageRepository;
use Bli\Models\ProjectRepository;

/** @var \Bli\Http\Router $router */

$router->get('/api/orders', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    $projectId = isset($request->query['project_id']) ? (int) $request->query['project_id'] : null;

    Response::json(OrderRepository::findVisibleToUser($claims, $projectId));
});

$router->get('/api/orders/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Response::json(OrderAccess::requireVisibleOrder((int) $params['id'], $claims));
});

$router->post('/api/orders', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $body = $request->body;
    $required = ['project_id', 'order_number', 'machine_name', 'supplier_id',
        'start_date', 'target_handover_date', 'installation_engineer_id'];
    foreach ($required as $field) {
        if (empty($body[$field])) {
            Response::error("Field '{$field}' is required.", 422);
        }
    }

    // The PC must actually have access to the project they're adding this
    // machine to — not just any project id they happen to pass.
    $project = ProjectRepository::findByIdForUser((int) $body['project_id'], $claims);
    if ($project === null) {
        Response::error('Project not found.', 404);
    }

    if (!OrderRepository::supplierExists((int) $body['supplier_id'])) {
        Response::error('supplier_id does not reference a known supplier.', 422);
    }
    if (!OrderRepository::userExistsWithRole((int) $body['installation_engineer_id'], 'installation_engineer')) {
        Response::error('installation_engineer_id must reference an active user with role installation_engineer.', 422);
    }
    if (!empty($body['project_coordinator_id'])
        && !OrderRepository::userExistsWithRole((int) $body['project_coordinator_id'], 'project_coordinator')) {
        Response::error('project_coordinator_id must reference an active user with role project_coordinator.', 422);
    }

    $order = OrderRepository::create($body, (int) $claims['sub']);
    Response::json($order, 201);
});

$router->patch('/api/orders/{id}/status', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['sales_manager', 'company_owner']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    $newStatus = (string) ($request->body['status'] ?? '');
    $reason = (string) ($request->body['reason'] ?? '');
    if (!in_array($newStatus, ['active', 'on_hold', 'cancelled', 'completed'], true) || $reason === '') {
        Response::error('status (active|on_hold|cancelled|completed) and reason are required.', 422);
    }

    OrderRepository::changeStatus($orderId, $newStatus, $reason, (int) $claims['sub']);
    Response::json(OrderRepository::findByIdUnscoped($orderId));
});

$router->patch('/api/orders/{id}/target-handover-date', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager', 'company_owner']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    $newDate = (string) ($request->body['target_handover_date'] ?? '');
    $reason = (string) ($request->body['reason'] ?? '');
    $approvedBy = isset($request->body['approved_by']) ? (int) $request->body['approved_by'] : null;

    if ($newDate === '' || $reason === '' || $approvedBy === null) {
        Response::error('target_handover_date, reason, and approved_by are all required.', 422);
    }

    if (!OrderRepository::userExistsWithRole($approvedBy, 'sales_manager')
        && !OrderRepository::userExistsWithRole($approvedBy, 'company_owner')) {
        Response::error('approved_by must reference an active Sales Manager or Company Owner.', 422);
    }

    $order = OrderRepository::updateTargetHandoverDate($orderId, $newDate, $reason, (int) $claims['sub'], $approvedBy);
    Response::json($order);
});

$router->get('/api/orders/{id}/stages', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    Response::json(OrderStageRepository::listForOrder($orderId));
});

$router->patch('/api/orders/{id}/stages/{stageId}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $orderId = (int) $params['id'];
    $stageId = (int) $params['stageId'];
    $stage = OrderAccess::requireVisibleStage($orderId, $stageId, $claims);

    $body = $request->body;
    $result = ['ok' => true, 'stage' => $stage];

    if (isset($body['planned_start']) || isset($body['planned_end'])) {
        $reason = (string) ($body['reason'] ?? '');
        if ($reason === '') {
            Response::error('reason is required when changing planned dates.', 422);
        }

        $approvedBy = isset($body['approved_by']) ? (int) $body['approved_by'] : null;
        if ($approvedBy !== null
            && !OrderRepository::userExistsWithRole($approvedBy, 'sales_manager')
            && !OrderRepository::userExistsWithRole($approvedBy, 'company_owner')) {
            Response::error('approved_by must reference an active Sales Manager or Company Owner.', 422);
        }

        $result = OrderStageRepository::updatePlannedDates(
            $orderId,
            $result['stage'],
            $body['planned_start'] ?? null,
            $body['planned_end'] ?? null,
            $reason,
            (int) $claims['sub'],
            (bool) ($body['customer_informed'] ?? false),
            $approvedBy,
        );

        if (!$result['ok']) {
            Response::error($result['reason'], 422);
        }
    }

    if (isset($body['status'])) {
        $result = OrderStageRepository::updateStatus(
            $orderId,
            $result['stage'],
            (string) $body['status'],
            (int) $claims['sub'],
            $body['notes'] ?? null,
        );

        if (!$result['ok']) {
            Response::error($result['reason'], 422);
        }
    } elseif (isset($body['notes'])) {
        $result = OrderStageRepository::updateNotes($orderId, $result['stage'], (string) $body['notes']);
    }

    if (!isset($body['planned_start']) && !isset($body['planned_end'])
        && !isset($body['status']) && !isset($body['notes'])) {
        Response::error('Nothing to update — provide status, planned_start/planned_end, or notes.', 422);
    }

    Response::json($result['stage']);
});

$router->post('/api/orders/{id}/stages/{stageId}/block', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator']);

    $orderId = (int) $params['id'];
    $stageId = (int) $params['stageId'];
    $stage = OrderAccess::requireVisibleStage($orderId, $stageId, $claims);

    $body = $request->body;
    $required = ['description', 'responsible_party', 'next_action', 'next_review_date'];
    foreach ($required as $field) {
        if (empty($body[$field])) {
            Response::error("Field '{$field}' is required to mark a stage blocked.", 422);
        }
    }

    if (!in_array($body['responsible_party'], ['bli_internal', 'supplier', 'customer', 'third_party'], true)) {
        Response::error('responsible_party must be one of bli_internal|supplier|customer|third_party.', 422);
    }

    $result = OrderStageRepository::block(
        $orderId,
        $stage,
        (string) $body['description'],
        (string) $body['responsible_party'],
        $body['responsible_party_detail'] ?? null,
        (string) $body['next_action'],
        (string) $body['next_review_date'],
        (int) $claims['sub'],
    );

    Response::json($result['stage']);
});
