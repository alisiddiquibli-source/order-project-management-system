<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\OrderAccess;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\AmcContractRepository;
use Bli\Models\NotificationRepository;
use Bli\Models\ServiceTicketRepository;

/** @var \Bli\Http\Router $router */

// ---------------------------------------------------------------------
// AMC contracts & visits (stage: post-handover) — the Installation &
// Service Engineer's to manage directly, no PC hand-off (§5/§7).
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/amc-contracts', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    Response::json(AmcContractRepository::listForOrder($orderId));
});

$router->post('/api/orders/{id}/amc-contracts', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['installation_engineer']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    foreach (['start_date', 'end_date', 'frequency'] as $field) {
        if (empty($request->body[$field])) {
            Response::error("{$field} is required.", 422);
        }
    }

    Response::json(AmcContractRepository::create($orderId, $request->body), 201);
});

$router->patch('/api/amc-contracts/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['installation_engineer']);

    $contract = AmcContractRepository::find((int) $params['id']);
    if ($contract === null) {
        Response::error('AMC contract not found.', 404);
    }
    OrderAccess::requireVisibleOrder((int) $contract['order_id'], $claims);

    Response::json(AmcContractRepository::update((int) $contract['id'], $request->body));
});

$router->get('/api/amc-contracts/{id}/visits', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);

    $contract = AmcContractRepository::find((int) $params['id']);
    if ($contract === null) {
        Response::error('AMC contract not found.', 404);
    }
    OrderAccess::requireVisibleOrder((int) $contract['order_id'], $claims);

    Response::json(AmcContractRepository::listVisitsForContract((int) $contract['id']));
});

$router->post('/api/amc-contracts/{id}/visits', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['installation_engineer']);

    $contract = AmcContractRepository::find((int) $params['id']);
    if ($contract === null) {
        Response::error('AMC contract not found.', 404);
    }
    OrderAccess::requireVisibleOrder((int) $contract['order_id'], $claims);

    if (empty($request->body['scheduled_date'])) {
        Response::error('scheduled_date is required.', 422);
    }
    $engineerId = $request->body['assigned_engineer_id'] ?? $claims['sub'];

    Response::json(AmcContractRepository::createVisit((int) $contract['id'], [
        ...$request->body,
        'assigned_engineer_id' => $engineerId,
    ]), 201);
});

$router->patch('/api/amc-visits/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['installation_engineer']);

    $visit = AmcContractRepository::findVisit((int) $params['id']);
    if ($visit === null) {
        Response::error('AMC visit not found.', 404);
    }
    $contract = AmcContractRepository::find((int) $visit['amc_contract_id']);
    OrderAccess::requireVisibleOrder((int) $contract['order_id'], $claims);

    Response::json(AmcContractRepository::updateVisit((int) $visit['id'], $request->body));
});

// Portfolio-wide, Company Owner only (§5).
$router->get('/api/amc-visits/due', function (Request $request): void {
    Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['company_owner']);

    $withinDays = isset($request->query['within_days']) ? (int) $request->query['within_days'] : 14;
    Response::json(AmcContractRepository::dueVisits($withinDays));
});

// ---------------------------------------------------------------------
// Service tickets (§5) — customers raise them via their project login;
// the Engineer manages the whole lifecycle except closing, which needs
// genuine customer confirmation (or the SLA cron's auto-close).
// ---------------------------------------------------------------------

$router->get('/api/orders/{id}/service-tickets', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    Response::json(ServiceTicketRepository::listForOrder($orderId));
});

$router->post('/api/orders/{id}/service-tickets', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['customer', 'installation_engineer']);

    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    if (empty($request->body['type']) || empty($request->body['description'])) {
        Response::error('type and description are required.', 422);
    }
    $validTypes = ['warranty_claim', 'amc_visit', 'complaint', 'other'];
    if (!in_array($request->body['type'], $validTypes, true)) {
        Response::error('type must be one of: ' . implode(', ', $validTypes), 422);
    }
    if (isset($request->body['severity']) && !in_array($request->body['severity'], ['low', 'medium', 'high', 'critical'], true)) {
        Response::error('severity must be one of: low, medium, high, critical.', 422);
    }

    $ticket = ServiceTicketRepository::create($orderId, $request->body, (int) $claims['sub']);

    if ($ticket['assigned_engineer_id'] !== null) {
        NotificationRepository::create(
            (int) $ticket['assigned_engineer_id'],
            $orderId,
            'ticket_opened',
            "New {$ticket['severity']} service ticket #{$ticket['id']} opened on order #{$orderId}: {$ticket['description']}"
        );
    }

    Response::json($ticket, 201);
});

// Flat route (ticket id, not nested under /orders/{id}) — same pattern as
// /api/fat-sat/{id}/result (see Bli\Http\OrderAccess).
$router->patch('/api/service-tickets/{id}/status', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['installation_engineer']);

    $ticket = ServiceTicketRepository::find((int) $params['id']);
    if ($ticket === null) {
        Response::error('Service ticket not found.', 404);
    }
    OrderAccess::requireVisibleOrder((int) $ticket['order_id'], $claims);

    $newStatus = (string) ($request->body['status'] ?? '');
    if ($newStatus === '') {
        Response::error('status is required.', 422);
    }

    $result = ServiceTicketRepository::advanceStatus(
        $ticket,
        $newStatus,
        (int) $claims['sub'],
        $request->body['resolution_notes'] ?? null
    );

    if (!$result['ok']) {
        Response::error($result['reason'], 422);
    }

    Response::json($result['ticket']);
});

$router->post('/api/service-tickets/{id}/confirm-closure', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['customer']);

    $ticket = ServiceTicketRepository::find((int) $params['id']);
    if ($ticket === null) {
        Response::error('Service ticket not found.', 404);
    }
    OrderAccess::requireVisibleOrder((int) $ticket['order_id'], $claims);

    $result = ServiceTicketRepository::confirmClosure($ticket, (int) $claims['sub']);
    if (!$result['ok']) {
        Response::error($result['reason'], 422);
    }

    Response::json($result['ticket']);
});

// Portfolio-wide view, scoped like every order list (§7) — Company Owner
// sees every open/overdue ticket, an Engineer sees their own, etc.
$router->get('/api/service-tickets', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);

    $status = $request->query['status'] ?? null;
    Response::json(ServiceTicketRepository::findVisibleToUser($claims, $status));
});
