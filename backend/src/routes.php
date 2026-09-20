<?php

declare(strict_types=1);

/** @var \Bli\Http\Router $router */

// Split by domain — see docs/ROADMAP.md Phase 1.
require __DIR__ . '/routes/health_and_auth.php';
require __DIR__ . '/routes/users.php';
require __DIR__ . '/routes/projects.php';
require __DIR__ . '/routes/orders.php';
require __DIR__ . '/routes/evidence.php';
require __DIR__ . '/routes/comments.php';
require __DIR__ . '/routes/logistics.php';
require __DIR__ . '/routes/service.php';
require __DIR__ . '/routes/ai.php';
