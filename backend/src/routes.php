<?php

declare(strict_types=1);

/** @var \Bli\Http\Router $router */

// Split by domain — see docs/ROADMAP.md Phase 1 for what's still to come
// (evidence endpoints: milestones, FAT/SAT, engineer reports, training,
// acceptances).
require __DIR__ . '/routes/health_and_auth.php';
require __DIR__ . '/routes/projects.php';
require __DIR__ . '/routes/orders.php';
