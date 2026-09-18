<?php

declare(strict_types=1);

use Bli\Ai\AiAdvisorService;
use Bli\Ai\AiProviderException;
use Bli\Auth\Authenticator;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\AiReportRepository;

/** @var \Bli\Http\Router $router */

// ---------------------------------------------------------------------
// AI advisory (docs/ARCHITECTURE.md §10) — on-demand only, never on a
// page load. Every generator returns null for "not found or not
// visible", same 404-not-403 convention as the rest of the API; a
// provider failure (missing key, network, bad response) is a 502, not a
// 500 — it's the upstream AI service's failure, not ours, and nothing
// was written to ai_reports for it.
// ---------------------------------------------------------------------

$router->post('/api/orders/{id}/ai/risk-advisory', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['sales_manager', 'project_coordinator', 'company_owner']);

    try {
        $report = AiAdvisorService::generateOrderRiskAdvisory((int) $params['id'], $claims);
    } catch (AiProviderException $e) {
        Response::error($e->getMessage(), 502);
        return;
    }
    if ($report === null) {
        Response::error('Order not found.', 404);
    }

    Response::json($report, 201);
});

$router->post('/api/projects/{id}/ai/status-report', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['sales_manager', 'company_owner']);

    try {
        $report = AiAdvisorService::generateProjectStatusReport((int) $params['id'], $claims);
    } catch (AiProviderException $e) {
        Response::error($e->getMessage(), 502);
        return;
    }
    if ($report === null) {
        Response::error('Project not found.', 404);
    }

    Response::json($report, 201);
});

$router->post('/api/ai/portfolio-advisory', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['company_owner']);

    try {
        $report = AiAdvisorService::generatePortfolioAdvisory($claims);
    } catch (AiProviderException $e) {
        Response::error($e->getMessage(), 502);
        return;
    }
    if ($report === null) {
        Response::error('Forbidden.', 403);
    }

    Response::json($report, 201);
});

$router->post('/api/orders/{id}/ai/follow-up-draft', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['sales_manager', 'project_coordinator']);

    $channel = (string) ($request->body['channel'] ?? '');
    if (!in_array($channel, ['internal', 'customer', 'supplier'], true)) {
        Response::error('channel must be internal|customer|supplier.', 422);
    }

    try {
        $report = AiAdvisorService::generateFollowUpDraft((int) $params['id'], $channel, $claims);
    } catch (AiProviderException $e) {
        Response::error($e->getMessage(), 502);
        return;
    }
    if ($report === null) {
        Response::error('Order not found.', 404);
    }

    Response::json($report, 201);
});

$router->get('/api/ai-reports', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);

    $status = $request->query['status'] ?? null;
    Response::json(AiReportRepository::findVisibleToUser($claims, $status));
});

$router->patch('/api/ai-reports/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);

    $report = AiReportRepository::findByIdForUser((int) $params['id'], $claims);
    if ($report === null) {
        Response::error('AI report not found.', 404);
    }

    $newStatus = (string) ($request->body['status'] ?? '');
    if ($newStatus === '') {
        Response::error('status is required.', 422);
    }

    $result = AiReportRepository::updateStatus($report, $newStatus, (int) $claims['sub'], $request->body['action_notes'] ?? null);
    if (!$result['ok']) {
        Response::error($result['reason'], 422);
    }

    Response::json($result['report']);
});
