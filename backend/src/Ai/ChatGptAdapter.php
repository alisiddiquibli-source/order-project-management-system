<?php

declare(strict_types=1);

namespace Bli\Ai;

/** OpenAI Chat Completions API. */
final class ChatGptAdapter implements ProviderAdapter
{
    public function complete(string $systemPrompt, string $userPrompt): string
    {
        $apiKey = $_ENV['CHATGPT_API_KEY'] ?? '';
        if ($apiKey === '') {
            throw new AiProviderException('CHATGPT_API_KEY is not configured.');
        }

        $baseUrl = rtrim($_ENV['CHATGPT_API_BASE_URL'] ?? 'https://api.openai.com', '/');
        $model = $_ENV['CHATGPT_MODEL'] ?? 'gpt-4o';

        $response = HttpJsonClient::postJson("{$baseUrl}/v1/chat/completions", [
            'Authorization' => "Bearer {$apiKey}",
        ], [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userPrompt],
            ],
        ]);

        $text = $response['choices'][0]['message']['content'] ?? null;
        if (!is_string($text)) {
            throw new AiProviderException('ChatGPT response did not contain the expected choices[0].message.content field.');
        }

        return $text;
    }
}
