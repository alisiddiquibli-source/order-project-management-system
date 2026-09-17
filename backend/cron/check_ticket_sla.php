<?php

declare(strict_types=1);

/**
 * Hourly cron (docs/ARCHITECTURE.md §5): service-ticket SLA breach
 * detection (business hours, not calendar hours) and the 5-business-day
 * auto-close of a resolved-but-unconfirmed ticket. A daily scan can't
 * catch an hour-level SLA breach in time, hence a separate cron from
 * check_stage_deadlines.php. Bluehost cPanel cron entry, hourly, e.g.:
 *   php /home/USER/backend/cron/check_ticket_sla.php
 */

require dirname(__DIR__) . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
$dotenv->safeLoad();

$summary = (new \Bli\Domain\TicketSlaScanner())->run();

fwrite(STDOUT, sprintf(
    "[%s] response_breaches=%d resolution_breaches=%d auto_closed=%d\n",
    date('c'),
    $summary['response_breaches'],
    $summary['resolution_breaches'],
    $summary['auto_closed'],
));
