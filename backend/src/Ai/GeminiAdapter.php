<?php

declare(strict_types=1);

namespace Bli\Ai;

/** Google Gemini `generateContent` API. */
final class GeminiAdapter implements ProviderAdapter
{
    public function complete(string $systemPrompt, string $userPrompt): string
    {
        $apiKey = $_ENV['GEMINI_API_KEY'] ?? '';
        if ($apiKey === '') {
            throw new AiProviderException('GEMINI_API_KEY is not configured.');
        }

        $baseUrl = rtrim($_ENV['GEMINI_API_BASE_URL'] ?? 'https://generativelanguage.googleapis.com', '/');
        $model = $_ENV['GEMINI_MODEL'] ?? 'gemini-3.6-flash';

        $response = HttpJsonClient::postJson(
            "{$baseUrl}/v1beta/models/{$model}:generateContent?key=" . urlencode($apiKey),
            [],
            [
                'system_instruction' => ['parts' => [['text' => $systemPrompt]]],
                'contents' => [['parts' => [['text' => $userPrompt]]]],
            ]
        );

        $text = $response['candidates'][0]['content']['parts'][0]['text'] ?? null;
        if (!is_string($text)) {
            throw new AiProviderException('Gemini response did not contain the expected candidates[0].content.parts[0].text field.');
        }

        return $text;
    }
}
