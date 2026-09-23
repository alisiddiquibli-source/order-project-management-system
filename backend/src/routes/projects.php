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
    // Data entry — creation is open to whoever originates the deal
    // (Sales Manager), the PC who'll run it day to day, or the Owner.
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager', 'company_owner', 'hr_manager']);

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

$router->delete('/api/projects/{id}', function (Request $request, array $params): void {
    Authenticator::requireAuth($request);
    // Owner-only, and deliberately not delegated further — deleting a
    // project (as opposed to marking it 'completed') is rare enough and
    // consequential enough to keep to one role.
    Authenticator::requireRole($request, ['company_owner']);

    $id = (int) $params['id'];
    if (!ProjectRepository::exists($id)) {
        Response::error('Project not found.', 404);
    }

    if ($reason = ProjectRepository::blockingDeleteReason($id)) {
        Response::error($reason, 422);
    }

    ProjectRepository::delete($id);
    Response::json(['status' => 'deleted']);
});
