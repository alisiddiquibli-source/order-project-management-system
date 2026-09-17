<?php

declare(strict_types=1);

/**
 * Daily cron (docs/ARCHITECTURE.md §4.4-4.5, §11): early-warning + auto-
 * overdue for every non-completed order_stage, and blocker escalation.
 * Bluehost cPanel cron entry, once daily, e.g.:
 *   php /home/USER/backend/cron/check_stage_deadlines.php
 */

require dirname(__DIR__) . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
$dotenv->safeLoad();

$summary = (new \Bli\Domain\DeadlineScanner())->run();

fwrite(STDOUT, sprintf(
    "[%s] at_risk=%d overdue=%d blockers_escalated=%d\n",
    date('c'),
    $summary['at_risk'],
    $summary['overdue'],
    $summary['blockers_escalated'],
));
