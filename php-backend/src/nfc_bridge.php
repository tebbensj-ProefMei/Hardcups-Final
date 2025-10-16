<?php

require_once __DIR__ . '/utils.php';

function nfc_push(PDO $pdo, array $config, array $payload): array
{
    $token = $payload['token'] ?? null;
    $code = trim($payload['code'] ?? '');
    if ($config['nfc_bridge_token'] && $token !== $config['nfc_bridge_token']) {
        return ['status' => 401, 'body' => ['error' => 'Ongeldige bridge token']];
    }
    if ($code === '') {
        return ['status' => 400, 'body' => ['error' => 'Geen NFC-code ontvangen']];
    }
    $stmt = $pdo->prepare('INSERT INTO nfc_scans (nfc_code, source) VALUES (:code, :source)');
    $stmt->execute([
        ':code' => $code,
        ':source' => $payload['source'] ?? $config['nfc_bridge_source'],
    ]);
    return ['status' => 200, 'body' => ['ok' => true]];
}

function nfc_read(PDO $pdo, array $config): array
{
    if ($config['nfc_mode'] === 'disabled') {
        return ['status' => 200, 'body' => ['mode' => 'disabled']];
    }
    $threshold = (new DateTimeImmutable())->modify('-' . (int)$config['nfc_bridge_max_age'] . ' seconds');
    $pdo->beginTransaction();
    try {
        $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $lockClause = $driver === 'mysql' ? ' FOR UPDATE' : '';
        $stmt = $pdo->prepare('SELECT * FROM nfc_scans WHERE consumed = 0 AND created_at >= :threshold ORDER BY created_at ASC LIMIT 1' . $lockClause);
        $stmt->execute([':threshold' => $threshold->format('Y-m-d H:i:s')]);
        $scan = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$scan) {
            $pdo->commit();
            return ['status' => 200, 'body' => ['mode' => $config['nfc_mode'], 'code' => null]];
        }
        $timestampFunc = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite' ? "datetime('now')" : 'NOW()';
        $update = $pdo->prepare("UPDATE nfc_scans SET consumed = 1, consumed_at = $timestampFunc WHERE id = :id");
        $update->execute([':id' => $scan['id']]);
        $pdo->commit();
        return ['status' => 200, 'body' => ['mode' => 'bridge', 'code' => $scan['nfc_code']]];
    } catch (Throwable $e) {
        $pdo->rollBack();
        return ['status' => 500, 'body' => ['error' => 'NFC-queue fout']];
    }
}

