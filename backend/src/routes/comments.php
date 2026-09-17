<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\OrderAccess;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\CommentRepository;
use Bli\Models\ProjectRepository;

/** @var \Bli\Http\Router $router */

$router->get('/api/orders/{id}/comments', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    Response::json(CommentRepository::findForOrder($orderId, $claims));
});

$router->post('/api/orders/{id}/comments', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $orderId = (int) $params['id'];
    OrderAccess::requireVisibleOrder($orderId, $claims);

    $message = (string) ($request->body['message'] ?? '');
    if ($message === '') {
        Response::error('message is required.', 422);
    }

    try {
        $channel = CommentRepository::resolveChannelForWrite($claims, $request->body['channel'] ?? null);
    } catch (\InvalidArgumentException $e) {
        Response::error($e->getMessage(), 422);
    }

    $comment = CommentRepository::create([
        'order_id' => $orderId,
        'order_stage_id' => isset($request->body['order_stage_id']) ? (int) $request->body['order_stage_id'] : null,
        'channel' => $channel,
        'message' => $message,
        // Order-level supplier comments are already isolated by the order's
        // single supplier_id — shared_with_supplier_id only matters (and is
        // required) at the project level, for a multi-supplier project.
    ], (int) $claims['sub']);

    Response::json($comment, 201);
});

$router->get('/api/projects/{id}/comments', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $projectId = (int) $params['id'];

    if (ProjectRepository::findByIdForUser($projectId, $claims) === null) {
        Response::error('Project not found.', 404);
    }

    Response::json(CommentRepository::findForProject($projectId, $claims));
});

$router->post('/api/projects/{id}/comments', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    $projectId = (int) $params['id'];

    if (ProjectRepository::findByIdForUser($projectId, $claims) === null) {
        Response::error('Project not found.', 404);
    }

    $message = (string) ($request->body['message'] ?? '');
    if ($message === '') {
        Response::error('message is required.', 422);
    }

    try {
        $channel = CommentRepository::resolveChannelForWrite($claims, $request->body['channel'] ?? null);
    } catch (\InvalidArgumentException $e) {
        Response::error($e->getMessage(), 422);
    }

    $sharedWithSupplierId = isset($request->body['shared_with_supplier_id'])
        ? (int) $request->body['shared_with_supplier_id'] : null;

    // §6: a project-level item visible to 'supplier' must name exactly
    // which supplier company — never a blanket share on a multi-supplier
    // project.
    if ($channel === 'supplier' && $sharedWithSupplierId === null) {
        Response::error('shared_with_supplier_id is required for a project-level supplier-channel comment.', 422);
    }

    $comment = CommentRepository::create([
        'project_id' => $projectId,
        'channel' => $channel,
        'shared_with_supplier_id' => $sharedWithSupplierId,
        'message' => $message,
    ], (int) $claims['sub']);

    Response::json($comment, 201);
});
