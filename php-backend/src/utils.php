<?php

function json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return [];
    }
    return $decoded;
}

function respond_json($data, int $status = 200): void
{
    header_remove('X-Powered-By');
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    echo json_encode($data);
}

function respond_error(string $message, int $status = 400): void
{
    respond_json(['error' => $message], $status);
}

function get_header(string $name): ?string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $key => $value) {
        if (strcasecmp($key, $name) === 0) {
            return $value;
        }
    }
    return null;
}

function cors(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
}

function normalize_customer_number(?string $value): ?string
{
    if ($value === null) {
        return null;
    }
    $number = trim($value);
    if ($number === '') {
        return null;
    }
    return str_pad($number, 2, '0', STR_PAD_LEFT);
}

function resolve_dashboards($value, array $allowed): array
{
    if (empty($value)) {
        return [$allowed[0]];
    }
    if ($value === '*') {
        return $allowed;
    }
    if (is_string($value)) {
        $value = explode(',', $value);
    }
    if (!is_array($value)) {
        return [$allowed[0]];
    }
    $unique = [];
    foreach ($value as $item) {
        if (in_array($item, $allowed, true) && !in_array($item, $unique, true)) {
            $unique[] = $item;
        }
    }
    return $unique ?: [$allowed[0]];
}

function dashboards_to_store(array $dashboards, array $allowed): string
{
    if (empty($dashboards)) {
        return 'dashboard';
    }
    $normalized = resolve_dashboards($dashboards, $allowed);
    if (count($normalized) === count($allowed)) {
        return '*';
    }
    return implode(',', $normalized);
}

function parse_date(?string $value): ?DateTimeImmutable
{
    if (!$value) {
        return null;
    }
    try {
        return new DateTimeImmutable($value);
    } catch (Exception $e) {
        return null;
    }
}

function stream_csv(string $filename, callable $writer): void
{
    header_remove('X-Powered-By');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $output = fopen('php://output', 'w');
    $writer($output);
    fclose($output);
}

function stream_pdf(string $filename, string $content): void
{
    header_remove('X-Powered-By');
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo $content;
}

