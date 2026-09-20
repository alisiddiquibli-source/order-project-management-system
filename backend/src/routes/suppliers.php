<?php

declare(strict_types=1);

use Bli\Auth\Authenticator;
use Bli\Http\Request;
use Bli\Http\Response;
use Bli\Models\SupplierRepository;

/** @var \Bli\Http\Router $router */

// ---------------------------------------------------------------------
// Supplier companies — needed to create an order (orders.supplier_id) or
// a supplier login (users.supplier_id). Previously there was no way to
// create one through the app at all, which silently blocked order
// creation on a fresh deployment with no seeded suppliers.
// ---------------------------------------------------------------------

$router->get('/api/suppliers', function (Request $request): void {
    Authenticator::requireAuth($request);
    Response::json(SupplierRepository::listAll());
});

$router->post('/api/suppliers', function (Request $request): void {
    Authenticator::requireAuth($request);
    Authenticator::requireRole($request, ['project_coordinator', 'sales_manager', 'company_owner']);

    $name = trim((string) ($request->body['name'] ?? ''));
    if ($name === '') {
        Response::error("Field 'name' is required.", 422);
    }

    $supplier = SupplierRepository::create([
        'name' => $name,
        'contact_email' => $request->body['contact_email'] ?? null,
        'contact_phone' => $request->body['contact_phone'] ?? null,
    ]);

    Response::json($supplier, 201);
});
