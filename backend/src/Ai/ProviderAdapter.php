<?php

declare(strict_types=1);

namespace Bli\Ai;

/**
 * One method every provider adapter implements — AiAdvisorService talks
 * to whichever provider is configured through this, never provider SDK
 * specifics directly (docs/ARCHITECTURE.md §10).
 */
interface ProviderAdapter
{
    /**
     * @throws AiProviderException on missing config, network failure, or
     *   an unparseable response — never returns a partial/guessed result.
     */
    public function complete(string $systemPrompt, string $userPrompt): string;
}
