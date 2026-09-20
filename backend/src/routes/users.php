<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\UserRepository;

/** @var \Bli\Http\Router $router */

// ---------------------------------------------------------------------
// Account administration (§7.1) — Company Owner only: create/deactivate
// logins, reset passwords, role assignments. Everyone else can only
// change their own password (below).
// ---------------------------------------------------------------------

$router->get('/api/users', function (Request $request): void {
    Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['company_owner']);

    Response::json(UserRepository::listAll());
});

$router->post('/api/users', function (Request $request): void {
    Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['company_owner']);

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
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        Response::error('Invalid email address.', 422);
    }
    if ($domainError = UserRepository::validateEmailDomain($role, $email)) {
        Response::error($domainError, 422);
    }
    if (UserRepository::emailExists($email)) {
        Response::error('A user with this email already exists.', 422);
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
    Authenticator::requireRole($request, ['company_owner']);

    $id = (int) $params['id'];
    $existing = UserRepository::findById($id);
    if ($existing === null) {
        Response::error('User not found.', 404);
    }

    $body = $request->body;

    if (isset($body['role']) && !in_array($body['role'], UserRepository::VALID_ROLES, true)) {
        Response::error('Invalid role.', 422);
    }
    if (isset($body['email']) && !filter_var($body['email'], FILTER_VALIDATE_EMAIL)) {
        Response::error('Invalid email address.', 422);
    }
    if (isset($body['email']) && $body['email'] !== $existing['email'] && UserRepository::emailExists($body['email'])) {
        Response::error('A user with this email already exists.', 422);
    }

    $finalRole = $body['role'] ?? $existing['role'];
    $finalEmail = $body['email'] ?? $existing['email'];
    if ($domainError = UserRepository::validateEmailDomain($finalRole, $finalEmail)) {
        Response::error($domainError, 422);
    }

    if ($id === (int) $claims['sub'] && ($body['status'] ?? null) === 'inactive') {
        Response::error('You cannot deactivate your own account.', 422);
    }

    Response::json(UserRepository::update($id, $body));
});

$router->post('/api/users/{id}/reset-password', function (Request $request, array $params): void {
    Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['company_owner']);

    $id = (int) $params['id'];
    if (UserRepository::findById($id) === null) {
        Response::error('User not found.', 404);
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
