<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../middleware.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
$parts = array_values(array_filter(explode('/', $path), static fn ($p) => $p !== ''));
$service = $parts === [] ? '' : $parts[array_key_last($parts)];

/** @var array<string, array{file:string, roles:list<string>}> $routes */
$routes = [
    'b2b_login' => ['file' => 'helper/b2b_login.php', 'roles' => ['guest']],
    'b2b_dashboard_get' => ['file' => 'b2b_dashboard_get.php', 'roles' => ['super_admin', 'viewer']],
    'b2b_orders_get' => ['file' => 'b2b_orders_get.php', 'roles' => ['super_admin', 'dealer', 'viewer']],
    'b2b_order_create' => ['file' => 'b2b_order_create.php', 'roles' => ['super_admin', 'dealer']],
    'b2b_order_update' => ['file' => 'b2b_order_update.php', 'roles' => ['super_admin']],
    'b2b_order_invoice_create' => ['file' => 'b2b_order_invoice_create.php', 'roles' => ['super_admin']],
    'b2b_invoices_get' => ['file' => 'b2b_invoices_get.php', 'roles' => ['super_admin', 'dealer', 'viewer']],
    'b2b_invoice_set_status' => ['file' => 'b2b_invoice_set_status.php', 'roles' => ['super_admin']],
    'b2b_account_movements_get' => ['file' => 'b2b_account_movements_get.php', 'roles' => ['super_admin', 'dealer', 'viewer']],
    'b2b_payment_post' => ['file' => 'b2b_payment_post.php', 'roles' => ['super_admin']],
    'b2b_payment_update_post' => ['file' => 'b2b_payment_update_post.php', 'roles' => ['super_admin']],
    'b2b_account_adjustment_post' => ['file' => 'b2b_account_adjustment_post.php', 'roles' => ['super_admin']],
    'b2b_dealers_get' => ['file' => 'b2b_dealers_get.php', 'roles' => ['super_admin', 'viewer']],
    'b2b_dealers_save' => ['file' => 'b2b_dealers_save.php', 'roles' => ['super_admin']],
    'b2b_dealer_unit_discounts_get' => ['file' => 'b2b_dealer_unit_discounts_get.php', 'roles' => ['super_admin', 'viewer', 'dealer']],
    'b2b_dealer_unit_discounts_save' => ['file' => 'b2b_dealer_unit_discounts_save.php', 'roles' => ['super_admin']],
    'b2b_products_get' => ['file' => 'b2b_products_get.php', 'roles' => ['super_admin', 'dealer', 'viewer']],
    'b2b_products_add' => ['file' => 'b2b_products_add.php', 'roles' => ['super_admin']],
    'b2b_products_update' => ['file' => 'b2b_products_update.php', 'roles' => ['super_admin']],
    'b2b_units_get' => ['file' => 'b2b_units_get.php', 'roles' => ['super_admin', 'viewer']],
    'b2b_units_add' => ['file' => 'b2b_units_add.php', 'roles' => ['super_admin']],
    'b2b_users_get' => ['file' => 'b2b_users_get.php', 'roles' => ['super_admin', 'viewer']],
    'b2b_users_save' => ['file' => 'b2b_users_save.php', 'roles' => ['super_admin']],
    'b2b_returnable_packaging_types_get' => ['file' => 'b2b_returnable_packaging_types_get.php', 'roles' => ['super_admin', 'dealer', 'viewer']],
    'b2b_returnable_packaging_balances_get' => ['file' => 'b2b_returnable_packaging_balances_get.php', 'roles' => ['super_admin', 'dealer', 'viewer']],
    'b2b_returnable_packaging_movements_get' => ['file' => 'b2b_returnable_packaging_movements_get.php', 'roles' => ['super_admin', 'dealer', 'viewer']],
    'b2b_returnable_packaging_movement_post' => ['file' => 'b2b_returnable_packaging_movement_post.php', 'roles' => ['super_admin']],
    'b2b_reports_overview_get' => ['file' => 'b2b_reports_overview_get.php', 'roles' => ['super_admin', 'viewer']],
];

if (!isset($routes[$service])) {
    json_response(['ok' => false, 'message' => 'Invalid service', 'service' => $service], 404);
}

$route = $routes[$service];
$allowed = $route['roles'];

if ($service !== 'b2b_login') {
    $role = (string) (($GLOBALS['b2b_auth'] ?? [])['role'] ?? '');
    if (!in_array($role, $allowed, true)) {
        json_response(['ok' => false, 'message' => 'Unauthorized access'], 403);
    }
}

$serviceFile = __DIR__ . '/../services/' . $route['file'];
if (!is_file($serviceFile)) {
    json_response(['ok' => false, 'message' => 'Service file missing'], 500);
}

require_once $serviceFile;
