<?php

require_once __DIR__ . '/jwt.php';
require_once __DIR__ . '/utils.php';

function current_user(): ?array
{
    return $GLOBALS['current_user'] ?? null;
}

function set_current_user(?array $user): void
{
    $GLOBALS['current_user'] = $user;
}

function authenticate(array $config): void
{
    $auth = get_header('Authorization');
    if (!$auth || stripos($auth, 'bearer ') !== 0) {
        respond_error('Unauthorized', 401);
        exit;
    }
    $token = trim(substr($auth, 7));
    $claims = jwt_decode($token, $config['jwt_secret']);
    if (!$claims) {
        respond_error('Invalid token', 401);
        exit;
    }
    set_current_user($claims);
}

function require_auth(array $config, array $roles = [], array $dashboards = []): void
{
    authenticate($config);
    $claims = current_user();
    if (!$claims) {
        return;
    }
    if ($roles && !in_array($claims['role'] ?? null, $roles, true)) {
        respond_error('Forbidden', 403);
        exit;
    }
    if ($dashboards) {
        $allowed = $claims['dashboards'] ?? [];
        if ($allowed === '*') {
            return;
        }
        if (!is_array($allowed)) {
            $allowed = resolve_dashboards($allowed, $config['allowed_dashboards']);
        }
        $ok = false;
        foreach ($dashboards as $required) {
            if (in_array($required, $allowed, true)) {
                $ok = true;
                break;
            }
        }
        if (!$ok) {
            respond_error('Forbidden', 403);
            exit;
        }
    }
}

