<?php

declare(strict_types=1);

namespace Bli\Ai;

/**
 * Anthropic Messages API. `CLAUDE_API_BASE_URL` exists only so this can be
 * pointed at a local test double — never overridden in production.
 */
final class ClaudeAdapter implements ProviderAdapter
{
    public function complete(string $systemPrompt, string $userPrompt): string
    {
        $apiKey = $_ENV['CLAUDE_API_KEY'] ?? '';
        if ($apiKey === '') {
            throw new AiProviderException('CLAUDE_API_KEY is not configured.');
        }

        $baseUrl = rtrim($_ENV['CLAUDE_API_BASE_URL'] ?? 'https://api.anthropic.com', '/');
        $model = $_ENV['CLAUDE_MODEL'] ?? 'claude-sonnet-5';

        $response = HttpJsonClient::postJson("{$baseUrl}/v1/messages", [
            'x-api-key' => $apiKey,
            'anthropic-version' => '2023-06-01',
        ], [
            'model' => $model,
            'max_tokens' => 1536,
            'system' => $systemPrompt,
            'messages' => [['role' => 'user', 'content' => $userPrompt]],
        ]);

        $text = $response['content'][0]['text'] ?? null;
        if (!is_string($text)) {
            throw new AiProviderException('Claude response did not contain the expected content[0].text field.');
        }

        return $text;
    }
}
