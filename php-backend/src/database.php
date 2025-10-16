<?php

function db_connect(array $config): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $driver = $config['db']['driver'];
    if ($driver === 'sqlite') {
        $path = $config['db']['sqlite_path'];
        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0775, true);
        }
        $dsn = 'sqlite:' . $path;
        $pdo = new PDO($dsn);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        $config['db']['host'],
        $config['db']['port'],
        $config['db']['name'],
        $config['db']['charset']
    );
    $pdo = new PDO($dsn, $config['db']['user'], $config['db']['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

function db_initialize(PDO $pdo): void
{
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    $autoIncrement = $driver === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INTEGER PRIMARY KEY AUTO_INCREMENT';
    $booleanType = $driver === 'sqlite' ? 'INTEGER' : 'TINYINT(1)';
    $enumTxType = $driver === 'sqlite'
        ? "TEXT CHECK (tx_type IN ('issue','return'))"
        : "ENUM('issue','return')";
    $enumRole = $driver === 'sqlite'
        ? "TEXT CHECK (role IN ('admin','medewerker','klant'))"
        : "ENUM('admin','medewerker','klant')";

    $queries = [
        "CREATE TABLE IF NOT EXISTS customers (\n            id $autoIncrement,\n            number VARCHAR(8) NOT NULL UNIQUE,\n            name VARCHAR(200) NOT NULL,\n            email VARCHAR(200),\n            address VARCHAR(300),\n            nfc_code VARCHAR(64) UNIQUE\n        )",
        "CREATE TABLE IF NOT EXISTS inventory (\n            id $autoIncrement,\n            product_key VARCHAR(32) NOT NULL UNIQUE,\n            product_name VARCHAR(200) NOT NULL,\n            units INT NOT NULL DEFAULT 0\n        )",
        "CREATE TABLE IF NOT EXISTS transactions (\n            id $autoIncrement,\n            customer_id INT NOT NULL,\n            product_key VARCHAR(32) NOT NULL,\n            amount INT NOT NULL,\n            tx_type $enumTxType NOT NULL,\n            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n        )",
        "CREATE TABLE IF NOT EXISTS users (\n            id $autoIncrement,\n            username VARCHAR(64) NOT NULL UNIQUE,\n            password_hash VARCHAR(255) NOT NULL,\n            role $enumRole NOT NULL DEFAULT 'medewerker',\n            customer_id INT NULL,\n            allowed_dashboards VARCHAR(255) NOT NULL DEFAULT 'dashboard'\n        )",
        "CREATE TABLE IF NOT EXISTS coin_transactions (\n            id $autoIncrement,\n            customer_id INT NOT NULL,\n            amount INT NOT NULL,\n            recorded_by VARCHAR(64),\n            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n        )",
        "CREATE TABLE IF NOT EXISTS nfc_scans (\n            id $autoIncrement,\n            nfc_code VARCHAR(128) NOT NULL,\n            source VARCHAR(64) DEFAULT NULL,\n            consumed $booleanType NOT NULL DEFAULT 0,\n            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n            consumed_at DATETIME DEFAULT NULL\n        )"
    ];

    foreach ($queries as $sql) {
        $pdo->exec($sql);
    }

    if ($driver !== 'sqlite') {
        try {
            $pdo->exec('ALTER TABLE transactions ADD CONSTRAINT fk_cust FOREIGN KEY (customer_id) REFERENCES customers(id)');
        } catch (PDOException $ignored) {
            // constraint already exists
        }
        try {
            $pdo->exec('ALTER TABLE coin_transactions ADD CONSTRAINT fk_coin_customer FOREIGN KEY (customer_id) REFERENCES customers(id)');
        } catch (PDOException $ignored) {
            // constraint already exists
        }
    }
}

function db_seed(PDO $pdo): void
{
    $count = (int) $pdo->query('SELECT COUNT(*) FROM inventory')->fetchColumn();
    if ($count === 0) {
        $stmt = $pdo->prepare('INSERT INTO inventory (product_key, product_name, units) VALUES (?, ?, ?)');
        $items = [
            ['hardcups', 'Hardcups', 500],
            ['champagne', 'Champagne Hardcups', 300],
            ['cocktail', 'Cocktail Hardcups', 450],
        ];
        foreach ($items as $row) {
            $stmt->execute($row);
        }
    }

    $customerCount = (int) $pdo->query('SELECT COUNT(*) FROM customers')->fetchColumn();
    if ($customerCount === 0) {
        $stmt = $pdo->prepare('INSERT INTO customers (number, name, email, address, nfc_code) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute(['02', 'The Foodystore', 'info@foodystore.nl', 'Markt 12, Bergen op Zoom', 'NFC123456']);
    }

    $userCount = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($userCount === 0) {
        $hash = password_hash('Proefmei2026!', PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('INSERT INTO users (username, password_hash, role, allowed_dashboards) VALUES (?, ?, ?, ?)');
        $stmt->execute(['Tebbensj', $hash, 'admin', '*']);
    }
}
