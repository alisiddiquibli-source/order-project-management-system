<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\Response;
use Bli\Models\UserRepository;

/** @var \Bli\Http\Router $router */

// Health check — used to confirm the deployment/DB connection is alive,
// no auth required.
$router->get('/api/health', function (): void {
    try {
        \Bli\Config\Database::connection()->query('SELECT 1');
        Response::json(['status' => 'ok', 'db' => 'connected']);
    } catch (\Throwable) {
        Response::json(['status' => 'ok', 'db' => 'unreachable'], 200);
    }
});

$router->post('/api/auth/login', function (\Bli\Http\Request $request): void {
    $email = (string) ($request->body['email'] ?? '');
    $password = (string) ($request->body['password'] ?? '');

    if ($email === '' || $password === '') {
        Response::error('Email and password are required.', 422);
    }

    $user = Authenticator::attemptLogin($email, $password);
    if ($user === null) {
        // Same message for "no such user" and "wrong password" — never
        // confirm whether an email exists in the system to an attacker.
        Response::error('Invalid email or password.', 401);
    }

    Response::json([
        'access_token' => Authenticator::issueAccessToken($user),
        'refresh_token' => Authenticator::issueRefreshToken($user),
        'user' => $user,
    ]);
});

$router->post('/api/auth/refresh', function (\Bli\Http\Request $request): void {
    $refreshToken = (string) ($request->body['refresh_token'] ?? '');
    if ($refreshToken === '') {
        Response::error('refresh_token is required.', 422);
    }

    $accessToken = Authenticator::refreshAccessToken($refreshToken);
    if ($accessToken === null) {
        Response::error('Invalid or expired refresh token.', 401);
    }

    Response::json(['access_token' => $accessToken]);
});

$router->get('/api/auth/me', function (\Bli\Http\Request $request): void {
    $claims = Authenticator::requireAuth($request);

    $user = UserRepository::findById((int) $claims['sub']);
    if ($user === null) {
        Response::error('User no longer exists.', 401);
    }

    Response::json($user);
});

// Projects/orders/stages, and every other business route are added here
// as each is built (see docs/ROADMAP.md Phase 1). Kept in this one file
// for now since the route count is still small; split by domain
// (auth.php, projects.php, ...) once it grows unwieldy.
