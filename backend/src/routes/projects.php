<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\ProjectRepository;

/** @var \Bli\Http\Router $router */

$router->get('/api/projects', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    Response::json(ProjectRepository::findVisibleToUser($claims));
});

$router->get('/api/projects/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);

    $project = ProjectRepository::findByIdForUser((int) $params['id'], $claims);
    if ($project === null) {
        Response::error('Project not found.', 404);
    }

    Response::json($project);
});

$router->post('/api/projects', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    // Project Coordinator is the sole point of data entry (§7) — a Sales
    // Manager or Owner who wants a project created directs the PC to do it,
    // they don't create it themselves.
    Authenticator::requireRole($request, ['project_coordinator']);

    $body = $request->body;
    $required = ['project_number', 'customer_name', 'title', 'sales_manager_id', 'project_coordinator_id'];
    foreach ($required as $field) {
        if (empty($body[$field])) {
            Response::error("Field '{$field}' is required.", 422);
        }
    }

    if (!ProjectRepository::userExistsWithRole((int) $body['sales_manager_id'], 'sales_manager')) {
        Response::error('sales_manager_id must reference an active user with role sales_manager.', 422);
    }
    if (!ProjectRepository::userExistsWithRole((int) $body['project_coordinator_id'], 'project_coordinator')) {
        Response::error('project_coordinator_id must reference an active user with role project_coordinator.', 422);
    }

    $project = ProjectRepository::create($body, (int) $claims['sub']);
    Response::json($project, 201);
});
