<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Domain\StageCompletionEvaluator;
use Bli\Http\OrderAccess;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\OrderRepository;
use Bli\Models\OrderStageRepository;
use Bli\Models\ProjectRepository;
use Bli\Models\StageExceptionRepository;

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
    // PC is the normal day-to-day path; Owner and Sales Manager can also
    // enter an order directly (matching who can create the Project itself)
    // rather than being blocked when no PC is available — this only widens
    // who can additionally create the record, not who's accountable for
    // running it day to day.
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager', 'company_owner', 'hr_manager']);

    $body = $request->body;
    $required = ['project_id', 'machine_name', 'supplier_id', 'installation_engineer_id'];
    // Owner and HR Manager may leave dates for the Sales Manager/PC to fill
    // in afterward; a PC creating the order still has to know them.
    if (!in_array($claims['role'], ['company_owner', 'hr_manager'], true)) {
        $required[] = 'start_date';
        $required[] = 'target_handover_date';
    }
    foreach ($required as $field) {
        if (empty($body[$field])) {
            Response::error("Field '{$field}' is required.", 422);
        }
    }

    // Placeholder dates for an Owner-created order missing them — start
    // today, target handover in 90 days (a typical capital-equipment lead
    // time, not a real commitment) — so the record is usable immediately;
    // the Sales Manager/PC corrects these to the real dates afterward via
    // the order's own edit form.
    if (empty($body['start_date'])) {
        $body['start_date'] = date('Y-m-d');
    }
    if (empty($body['target_handover_date'])) {
        $body['target_handover_date'] = date('Y-m-d', strtotime('+90 days'));
    }

    // The PC must actually have access to the project they're adding this
    // machine to — not just any project id they happen to pass.
    $project = ProjectRepository::findByIdForUser((int) $body['project_id'], $claims);
    if ($project === null) {
        Response::error('Project not found.', 404);
    }

    if (empty($body['order_number'])) {
        $body['order_number'] = ProjectRepository::generateOrderNumber((int) $project['sales_manager_id']);
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

// General correction of an order's own details — deliberately separate
// from status (has its own audited transition) and target_handover_date
// (has its own reason+approver-audited endpoint below): those two are
// commitments that need a trail, this is just fixing a typo/reassignment.
//
// PC/Owner can correct anything here. Sales Manager gets a narrower slice
// — reassigning the PC or Engineer, and the start date — never machine
// details or the supplier, which stay a PC/Owner call.
$router->patch('/api/orders/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'company_owner', 'sales_manager', 'hr_manager']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    $body = $request->body;

    if ($claims['role'] === 'sales_manager') {
        $allowedFields = ['project_coordinator_id', 'installation_engineer_id', 'start_date', 'machine_name'];
        $disallowed = array_diff(array_keys($body), $allowedFields);
        if ($disallowed !== []) {
            Response::error('A Sales Manager can only edit the machine name, reassign the PC/Engineer, or change the start date.', 403);
        }
    }

    if (isset($body['supplier_id']) && !OrderRepository::supplierExists((int) $body['supplier_id'])) {
        Response::error('supplier_id does not reference a known supplier.', 422);
    }
    if (isset($body['installation_engineer_id'])
        && !OrderRepository::userExistsWithRole((int) $body['installation_engineer_id'], 'installation_engineer')) {
        Response::error('installation_engineer_id must reference an active user with role installation_engineer.', 422);
    }
    if (!empty($body['project_coordinator_id'])
        && !OrderRepository::userExistsWithRole((int) $body['project_coordinator_id'], 'project_coordinator')) {
        Response::error('project_coordinator_id must reference an active user with role project_coordinator.', 422);
    }

    Response::json(OrderRepository::update($orderId, $body));
});

$router->patch('/api/orders/{id}/status', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['sales_manager', 'company_owner', 'hr_manager']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    $newStatus = (string) ($request->body['status'] ?? '');
    $reason = (string) ($request->body['reason'] ?? '');
    if (!in_array($newStatus, ['active', 'on_hold', 'cancelled', 'completed'], true) || $reason === '') {
        Response::error('status (active|on_hold|cancelled|completed) and reason are required.', 422);
    }

    if ($newStatus === 'completed' && $claims['role'] !== 'company_owner') {
        Response::error('Only the Company Owner can close out (mark completed) an order.', 403);
    }

    OrderRepository::changeStatus($orderId, $newStatus, $reason, (int) $claims['sub']);
    Response::json(OrderRepository::findByIdUnscoped($orderId));
});

$router->patch('/api/orders/{id}/target-handover-date', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager', 'company_owner', 'hr_manager']);

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

// Read-only preview of whether a stage could be marked complete right now,
// and why not — powers the pipeline flowchart's "what's blocking this"
// message without requiring a failed PATCH first. Same evaluator the real
// completion transition uses, just never actually flips the status.
$router->get('/api/orders/{id}/stages/{stageId}/completion-status', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    $stageId = (int) $params['stageId'];
    $stage = OrderAccess::requireVisibleStage($orderId, $stageId, $claims);

    Response::json(StageCompletionEvaluator::canComplete($orderId, (int) $stage['id'], $stageId));
});

$router->patch('/api/orders/{id}/stages/{stageId}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    // Sales Manager and PC can move planned dates (§ business rule); marking
    // a stage's status or editing its notes stays Project-Coordinator-only —
    // the PC is the sole stage-status writer.
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager']);

    $orderId = (int) $params['id'];
    $stageId = (int) $params['stageId'];
    $stage = OrderAccess::requireVisibleStage($orderId, $stageId, $claims);

    $body = $request->body;
    $result = ['ok' => true, 'stage' => $stage];

    if ($claims['role'] === 'sales_manager' && (isset($body['status']) || isset($body['notes']))) {
        Response::error("Only the Project Coordinator can change a stage's status or notes.", 403);
    }

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

$router->post('/api/orders/{id}/stages/{stageId}/exceptions', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    // Only a Sales Manager or Owner approves one — a PC can request via a
    // comment but never self-approve skipping a hard prerequisite (§3.1).
    Authenticator::requireRole($request, ['sales_manager', 'company_owner']);

    $orderId = (int) $params['id'];
    $stageId = (int) $params['stageId'];
    $stage = OrderAccess::requireVisibleStage($orderId, $stageId, $claims);

    $body = $request->body;
    $prerequisiteStageId = isset($body['prerequisite_stage_id']) ? (int) $body['prerequisite_stage_id'] : null;
    $appliesTo = (string) ($body['applies_to'] ?? '');
    $reason = (string) ($body['reason'] ?? '');

    if ($prerequisiteStageId === null || $reason === ''
        || !in_array($appliesTo, ['open_minor_items', 'procedural_delay'], true)) {
        Response::error('prerequisite_stage_id, reason, and applies_to (open_minor_items|procedural_delay) are required.', 422);
    }

    $exception = StageExceptionRepository::create(
        (int) $stage['id'],
        $prerequisiteStageId,
        $appliesTo,
        $reason,
        (int) $claims['sub'],
    );

    Response::json($exception, 201);
});
