<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\ProjectRepository;
use Bli\Models\SupplierRepository;
use Bli\Models\UserRepository;

/** @var \Bli\Http\Router $router */

// ---------------------------------------------------------------------
// Account administration (§7.1) — Company Owner only: create/deactivate
// logins, reset passwords, role assignments. Everyone else can only
// change their own password (below).
// ---------------------------------------------------------------------

$router->get('/api/users', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['company_owner', 'hr_manager', 'sales_manager', 'project_coordinator']);

    // Non-owners/non-HR only get this for populating a role-scoped picker (e.g.
    // "choose a Sales Manager" when creating a project) — never the full
    // admin listing across every role/status.
    $role = $request->query['role'] ?? null;
    $scopeProjectId = isset($request->query['scope_project_id']) ? (int) $request->query['scope_project_id'] : null;

    if (!in_array($claims['role'], ['company_owner', 'hr_manager'], true)) {
        if ($role === null) {
            Response::error('role is required.', 422);
        }
        // A customer lookup is the one case where non-owners need to see a
        // specific individual rather than a role directory (to find "this
        // project's customer login") — scope it to one project they're
        // actually assigned to, never the full customer list across every
        // project.
        if ($role === 'customer'
            && ($scopeProjectId === null || ProjectRepository::findByIdForUser($scopeProjectId, $claims) === null)) {
            Response::error('scope_project_id is required and must reference a project you are assigned to.', 422);
        }
    }
    if ($role !== null && !in_array($role, UserRepository::VALID_ROLES, true)) {
        Response::error('Invalid role.', 422);
    }

    Response::json(UserRepository::listAll($role, $scopeProjectId));
});

$router->post('/api/users', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);
    // Full account administration (any role): Owner and HR Manager. Sales
    // Manager/PC get one narrow exception below: a Customer login for a
    // project they're actually assigned to, since they're the ones who
    // need the customer logged in (e.g. for SAT approval).
    Authenticator::requireRole($request, ['company_owner', 'hr_manager', 'sales_manager', 'project_coordinator']);

    $body = $request->body;
    foreach (['name', 'email', 'role'] as $field) {
        if (empty($body[$field])) {
            Response::error("Field '{$field}' is required.", 422);
        }
    }

    $email = (string) $body['email'];
    $role = (string) $body['role'];

    if (!in_array($role, UserRepository::VALID_ROLES, true)) {
        Response::error('Invalid role.', 422);
    }
    if (!in_array($claims['role'], ['company_owner', 'hr_manager'], true) && $role !== 'customer') {
        Response::error('Sales Manager and Project Coordinator can only create a Customer login.', 403);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        Response::error('Invalid email address.', 422);
    }
    if ($domainError = UserRepository::validateEmailDomain($role, $email)) {
        Response::error($domainError, 422);
    }
    if (UserRepository::emailExists($email)) {
        Response::error('A user with this email already exists.', 422);
    }

    // A supplier/customer login is only useful tied to the company/project
    // it's for — without this a login could be created that can never see
    // anything, since visibility everywhere keys off these two fields.
    if ($role === 'supplier') {
        $supplierId = isset($body['supplier_id']) ? (int) $body['supplier_id'] : null;
        if ($supplierId === null || !SupplierRepository::exists($supplierId)) {
            Response::error('supplier_id must reference an existing supplier for a supplier login.', 422);
        }
    }
    if ($role === 'customer') {
        $projectId = isset($body['scope_project_id']) ? (int) $body['scope_project_id'] : null;
        if ($projectId === null || !ProjectRepository::exists($projectId)) {
            Response::error('scope_project_id must reference an existing project for a customer login.', 422);
        }
        if (!in_array($claims['role'], ['company_owner', 'hr_manager'], true) && ProjectRepository::findByIdForUser($projectId, $claims) === null) {
            Response::error('You can only create a customer login for a project you are assigned to.', 403);
        }
    }

    $temporaryPassword = UserRepository::generateTemporaryPassword();
    $user = UserRepository::create($body, password_hash($temporaryPassword, PASSWORD_BCRYPT));

    // The only time this plaintext password ever exists outside the
    // requester's own memory — never logged, never stored, never
    // returned again after this response.
    Response::json(['user' => $user, 'temporary_password' => $temporaryPassword], 201);
});

$router->patch('/api/users/{id}', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    // Full account editing (role, status, name, email): Owner and HR Manager.
    // Sales Manager gets one narrow exception, same shape as account
    // creation/reset-password above: reassigning a Customer login's
    // project — never anything else, never a non-customer user.
    Authenticator::requireRole($request, ['company_owner', 'hr_manager', 'sales_manager']);

    $id = (int) $params['id'];
    $existing = UserRepository::findById($id);
    if ($existing === null) {
        Response::error('User not found.', 404);
    }

    $body = $request->body;

    if ($claims['role'] === 'hr_manager' && $existing['role'] === 'company_owner') {
        Response::error('HR Manager cannot modify the Company Owner account.', 403);
    }

    if (!in_array($claims['role'], ['company_owner', 'hr_manager'], true)) {
        if ($existing['role'] !== 'customer') {
            Response::error('Sales Manager can only reassign a Customer login\'s project.', 403);
        }
        if (array_diff(array_keys($body), ['scope_project_id']) !== []) {
            Response::error('Sales Manager can only change which project a Customer login is scoped to.', 403);
        }
    }

    if (isset($body['role'])) {
        Response::error('Role cannot be changed after account creation.', 422);
    }
    if (isset($body['email']) && !filter_var($body['email'], FILTER_VALIDATE_EMAIL)) {
        Response::error('Invalid email address.', 422);
    }
    if (isset($body['email']) && $body['email'] !== $existing['email'] && UserRepository::emailExists($body['email'])) {
        Response::error('A user with this email already exists.', 422);
    }

    $finalRole = $existing['role'];
    $finalEmail = $body['email'] ?? $existing['email'];
    if ($domainError = UserRepository::validateEmailDomain($finalRole, $finalEmail)) {
        Response::error($domainError, 422);
    }

    if (isset($body['scope_project_id']) && $finalRole === 'customer') {
        $projectId = (int) $body['scope_project_id'];
        if (!ProjectRepository::exists($projectId)) {
            Response::error('scope_project_id must reference an existing project.', 422);
        }
        if (!in_array($claims['role'], ['company_owner', 'hr_manager'], true) && ProjectRepository::findByIdForUser($projectId, $claims) === null) {
            Response::error('You can only reassign a customer to a project you are assigned to.', 403);
        }
    }

    if ($id === (int) $claims['sub'] && ($body['status'] ?? null) === 'inactive') {
        Response::error('You cannot deactivate your own account.', 422);
    }

    Response::json(UserRepository::update($id, $body));
});

$router->post('/api/users/{id}/reset-password', function (Request $request, array $params): void {
    $claims = Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['company_owner', 'hr_manager', 'sales_manager', 'project_coordinator']);

    $id = (int) $params['id'];
    $target = UserRepository::findById($id);
    if ($target === null) {
        Response::error('User not found.', 404);
    }

    if ($claims['role'] === 'hr_manager' && $target['role'] === 'company_owner') {
        Response::error('HR Manager cannot reset the Company Owner password.', 403);
    }

    if (!in_array($claims['role'], ['company_owner', 'hr_manager'], true)) {
        // Same narrow exception as account creation — only that project's
        // own Customer login, only for someone assigned to it.
        if ($target['role'] !== 'customer'
            || $target['scope_project_id'] === null
            || ProjectRepository::findByIdForUser((int) $target['scope_project_id'], $claims) === null) {
            Response::error('You can only reset the password for a customer login on a project you are assigned to.', 403);
        }
    }

    $temporaryPassword = UserRepository::generateTemporaryPassword();
    UserRepository::updatePassword($id, password_hash($temporaryPassword, PASSWORD_BCRYPT));

    Response::json(['temporary_password' => $temporaryPassword]);
});

// ---------------------------------------------------------------------
// Self password change — any authenticated user, including the initial
// change after receiving a temporary password above.
// ---------------------------------------------------------------------

$router->patch('/api/me/password', function (Request $request): void {
    $claims = Authenticator::requireAuth($request);

    $currentPassword = (string) ($request->body['current_password'] ?? '');
    $newPassword = (string) ($request->body['new_password'] ?? '');

    if ($currentPassword === '' || $newPassword === '') {
        Response::error('Both current_password and new_password are required.', 422);
    }
    if (strlen($newPassword) < 8) {
        Response::error('New password must be at least 8 characters.', 422);
    }

    $userId = (int) $claims['sub'];
    $userWithHash = UserRepository::findByIdWithHash($userId);
    if ($userWithHash === null || !password_verify($currentPassword, $userWithHash['password_hash'])) {
        Response::error('Current password is incorrect.', 401);
    }

    UserRepository::updatePassword($userId, password_hash($newPassword, PASSWORD_BCRYPT));

    Response::json(['status' => 'ok']);
});
