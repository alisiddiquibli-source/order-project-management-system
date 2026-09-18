<?php

declare(strict_types=1);

/**
 * Daily cron (docs/ARCHITECTURE.md §10): the AI monitoring digest — one
 * status report per active project (notified to its Sales Manager/PC)
 * plus one portfolio-wide advisory (notified to every Company Owner).
 * Bluehost cPanel cron entry, once daily, e.g.:
 *   php /home/USER/backend/cron/check_ai_digest.php
 *
 * Cost note: each run makes one AI provider call per active project plus
 * one portfolio call — a real, recurring per-call cost from whichever
 * provider is configured (AI_DEFAULT_PROVIDER). Confirm that's an
 * acceptable ongoing cost before enabling this cron in production.
 */

require dirname(__DIR__) . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
$dotenv->safeLoad();

$summary = (new \Bli\Domain\AiDigestScanner())->run();

fwrite(STDOUT, sprintf(
    "[%s] project_digests=%d portfolio_digests=%d failures=%d\n",
    date('c'),
    $summary['project_digests'],
    $summary['portfolio_digests'],
    $summary['failures'],
));
