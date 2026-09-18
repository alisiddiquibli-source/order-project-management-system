<?php

declare(strict_types=1);

namespace Bli\Ai;

/**
 * Shared cURL POST-JSON helper for the three provider adapters — one
 * place to get timeouts, error handling, and JSON parsing right instead
 * of three near-identical copies.
 */
final class HttpJsonClient
{
    /**
     * @param array<string, string> $headers
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    public static function postJson(string $url, array $headers, array $body, int $timeoutSeconds = 30): array
    {
        $ch = curl_init($url);
        $headerLines = ['Content-Type: application/json'];
        foreach ($headers as $name => $value) {
            $headerLines[] = "{$name}: {$value}";
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($body, JSON_THROW_ON_ERROR),
            CURLOPT_HTTPHEADER => $headerLines,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
        ]);

        $raw = curl_exec($ch);
        if ($raw === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new AiProviderException("Request to AI provider failed: {$error}");
        }

        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $decoded = json_decode((string) $raw, true);
        if ($status < 200 || $status >= 300) {
            $message = is_array($decoded) ? json_encode($decoded) : $raw;
            throw new AiProviderException("AI provider returned HTTP {$status}: {$message}");
        }

        if (!is_array($decoded)) {
            throw new AiProviderException('AI provider returned an unparseable response.');
        }

        return $decoded;
    }
}
