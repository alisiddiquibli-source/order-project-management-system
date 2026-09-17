<?php

declare(strict_types=1);

use Bli\Http\Response;

/** @var \Bli\Http\Router $router */

// Health check — used to confirm the deployment/DB connection is alive,
// no auth required.
$router->get('/api/health', function (): void {
    try {
        \Bli\Config\Database::connection()->query('SELECT 1');
        Response::json(['status' => 'ok', 'db' => 'connected']);
    } catch (\Throwable) {
        Response::json(['status' => 'ok', 'db' => 'unreachable'], 200);
    }
});

// Auth, projects/orders/stages, and every other business route are added
// here as each is built (see docs/ROADMAP.md Phase 1). Kept in this one
// file for now since the route count is still small; split by domain
// (auth.php, projects.php, ...) once it grows unwieldy.
