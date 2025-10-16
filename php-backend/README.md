# HardCups PHP-backend (gedeelde hosting / Strato)

Deze map bevat een PHP-implementatie van de HardCups API, zodat de
applicatie zonder Python kan draaien op hostingpakketten zoals Strato,
Yourhosting of Neostrada. De code is frameworkloos en werkt met Apache
+ PHP 8 (of hoger) en MySQL/MariaDB.

## Bestandsstructuur

```
php-backend/
├── public/
│   ├── .htaccess   # Routeert alle /api-verzoeken naar index.php
│   └── index.php   # API-router en controllers
└── src/
    ├── auth.php
    ├── config.php
    ├── database.php
    ├── jwt.php
    ├── nfc_bridge.php
    ├── pdf.php
    └── utils.php
```

Upload de map `public/` naar de webroot (bij Strato vaak `httpdocs/`).
Zet de bestanden uit `frontend/` in dezelfde webroot zodat de SPA vanaf
`index.html` geladen kan worden. De frontend verwacht standaard dat de
API bereikbaar is op `/api` (relatief pad), dus geen verdere aanpassing
nodig. Zoek je een stap-voor-stap handleiding specifiek voor Strato?
Bekijk dan [`STRATO_INSTALLATIE.md`](./STRATO_INSTALLATIE.md).

## Configuratie

1. **Database** – Maak een MySQL-database aan (bij Strato via het
   klantenpaneel) en noteer host, database, gebruiker en wachtwoord.
2. **Environment** – In `config.php` kun je eventueel vaste waarden
   invullen. Beter is het om via het hostingpaneel environment-variabelen
   te zetten:
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`
   - `JWT_SECRET` (lang, uniek geheim)
   - Optioneel: `NFC_BRIDGE_TOKEN`, `NFC_BRIDGE_MAX_AGE_SECONDS`
3. **PHP-versie** – Kies in het hostingpaneel voor PHP 8.1 of hoger.
4. **Bestanden uploaden** – Plaats `php-backend/public` in de webroot en
   controleer dat `.htaccess` behouden blijft (sommige FTP-clients verbergen
   verborgen bestanden).
5. **Database initialiseren** – De API maakt tabellen automatisch aan.
   Wil je vooraf vullen? Importeer `backend/schema.sql` in MySQL.

## NFC-bridge op gedeelde hosting

Gedeelde hosting kan geen USB-NFC-readers aanspreken. Gebruik de
meegeleverde bridgeflow:

1. Draai lokaal de Python helper `backend/nfc_bridge.py --forward` en
   wijs deze naar jouw gedeelde hosting domein.
2. Stel een `NFC_BRIDGE_TOKEN` in en gebruik dezelfde token in de helper.
3. De PHP-API bewaart scans in `nfc_scans` en levert ze via `/api/nfc/read`
   uit aan de webinterface.

## Cronjobs / back-ups

- **Cronjob**: optioneel kun je een dagelijks cron- of schedulertask
  instellen dat `/api/health` aanroept om PHP warm te houden.
- **Back-up**: gebruik de database-back-up tooling van je hoster en
  download periodiek de database.

## Probleemoplossing

| Probleem | Oplossing |
| --- | --- |
| 500 Internal Server Error | Controleer PHP-versie (>=8) en bekijk errorlog via hostingpaneel. |
| Lege API-respons | Controleer of `.htaccess` aanwezig is en mod_rewrite aanstaat. |
| Login werkt niet | Zet `JWT_SECRET` en valideer dat de `users`-tabel gevuld is. |
| NFC-codes komen niet door | Controleer of de bridgehelper draait en dezelfde token gebruikt. |

Veel succes met het deployen!
