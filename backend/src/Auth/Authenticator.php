<?php

declare(strict_types=1);

namespace Bli\Auth;

use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\UserRepository;

/**
 * Login, token issuance, and the "who is asking" resolution every
 * protected route starts with. Per-project/order authorization (does
 * THIS user have access to THIS order) is a separate, per-resource
 * concern handled where that resource is loaded — this class only
 * answers "is there a valid, active user behind this request."
 */
final class Authenticator
{
    private const ACCESS_TOKEN_TYPE = 'access';
    private const REFRESH_TOKEN_TYPE = 'refresh';

    /**
     * @return array<string, mixed>|null the user row on success, null on bad credentials
     */
    public static function attemptLogin(string $email, string $password): ?array
    {
        $user = UserRepository::findByEmail($email);

        if ($user === null || $user['status'] !== 'active') {
            return null;
        }

        if (!password_verify($password, $user['password_hash'])) {
            return null;
        }

        unset($user['password_hash']);

        return $user;
    }

    /**
     * @param array<string, mixed> $user
     */
    public static function issueAccessToken(array $user): string
    {
        $ttlMinutes = (int) ($_ENV['JWT_ACCESS_TTL_MINUTES'] ?? 30);

        return Jwt::encode([
            'type' => self::ACCESS_TOKEN_TYPE,
            'sub' => (int) $user['id'],
            'role' => $user['role'],
            'scope_project_id' => $user['scope_project_id'] !== null ? (int) $user['scope_project_id'] : null,
            'supplier_id' => $user['supplier_id'] !== null ? (int) $user['supplier_id'] : null,
            'iat' => time(),
            'exp' => time() + ($ttlMinutes * 60),
        ]);
    }

    /**
     * @param array<string, mixed> $user
     */
    public static function issueRefreshToken(array $user): string
    {
        $ttlDays = (int) ($_ENV['JWT_REFRESH_TTL_DAYS'] ?? 14);

        // Deliberately minimal payload — the refresh flow re-fetches the
        // user's CURRENT role/status/scope from the database before
        // minting a new access token, rather than trusting stale claims.
        return Jwt::encode([
            'type' => self::REFRESH_TOKEN_TYPE,
            'sub' => (int) $user['id'],
            'iat' => time(),
            'exp' => time() + ($ttlDays * 86400),
        ]);
    }

    /**
     * Verifies a refresh token and mints a fresh access token from the
     * user's current database state — a role change or deactivation since
     * the refresh token was issued takes effect immediately here, even
     * though it wouldn't be caught mid-life of an already-issued access
     * token (that's bounded by the short access-token TTL instead).
     */
    public static function refreshAccessToken(string $refreshToken): ?string
    {
        $claims = Jwt::decode($refreshToken);
        if ($claims === null || ($claims['type'] ?? null) !== self::REFRESH_TOKEN_TYPE) {
            return null;
        }

        $user = UserRepository::findById((int) $claims['sub']);
        if ($user === null || $user['status'] !== 'active') {
            return null;
        }

        return self::issueAccessToken($user);
    }

    /**
     * Call at the top of any protected route handler. Exits with 401 on
     * failure; otherwise populates $request->auth and returns the claims.
     *
     * @return array<string, mixed>
     */
    public static function requireAuth(Request $request): array
    {
        $token = $request->bearerToken();
        if ($token === null) {
            Response::error('Missing bearer token.', 401);
        }

        $claims = Jwt::decode($token);
        if ($claims === null || ($claims['type'] ?? null) !== self::ACCESS_TOKEN_TYPE) {
            Response::error('Invalid or expired token.', 401);
        }

        $request->auth = $claims;

        return $claims;
    }

    /**
     * Call after requireAuth() when a route is limited to specific roles.
     *
     * @param string[] $allowedRoles
     */
    public static function requireRole(Request $request, array $allowedRoles): void
    {
        if (!in_array($request->auth['role'] ?? null, $allowedRoles, true)) {
            Response::error('Forbidden.', 403);
        }
    }
}
