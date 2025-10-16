<?php

function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string
{
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/')) ?: '';
}

function jwt_encode(array $payload, string $secret): string
{
    $header = ['typ' => 'JWT', 'alg' => 'HS256'];
    $segments = [
        base64url_encode(json_encode($header)),
        base64url_encode(json_encode($payload)),
    ];
    $signingInput = implode('.', $segments);
    $signature = hash_hmac('sha256', $signingInput, $secret, true);
    $segments[] = base64url_encode($signature);
    return implode('.', $segments);
}

function jwt_decode(string $token, string $secret): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    [$headerB64, $payloadB64, $signatureB64] = $parts;
    $header = json_decode(base64url_decode($headerB64), true);
    $payload = json_decode(base64url_decode($payloadB64), true);
    if (!$header || !$payload || ($header['alg'] ?? null) !== 'HS256') {
        return null;
    }
    $expected = base64url_encode(hash_hmac('sha256', "$headerB64.$payloadB64", $secret, true));
    if (!hash_equals($expected, $signatureB64)) {
        return null;
    }
    if (isset($payload['exp']) && time() >= (int)$payload['exp']) {
        return null;
    }
    return $payload;
}

