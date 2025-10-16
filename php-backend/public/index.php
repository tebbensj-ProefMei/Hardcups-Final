<?php

declare(strict_types=1);

$config = require __DIR__ . '/../src/config.php';
require_once __DIR__ . '/../src/database.php';
require_once __DIR__ . '/../src/utils.php';
require_once __DIR__ . '/../src/auth.php';
require_once __DIR__ . '/../src/nfc_bridge.php';
require_once __DIR__ . '/../src/pdf.php';

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        return strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}

cors();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$pdo = db_connect($config);
db_initialize($pdo);
db_seed($pdo);

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';
$base = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/');
if ($base && $base !== '/' && str_starts_with($path, $base)) {
    $path = substr($path, strlen($base));
    if ($path === false || $path === '') {
        $path = '/';
    }
}

if ($path === '/api/auth/login' && $method === 'POST') {
    handle_login($pdo, $config);
    return;
}

if ($path === '/api/auth/customer-reset' && $method === 'POST') {
    handle_customer_reset($pdo, $config);
    return;
}

if ($path === '/api/users' && $method === 'GET') {
    require_auth($config, ['admin'], ['accounts']);
    list_users_route($pdo, $config);
    return;
}

if ($path === '/api/users' && $method === 'POST') {
    require_auth($config, ['admin'], ['accounts']);
    create_user_route($pdo, $config);
    return;
}

if (preg_match('#^/api/users/(\d+)$#', $path, $matches) && $method === 'PUT') {
    require_auth($config, ['admin'], ['accounts']);
    update_user_route($pdo, $config, (int)$matches[1]);
    return;
}

if ($path === '/api/health' && $method === 'GET') {
    respond_json(['status' => 'ok', 'time' => gmdate('c')]);
    return;
}

if ($path === '/api/customers' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['klanten', 'facturen', 'overzicht', 'transacties', 'munten']);
    list_customers_route($pdo);
    return;
}

if (preg_match('#^/api/customers/(\d+)$#', $path, $matches) && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['klanten', 'facturen', 'overzicht', 'transacties', 'munten']);
    get_customer_route($pdo, (int)$matches[1]);
    return;
}

if ($path === '/api/customers' && $method === 'POST') {
    require_auth($config, ['admin', 'medewerker'], ['klanten']);
    create_customer_route($pdo);
    return;
}

if (preg_match('#^/api/customers/(\d+)$#', $path, $matches) && $method === 'PUT') {
    require_auth($config, ['admin', 'medewerker'], ['klanten']);
    update_customer_route($pdo, (int)$matches[1]);
    return;
}

if ($path === '/api/inventory' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['voorraad']);
    inventory_route($pdo);
    return;
}

if ($path === '/api/inventory/add_bulk' && $method === 'POST') {
    require_auth($config, ['admin', 'medewerker'], ['voorraad']);
    inventory_bulk_route($pdo);
    return;
}

if (preg_match('#^/api/inventory/([a-zA-Z0-9_\-]+)$#', $path, $matches) && $method === 'PUT') {
    require_auth($config, ['admin', 'medewerker'], ['voorraad']);
    inventory_update_route($pdo, $matches[1]);
    return;
}

if ($path === '/api/transaction' && $method === 'POST') {
    require_auth($config, ['admin', 'medewerker'], ['transacties']);
    transaction_route($pdo);
    return;
}

if ($path === '/api/coins/intake' && $method === 'POST') {
    require_auth($config, ['admin', 'medewerker'], ['munten']);
    coins_intake_route($pdo);
    return;
}

if ($path === '/api/coins/daily' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['munten']);
    coins_daily_route($pdo);
    return;
}

if ($path === '/api/coins/customers' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['munten']);
    coins_customers_route($pdo);
    return;
}

if ($path === '/api/customers/summary' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['overzicht']);
    customers_summary_route($pdo);
    return;
}

if ($path === '/api/customer/me' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker', 'klant'], ['dashboard', 'klantportaal']);
    customer_me_route($pdo);
    return;
}

if ($path === '/api/dashboard' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['dashboard']);
    dashboard_route($pdo);
    return;
}

if ($path === '/api/export/transactions.csv' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['transacties']);
    export_transactions_route($pdo);
    return;
}

if ($path === '/api/export/inventory.csv' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['voorraad']);
    export_inventory_route($pdo);
    return;
}

if ($path === '/api/nfc/push' && $method === 'POST') {
    $payload = json_input();
    $result = nfc_push($pdo, $config, $payload);
    respond_json($result['body'], $result['status']);
    return;
}

if ($path === '/api/nfc/read' && $method === 'GET') {
    require_auth($config, ['admin', 'medewerker'], ['transacties', 'munten', 'klanten']);
    $result = nfc_read($pdo, $config);
    respond_json($result['body'], $result['status']);
    return;
}

if ($path === '/api/invoices/daily' && $method === 'POST') {
    require_auth($config, ['admin', 'medewerker'], ['facturen']);
    invoices_daily_route($pdo);
    return;
}

if ($path === '/api/invoices/final' && $method === 'POST') {
    require_auth($config, ['admin', 'medewerker'], ['facturen']);
    invoices_final_route($pdo);
    return;
}

respond_error('Niet gevonden', 404);

function handle_login(PDO $pdo, array $config): void
{
    $data = json_input();
    $username = trim($data['username'] ?? '');
    $password = $data['password'] ?? '';
    if ($username === '' || $password === '') {
        respond_error('Gebruikersnaam of wachtwoord ongeldig', 401);
        return;
    }
    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = :username');
    $stmt->execute([':username' => $username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user || !password_verify($password, $user['password_hash'])) {
        respond_error('Ongeldige inloggegevens', 401);
        return;
    }
    $dashboards = resolve_dashboards($user['allowed_dashboards'], $config['allowed_dashboards']);
    $customerPayload = null;
    if ($user['role'] === 'klant') {
        $dashboards = ['klantportaal'];
        if ($user['customer_id']) {
            $custStmt = $pdo->prepare('SELECT id, number, name, email, address FROM customers WHERE id = :id');
            $custStmt->execute([':id' => $user['customer_id']]);
            $customerPayload = $custStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }
    }
    $exp = time() + 8 * 3600;
    $token = jwt_encode([
        'sub' => $user['username'],
        'role' => $user['role'],
        'dashboards' => $dashboards,
        'exp' => $exp,
    ], $config['jwt_secret']);
    $response = ['token' => $token, 'role' => $user['role'], 'dashboards' => $dashboards];
    if ($customerPayload) {
        $response['customer'] = $customerPayload;
    }
    respond_json($response);
}

function handle_customer_reset(PDO $pdo, array $config): void
{
    $data = json_input();
    $username = trim($data['username'] ?? '');
    $customerNumber = normalize_customer_number($data['customerNumber'] ?? ($data['customer_number'] ?? null));
    $email = strtolower(trim($data['email'] ?? ''));
    $newPassword = $data['newPassword'] ?? ($data['new_password'] ?? '');
    if ($username === '' || !$customerNumber || strlen($newPassword) < 6) {
        respond_error('Ongeldige invoer', 400);
        return;
    }
    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = :username');
    $stmt->execute([':username' => $username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user || $user['role'] !== 'klant' || !$user['customer_id']) {
        respond_error('Account niet gevonden', 404);
        return;
    }
    $customerStmt = $pdo->prepare('SELECT * FROM customers WHERE id = :id');
    $customerStmt->execute([':id' => $user['customer_id']]);
    $customer = $customerStmt->fetch(PDO::FETCH_ASSOC);
    if (!$customer || $customer['number'] !== $customerNumber) {
        respond_error('Klantnummer klopt niet', 400);
        return;
    }
    $storedEmail = strtolower(trim($customer['email'] ?? ''));
    if ($storedEmail && $storedEmail !== $email) {
        respond_error('Emailadres komt niet overeen', 400);
        return;
    }
    $update = $pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
    $update->execute([':hash' => password_hash($newPassword, PASSWORD_DEFAULT), ':id' => $user['id']]);
    respond_json(['ok' => true]);
}

function list_users_route(PDO $pdo, array $config): void
{
    $stmt = $pdo->query('SELECT u.*, c.id AS customer_id, c.number AS customer_number, c.name AS customer_name FROM users u LEFT JOIN customers c ON u.customer_id = c.id ORDER BY u.username');
    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $item = [
            'id' => (int)$row['id'],
            'username' => $row['username'],
            'role' => $row['role'],
            'dashboards' => resolve_dashboards($row['allowed_dashboards'], $config['allowed_dashboards']),
        ];
        if ($row['customer_id']) {
            $item['customer'] = [
                'id' => (int)$row['customer_id'],
                'number' => $row['customer_number'],
                'name' => $row['customer_name'],
            ];
        } else {
            $item['customer'] = null;
        }
        $rows[] = $item;
    }
    respond_json($rows);
}

function create_user_route(PDO $pdo, array $config): void
{
    $data = json_input();
    $username = trim($data['username'] ?? '');
    $password = $data['password'] ?? '';
    $role = $data['role'] ?? 'medewerker';
    $dashboards = resolve_dashboards($data['dashboards'] ?? [], $config['allowed_dashboards']);
    $customerNumber = normalize_customer_number($data['customerNumber'] ?? ($data['customer_number'] ?? null));
    if ($username === '' || strlen($password) < 6) {
        respond_error('Gebruikersnaam en wachtwoord verplicht', 400);
        return;
    }
    if (!in_array($role, ['admin', 'medewerker', 'klant'], true)) {
        respond_error('Ongeldige rol', 400);
        return;
    }
    $exists = $pdo->prepare('SELECT COUNT(*) FROM users WHERE username = :username');
    $exists->execute([':username' => $username]);
    if ($exists->fetchColumn() > 0) {
        respond_error('Gebruikersnaam bestaat al', 400);
        return;
    }
    $customerId = null;
    if ($role === 'klant') {
        if (!$customerNumber) {
            respond_error('Klantnummer verplicht voor klantaccounts', 400);
            return;
        }
        $cust = $pdo->prepare('SELECT id FROM customers WHERE number = :number');
        $cust->execute([':number' => $customerNumber]);
        $row = $cust->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            respond_error('Klantnummer niet gevonden', 404);
            return;
        }
        $customerId = (int)$row['id'];
        $dashboards = ['klantportaal'];
    }
    $storeDashboards = dashboards_to_store($dashboards, $config['allowed_dashboards']);
    $insert = $pdo->prepare('INSERT INTO users (username, password_hash, role, customer_id, allowed_dashboards) VALUES (:username, :hash, :role, :customer_id, :dashboards)');
    $insert->execute([
        ':username' => $username,
        ':hash' => password_hash($password, PASSWORD_DEFAULT),
        ':role' => $role,
        ':customer_id' => $customerId,
        ':dashboards' => $storeDashboards,
    ]);
    respond_json(['id' => (int)$pdo->lastInsertId()], 201);
}

function update_user_route(PDO $pdo, array $config, int $userId): void
{
    $data = json_input();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id');
    $stmt->execute([':id' => $userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        respond_error('Gebruiker niet gevonden', 404);
        return;
    }
    $role = $data['role'] ?? $user['role'];
    if (!in_array($role, ['admin', 'medewerker', 'klant'], true)) {
        respond_error('Ongeldige rol', 400);
        return;
    }
    $customerId = $user['customer_id'];
    $dashboards = $user['allowed_dashboards'];
    if ($role === 'klant') {
        $number = normalize_customer_number($data['customerNumber'] ?? ($data['customer_number'] ?? null));
        if ($number) {
            $cust = $pdo->prepare('SELECT id FROM customers WHERE number = :number');
            $cust->execute([':number' => $number]);
            $row = $cust->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                respond_error('Klantnummer niet gevonden', 404);
                return;
            }
            $customerId = (int)$row['id'];
        }
        if (!$customerId) {
            respond_error('Klantaccount vereist klantnummer', 400);
            return;
        }
        $dashboards = dashboards_to_store(['klantportaal'], $config['allowed_dashboards']);
    } else {
        if ($user['customer_id']) {
            $customerId = null;
        }
        if (array_key_exists('dashboards', $data)) {
            $dashboards = dashboards_to_store(resolve_dashboards($data['dashboards'], $config['allowed_dashboards']), $config['allowed_dashboards']);
        } elseif (isset($data['role'])) {
            $dashboards = dashboards_to_store(['dashboard'], $config['allowed_dashboards']);
        }
    }
    $fields = ['role' => $role, 'customer_id' => $customerId, 'allowed_dashboards' => $dashboards];
    if (!empty($data['password'])) {
        if (strlen($data['password']) < 6) {
            respond_error('Wachtwoord minimaal 6 tekens', 400);
            return;
        }
        $fields['password_hash'] = password_hash($data['password'], PASSWORD_DEFAULT);
    }
    $sets = [];
    $params = [':id' => $userId];
    foreach ($fields as $key => $value) {
        $sets[] = "$key = :$key";
        $params[":$key"] = $value;
    }
    $sql = 'UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = :id';
    $update = $pdo->prepare($sql);
    $update->execute($params);
    respond_json(['ok' => true]);
}

function list_customers_route(PDO $pdo): void
{
    $stmt = $pdo->query('SELECT * FROM customers ORDER BY number');
    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rows[] = [
            'id' => (int)$row['id'],
            'number' => $row['number'],
            'name' => $row['name'],
            'email' => $row['email'],
            'address' => $row['address'],
            'nfc_code' => $row['nfc_code'],
        ];
    }
    respond_json($rows);
}

function get_customer_route(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $customer = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$customer) {
        respond_error('Klant niet gevonden', 404);
        return;
    }
    [$totals, $coins] = aggregate_customer_totals($pdo, $id);
    respond_json([
        'id' => (int)$customer['id'],
        'number' => $customer['number'],
        'name' => $customer['name'],
        'email' => $customer['email'],
        'address' => $customer['address'],
        'nfc_code' => $customer['nfc_code'],
        'totals' => $totals,
        'coins' => $coins,
    ]);
}

function create_customer_route(PDO $pdo): void
{
    $data = json_input();
    $number = normalize_customer_number($data['number'] ?? null);
    $name = trim($data['name'] ?? '');
    if (!$number || $name === '') {
        respond_error('Nummer en naam verplicht', 400);
        return;
    }
    $exists = $pdo->prepare('SELECT COUNT(*) FROM customers WHERE number = :number');
    $exists->execute([':number' => $number]);
    if ($exists->fetchColumn() > 0) {
        respond_error('Klantnummer bestaat al', 400);
        return;
    }
    $insert = $pdo->prepare('INSERT INTO customers (number, name, email, address, nfc_code) VALUES (:number, :name, :email, :address, :nfc)');
    $insert->execute([
        ':number' => $number,
        ':name' => $name,
        ':email' => $data['email'] ?? null,
        ':address' => $data['address'] ?? null,
        ':nfc' => $data['nfc_code'] ?? null,
    ]);
    respond_json(['id' => (int)$pdo->lastInsertId()], 201);
}

function update_customer_route(PDO $pdo, int $id): void
{
    $data = json_input();
    $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $customer = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$customer) {
        respond_error('Klant niet gevonden', 404);
        return;
    }
    $fields = [];
    $params = [':id' => $id];
    if (isset($data['number'])) {
        $number = normalize_customer_number((string)$data['number']);
        if (!$number) {
            respond_error('Ongeldig klantnummer', 400);
            return;
        }
        $check = $pdo->prepare('SELECT COUNT(*) FROM customers WHERE number = :number AND id != :id');
        $check->execute([':number' => $number, ':id' => $id]);
        if ($check->fetchColumn() > 0) {
            respond_error('Klantnummer al in gebruik', 400);
            return;
        }
        $fields[] = 'number = :number';
        $params[':number'] = $number;
    }
    foreach (['name', 'email', 'address', 'nfc_code'] as $field) {
        if (array_key_exists($field, $data)) {
            $fields[] = "$field = :$field";
            $params[":$field"] = $data[$field];
        }
    }
    if (!$fields) {
        respond_json(['ok' => true]);
        return;
    }
    $sql = 'UPDATE customers SET ' . implode(', ', $fields) . ' WHERE id = :id';
    $update = $pdo->prepare($sql);
    $update->execute($params);
    respond_json(['ok' => true]);
}

function inventory_route(PDO $pdo): void
{
    $stmt = $pdo->query('SELECT * FROM inventory ORDER BY product_key');
    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rows[] = [
            'id' => (int)$row['id'],
            'product_key' => $row['product_key'],
            'product_name' => $row['product_name'],
            'units' => (int)$row['units'],
        ];
    }
    respond_json($rows);
}

function inventory_bulk_route(PDO $pdo): void
{
    $data = json_input();
    $product = $data['product'] ?? null;
    $amount = (int)($data['amount'] ?? 0);
    if (!$product || $amount <= 0) {
        respond_error('Ongeldige invoer', 400);
        return;
    }
    $stmt = $pdo->prepare('UPDATE inventory SET units = units + :amount WHERE product_key = :product');
    $stmt->execute([':amount' => $amount, ':product' => $product]);
    respond_json(['ok' => true]);
}

function inventory_update_route(PDO $pdo, string $productKey): void
{
    $data = json_input();
    if (!isset($data['units'])) {
        respond_error('Aantal ontbreekt', 400);
        return;
    }
    $units = (int)$data['units'];
    $stmt = $pdo->prepare('UPDATE inventory SET units = :units WHERE product_key = :product');
    $stmt->execute([':units' => $units, ':product' => $productKey]);
    respond_json(['ok' => true]);
}

function transaction_route(PDO $pdo): void
{
    $data = json_input();
    $identifier = $data['identifier'] ?? null;
    $product = $data['product'] ?? null;
    $amount = (int)($data['amount'] ?? 0);
    $txType = $data['type'] ?? null;
    if (!$identifier || !$product || $amount <= 0 || !in_array($txType, ['issue', 'return'], true)) {
        respond_error('Ongeldige invoer', 400);
        return;
    }
    $customer = get_customer_by_identifier($pdo, $identifier);
    if (!$customer) {
        respond_error('Klant niet gevonden', 404);
        return;
    }
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO transactions (customer_id, product_key, amount, tx_type) VALUES (:customer_id, :product, :amount, :type)');
        $stmt->execute([
            ':customer_id' => $customer['id'],
            ':product' => $product,
            ':amount' => $amount,
            ':type' => $txType,
        ]);
        $inventoryUpdate = $txType === 'return'
            ? 'UPDATE inventory SET units = units + :amount WHERE product_key = :product'
            : 'UPDATE inventory SET units = units - :amount WHERE product_key = :product';
        $update = $pdo->prepare($inventoryUpdate);
        $update->execute([':amount' => $amount, ':product' => $product]);
        $pdo->commit();
        respond_json(['ok' => true]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        respond_error('Transactie mislukt', 500);
    }
}

function coins_intake_route(PDO $pdo): void
{
    $data = json_input();
    $identifier = $data['identifier'] ?? null;
    $amount = (int)($data['amount'] ?? 0);
    if (!$identifier || $amount <= 0) {
        respond_error('Ongeldige invoer', 400);
        return;
    }
    $customer = get_customer_by_identifier($pdo, $identifier);
    if (!$customer) {
        respond_error('Klant niet gevonden', 404);
        return;
    }
    $stmt = $pdo->prepare('INSERT INTO coin_transactions (customer_id, amount, recorded_by) VALUES (:customer_id, :amount, :recorded_by)');
    $stmt->execute([
        ':customer_id' => $customer['id'],
        ':amount' => $amount,
        ':recorded_by' => current_user()['sub'] ?? null,
    ]);
    respond_json(['ok' => true, 'coin_id' => (int)$pdo->lastInsertId()]);
}

function coins_daily_route(PDO $pdo): void
{
    $start = parse_date($_GET['start'] ?? null);
    $end = parse_date($_GET['end'] ?? null);
    if (!$start) {
        $start = new DateTimeImmutable('-6 days');
    }
    if (!$end) {
        $end = new DateTimeImmutable('today');
    }
    if ($end < $start) {
        respond_error('Einddatum voor startdatum', 400);
        return;
    }
    $stmt = $pdo->prepare('SELECT DATE(created_at) AS day, SUM(amount) AS total FROM coin_transactions WHERE created_at BETWEEN :start AND :end GROUP BY day ORDER BY day');
    $stmt->execute([
        ':start' => $start->format('Y-m-d 00:00:00'),
        ':end' => $end->format('Y-m-d 23:59:59'),
    ]);
    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rows[] = ['date' => $row['day'], 'amount' => (int)$row['total']];
    }
    respond_json($rows);
}

function coins_customers_route(PDO $pdo): void
{
    $stmt = $pdo->query('SELECT c.id, c.name, c.number, COALESCE(SUM(ct.amount), 0) AS total FROM customers c LEFT JOIN coin_transactions ct ON ct.customer_id = c.id GROUP BY c.id, c.name, c.number ORDER BY c.number');
    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rows[] = [
            'customer_id' => (int)$row['id'],
            'name' => $row['name'],
            'number' => $row['number'],
            'total' => (int)$row['total'],
        ];
    }
    respond_json($rows);
}

function customers_summary_route(PDO $pdo): void
{
    $customers = $pdo->query('SELECT * FROM customers ORDER BY number')->fetchAll(PDO::FETCH_ASSOC);
    $txStmt = $pdo->query('SELECT customer_id, product_key, tx_type, SUM(amount) AS total FROM transactions GROUP BY customer_id, product_key, tx_type');
    $totals = [];
    while ($row = $txStmt->fetch(PDO::FETCH_ASSOC)) {
        $cid = (int)$row['customer_id'];
        if (!isset($totals[$cid])) {
            $totals[$cid] = ['issue' => [], 'return' => []];
        }
        $totals[$cid][$row['tx_type']][$row['product_key']] = (int)$row['total'];
    }
    $coinsStmt = $pdo->query('SELECT customer_id, SUM(amount) AS total FROM coin_transactions GROUP BY customer_id');
    $coins = [];
    while ($row = $coinsStmt->fetch(PDO::FETCH_ASSOC)) {
        $coins[(int)$row['customer_id']] = (int)$row['total'];
    }
    $results = [];
    foreach ($customers as $customer) {
        $cid = (int)$customer['id'];
        $customerTotals = $totals[$cid] ?? ['issue' => [], 'return' => []];
        $customerTotals += ['issue' => [], 'return' => []];
        $result = [
            'customer_id' => $cid,
            'number' => $customer['number'],
            'name' => $customer['name'],
            'email' => $customer['email'],
            'address' => $customer['address'],
            'nfc_code' => $customer['nfc_code'],
            'totals' => $customerTotals,
            'coins' => $coins[$cid] ?? 0,
        ];
        $results[] = $result;
    }
    respond_json($results);
}

function customer_me_route(PDO $pdo): void
{
    $user = current_user();
    if (!$user) {
        respond_error('Unauthorized', 401);
        return;
    }
    if ($user['role'] !== 'klant') {
        respond_json(['role' => $user['role']]);
        return;
    }
    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = :username');
    $stmt->execute([':username' => $user['sub']]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$account || !$account['customer_id']) {
        respond_error('Account niet gekoppeld', 404);
        return;
    }
    $cust = $pdo->prepare('SELECT * FROM customers WHERE id = :id');
    $cust->execute([':id' => $account['customer_id']]);
    $customer = $cust->fetch(PDO::FETCH_ASSOC);
    if (!$customer) {
        respond_error('Klant niet gevonden', 404);
        return;
    }
    [$totals, $coins] = aggregate_customer_totals($pdo, (int)$customer['id']);
    respond_json([
        'customer' => [
            'id' => (int)$customer['id'],
            'number' => $customer['number'],
            'name' => $customer['name'],
            'email' => $customer['email'],
            'address' => $customer['address'],
            'nfc_code' => $customer['nfc_code'],
        ],
        'totals' => $totals,
        'coins' => $coins,
    ]);
}

function dashboard_route(PDO $pdo): void
{
    $inventory = $pdo->query('SELECT SUM(units) AS total_units FROM inventory')->fetch(PDO::FETCH_ASSOC);
    $customers = $pdo->query('SELECT COUNT(*) AS total FROM customers')->fetch(PDO::FETCH_ASSOC);
    $weekAgo = (new DateTimeImmutable('-7 days'))->format('Y-m-d H:i:s');
    $stmt = $pdo->prepare('SELECT tx_type, SUM(amount) AS total FROM transactions WHERE created_at >= :week GROUP BY tx_type');
    $stmt->execute([':week' => $weekAgo]);
    $issue = 0;
    $return = 0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if ($row['tx_type'] === 'issue') {
            $issue = (int)$row['total'];
        } elseif ($row['tx_type'] === 'return') {
            $return = (int)$row['total'];
        }
    }
    respond_json([
        'inventory' => (int)($inventory['total_units'] ?? 0),
        'customers' => (int)($customers['total'] ?? 0),
        'issued_last_week' => $issue,
        'returned_last_week' => $return,
    ]);
}

function export_transactions_route(PDO $pdo): void
{
    stream_csv('transacties.csv', function ($output) use ($pdo) {
        fputcsv($output, ['ID', 'Klant', 'Product', 'Aantal', 'Type', 'Datum']);
        $stmt = $pdo->query('SELECT t.id, c.name, t.product_key, t.amount, t.tx_type, t.created_at FROM transactions t JOIN customers c ON c.id = t.customer_id ORDER BY t.created_at DESC');
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, [$row['id'], $row['name'], $row['product_key'], $row['amount'], $row['tx_type'], $row['created_at']]);
        }
    });
}

function export_inventory_route(PDO $pdo): void
{
    stream_csv('voorraad.csv', function ($output) use ($pdo) {
        fputcsv($output, ['Product', 'Naam', 'Voorraad']);
        $stmt = $pdo->query('SELECT product_key, product_name, units FROM inventory ORDER BY product_key');
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, [$row['product_key'], $row['product_name'], $row['units']]);
        }
    });
}

function invoices_daily_route(PDO $pdo): void
{
    $data = json_input();
    $date = parse_date($data['date'] ?? null) ?: new DateTimeImmutable('today');
    $stmt = $pdo->prepare("SELECT c.name, c.number, SUM(CASE WHEN t.tx_type = 'issue' THEN t.amount ELSE 0 END) AS issued, SUM(CASE WHEN t.tx_type = 'return' THEN t.amount ELSE 0 END) AS returned FROM customers c LEFT JOIN transactions t ON t.customer_id = c.id AND DATE(t.created_at) = :day GROUP BY c.id, c.name, c.number ORDER BY c.number");
    $stmt->execute([':day' => $date->format('Y-m-d')]);
    $lines = ['Dagafrekening ' . $date->format('d-m-Y'), ''];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $lines[] = sprintf('%s (%s): Uitgifte %s - Inname %s', $row['name'], $row['number'], (int)$row['issued'], (int)$row['returned']);
    }
    $pdf = simple_pdf($lines);
    stream_pdf('dagafrekening.pdf', $pdf);
}

function invoices_final_route(PDO $pdo): void
{
    $data = json_input();
    $start = parse_date($data['start'] ?? null) ?: new DateTimeImmutable('first day of this month');
    $end = parse_date($data['end'] ?? null) ?: new DateTimeImmutable('last day of this month');
    $stmt = $pdo->prepare("SELECT c.name, c.number, SUM(CASE WHEN t.tx_type = 'issue' THEN t.amount ELSE 0 END) AS issued, SUM(CASE WHEN t.tx_type = 'return' THEN t.amount ELSE 0 END) AS returned FROM customers c LEFT JOIN transactions t ON t.customer_id = c.id AND t.created_at BETWEEN :start AND :end GROUP BY c.id, c.name, c.number ORDER BY c.number");
    $stmt->execute([
        ':start' => $start->format('Y-m-d 00:00:00'),
        ':end' => $end->format('Y-m-d 23:59:59'),
    ]);
    $lines = ['Eindafrekening ' . $start->format('d-m-Y') . ' t/m ' . $end->format('d-m-Y'), ''];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $lines[] = sprintf('%s (%s): Uitgifte %s - Inname %s', $row['name'], $row['number'], (int)$row['issued'], (int)$row['returned']);
    }
    $pdf = simple_pdf($lines);
    stream_pdf('eindafrekening.pdf', $pdf);
}

function get_customer_by_identifier(PDO $pdo, $identifier): ?array
{
    if (!$identifier) {
        return null;
    }
    if (is_numeric($identifier)) {
        $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = :id OR number = :number');
        $stmt->execute([':id' => (int)$identifier, ':number' => normalize_customer_number((string)$identifier)]);
    } else {
        $stmt = $pdo->prepare('SELECT * FROM customers WHERE nfc_code = :nfc OR number = :number');
        $stmt->execute([':nfc' => $identifier, ':number' => normalize_customer_number((string)$identifier)]);
    }
    $customer = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$customer) {
        return null;
    }
    return ['id' => (int)$customer['id'], 'number' => $customer['number'], 'name' => $customer['name']];
}

function aggregate_customer_totals(PDO $pdo, int $customerId): array
{
    $stmt = $pdo->prepare('SELECT product_key, tx_type, SUM(amount) AS total FROM transactions WHERE customer_id = :id GROUP BY product_key, tx_type');
    $stmt->execute([':id' => $customerId]);
    $totals = ['issue' => [], 'return' => []];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $totals[$row['tx_type']][$row['product_key']] = (int)$row['total'];
    }
    $coinStmt = $pdo->prepare('SELECT SUM(amount) FROM coin_transactions WHERE customer_id = :id');
    $coinStmt->execute([':id' => $customerId]);
    $coins = (int)($coinStmt->fetchColumn() ?: 0);
    return [$totals, $coins];
}

