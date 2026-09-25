<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\DocumentRepository;
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

$router->get('/api/projects/next-number', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager', 'company_owner', 'hr_manager']);

    $salesManagerId = isset($request->query['sales_manager_id']) ? (int) $request->query['sales_manager_id'] : null;
    if ($salesManagerId === null) {
        Response::error('sales_manager_id query parameter is required.', 422);
    }

    Response::json(['project_number' => ProjectRepository::generateProjectNumber($salesManagerId)]);
});

$router->get('/api/orders/next-number', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager', 'company_owner', 'hr_manager']);

    $salesManagerId = isset($request->query['sales_manager_id']) ? (int) $request->query['sales_manager_id'] : null;
    if ($salesManagerId === null) {
        Response::error('sales_manager_id query parameter is required.', 422);
    }

    Response::json(['order_number' => ProjectRepository::generateOrderNumber($salesManagerId)]);
});

$router->post('/api/projects', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    // Data entry — creation is open to whoever originates the deal
    // (Sales Manager), the PC who'll run it day to day, or the Owner.
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager', 'company_owner', 'hr_manager']);

    $body = $request->body;
    $required = ['customer_name', 'title', 'sales_manager_id', 'project_coordinator_id'];
    foreach ($required as $field) {
        if (empty($body[$field])) {
            Response::error("Field '{$field}' is required.", 422);
        }
    }

    if (empty($body['project_number'])) {
        $body['project_number'] = ProjectRepository::generateProjectNumber((int) $body['sales_manager_id']);
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

$router->patch('/api/projects/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['sales_manager', 'project_coordinator', 'company_owner', 'hr_manager']);

    $id = (int) $params['id'];
    $project = ProjectRepository::findByIdForUser($id, $claims);
    if ($project === null) {
        Response::error('Project not found.', 404);
    }

    $body = $request->body;
    if (empty($body['title']) && empty($body['customer_name'])) {
        Response::error('Nothing to update — provide title or customer_name.', 422);
    }

    Response::json(ProjectRepository::update($id, $body));
});

$router->get('/api/documents/file/{filename}', function (Request $request, array $params): void {
    Authenticator::requireAuth($request);

    $filename = basename($params['filename']);
    $absolutePath = DocumentRepository::storageDir() . '/' . $filename;
    if (!is_file($absolutePath)) {
        Response::error('File not found.', 404);
    }

    header('Content-Type: ' . DocumentRepository::mimeType($filename));
    header('Content-Disposition: inline; filename="' . $filename . '"');
    readfile($absolutePath);
    exit;
});

$router->post('/api/projects/{id}/picture', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['company_owner', 'sales_manager', 'project_coordinator']);

    $id = (int) $params['id'];
    $project = ProjectRepository::findByIdForUser($id, $claims);
    if ($project === null) {
        Response::error('Project not found.', 404);
    }

    $uploadError = $request->files['file']['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE) {
        Response::error('The file is too large.', 413);
    }
    if (!isset($request->files['file']) || $uploadError !== UPLOAD_ERR_OK) {
        Response::error('An image file upload is required.', 422);
    }

    $ext = strtolower(pathinfo($request->files['file']['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
        Response::error('Only JPG/PNG images are accepted.', 422);
    }

    $filename = DocumentRepository::storeUploadedFile(
        $request->files['file']['tmp_name'],
        $request->files['file']['name']
    );

    ProjectRepository::setPicture($id, $filename);
    Response::json(ProjectRepository::findByIdForUser($id, $claims));
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
