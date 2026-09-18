<?php

declare(strict_types=1);

namespace Bli\Ai;

/**
 * Thrown by a provider adapter on missing config, a network failure, or a
 * non-2xx/unparseable response. Never carries the API key in its message —
 * caught by the route and turned into a generic 502, not surfaced raw.
 */
final class AiProviderException extends \RuntimeException
{
}
