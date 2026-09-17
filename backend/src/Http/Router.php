<?php

declare(strict_types=1);

namespace Bli\Http;

final class Router
{
    /** @var array<string, array<string, callable>> method => path-pattern => handler */
    private array $routes = [];

    /** @var callable[] */
    private array $middleware = [];

    public function middleware(callable $middleware): void
    {
        $this->middleware[] = $middleware;
    }

    public function get(string $path, callable $handler): void
    {
        $this->add('GET', $path, $handler);
    }

    public function post(string $path, callable $handler): void
    {
        $this->add('POST', $path, $handler);
    }

    public function patch(string $path, callable $handler): void
    {
        $this->add('PATCH', $path, $handler);
    }

    public function delete(string $path, callable $handler): void
    {
        $this->add('DELETE', $path, $handler);
    }

    private function add(string $method, string $path, callable $handler): void
    {
        $this->routes[$method][$path] = $handler;
    }

    public function dispatch(Request $request): void
    {
        foreach ($this->middleware as $middleware) {
            $middleware($request);
        }

        foreach ($this->routes[$request->method] ?? [] as $pattern => $handler) {
            $params = $this->match($pattern, $request->path);
            if ($params !== null) {
                $handler($request, $params);
                return;
            }
        }

        Response::error('Not found', 404);
    }

    /**
     * Supports simple `{param}` placeholders, e.g. /orders/{id}/stages/{stageId}.
     *
     * @return array<string, string>|null
     */
    private function match(string $pattern, string $path): ?array
    {
        $patternParts = explode('/', trim($pattern, '/'));
        $pathParts = explode('/', trim($path, '/'));

        if (count($patternParts) !== count($pathParts)) {
            return null;
        }

        $params = [];
        foreach ($patternParts as $i => $part) {
            if (str_starts_with($part, '{') && str_ends_with($part, '}')) {
                $params[substr($part, 1, -1)] = $pathParts[$i];
            } elseif ($part !== $pathParts[$i]) {
                return null;
            }
        }

        return $params;
    }
}
