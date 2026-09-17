<?php

declare(strict_types=1);

use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Http\Router;

require dirname(__DIR__) . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
$dotenv->safeLoad();

error_reporting(($_ENV['APP_DEBUG'] ?? 'false') === 'true' ? E_ALL : 0);
ini_set('display_errors', '0'); // never leak stack traces to the client

set_exception_handler(function (Throwable $e): void {
    error_log($e->getMessage() . "\n" . $e->getTraceAsString());
    Response::error('Internal server error', 500);
});

$router = new Router();

require __DIR__ . '/../src/routes.php';

$router->dispatch(new Request());
