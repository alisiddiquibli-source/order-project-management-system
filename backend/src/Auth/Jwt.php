<?php

declare(strict_types=1);

namespace Bli\Auth;

use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT as FirebaseJwt;
use Firebase\JWT\Key;
use Firebase\JWT\SignatureInvalidException;
use UnexpectedValueException;

/**
 * Thin wrapper around firebase/php-jwt — HS256, one shared secret from .env.
 * Never embeds anything sensitive (no password hashes, no raw scope lists)
 * in the payload; just enough identity to authenticate a request, per
 * docs/ARCHITECTURE.md §7 ("never trust a client-supplied id alone" — the
 * token proves who's asking, authorization against fresh data still
 * happens per request, per resource).
 */
final class Jwt
{
    private static function secret(): string
    {
        $secret = $_ENV['JWT_SECRET'] ?? '';
        if ($secret === '' || $secret === 'change-me-to-a-long-random-string') {
            throw new \RuntimeException('JWT_SECRET is not configured.');
        }

        return $secret;
    }

    /**
     * @param array<string, mixed> $claims
     */
    public static function encode(array $claims): string
    {
        return FirebaseJwt::encode($claims, self::secret(), 'HS256');
    }

    /**
     * @return array<string, mixed>|null null when the token is invalid, expired, or malformed.
     */
    public static function decode(string $token): ?array
    {
        try {
            $decoded = FirebaseJwt::decode($token, new Key(self::secret(), 'HS256'));

            return (array) $decoded;
        } catch (ExpiredException|SignatureInvalidException|UnexpectedValueException) {
            return null;
        }
    }
}
