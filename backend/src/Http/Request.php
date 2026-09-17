<?php

declare(strict_types=1);

namespace Bli\Http;

final class Request
{
    public readonly string $method;
    public readonly string $path;
    /** @var array<string, mixed> */
    public readonly array $query;
    /** @var array<string, mixed> */
    public readonly array $body;
    /** @var array<string, array<string, mixed>> $_FILES-shaped, one entry per uploaded field */
    public readonly array $files;
    /** @var array<string, string> */
    public readonly array $headers;

    /** @var array<string, mixed> set by the auth middleware once verified */
    public array $auth = [];

    public function __construct()
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $this->path = rtrim((string) parse_url($uri, PHP_URL_PATH), '/') ?: '/';

        $this->query = $_GET;

        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (str_starts_with($contentType, 'multipart/form-data')) {
            // PHP already parses multipart bodies into $_POST/$_FILES —
            // php://input is not reliably readable for these.
            $this->body = $_POST;
            $this->files = $_FILES;
        } else {
            $raw = file_get_contents('php://input') ?: '';
            $decoded = json_decode($raw, true);
            $this->body = is_array($decoded) ? $decoded : [];
            $this->files = [];
        }

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $name = str_replace('_', '-', substr($key, 5));
                $headers[$name] = (string) $value;
            }
        }
        $this->headers = $headers;
    }

    public function bearerToken(): ?string
    {
        $authHeader = $this->headers['AUTHORIZATION'] ?? '';
        if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
            return $matches[1];
        }

        return null;
    }
}
