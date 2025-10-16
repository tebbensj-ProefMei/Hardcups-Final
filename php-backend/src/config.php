<?php

return [
    'jwt_secret' => getenv('JWT_SECRET') ?: 'choose_a_long_random_secret',
    'nfc_mode' => strtolower(getenv('NFC_MODE') ?: 'bridge'),
    'nfc_bridge_token' => getenv('NFC_BRIDGE_TOKEN') ?: null,
    'nfc_bridge_max_age' => (int)(getenv('NFC_BRIDGE_MAX_AGE_SECONDS') ?: 30),
    'nfc_bridge_source' => getenv('NFC_BRIDGE_SOURCE') ?: 'bridge',
    'allowed_dashboards' => [
        'dashboard',
        'klantportaal',
        'klanten',
        'voorraad',
        'transacties',
        'facturen',
        'munten',
        'overzicht',
        'accounts',
        'instellingen',
    ],
    'db' => [
        'driver' => getenv('DB_DRIVER') ?: 'mysql',
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => getenv('DB_PORT') ?: '3306',
        'name' => getenv('DB_NAME') ?: 'proefmei',
        'user' => getenv('DB_USER') ?: 'root',
        'pass' => getenv('DB_PASS') ?: '',
        'charset' => 'utf8mb4',
        'sqlite_path' => getenv('SQLITE_DB_PATH') ?: __DIR__ . '/../storage/proefmei.sqlite',
    ],
];
