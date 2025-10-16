# HardCups installeren op Strato shared hosting

Deze handleiding beschrijft stap voor stap hoe je de HardCups-webapplicatie
(de statische frontend + PHP-backend) op een Strato "StratoPakket" of vergelijkbare
gedeelde hostingomgeving plaatst. Alle stappen zijn getest met een standaard
Strato Linux-pakket met Apache 2.4 en PHP 8.1.

## 0. Benodigdheden

* Inloggegevens voor het Strato-klantenpaneel en de bijbehorende webspace (FTP/SFTP).
* Een lege MySQL- of MariaDB-database die bij het pakket hoort.
* PHP 8.1 of hoger geactiveerd in het Strato-pakket.
* Een computer om de bestanden te downloaden en via (S)FTP te uploaden.

## 1. Bronscode downloaden

1. Klik in GitHub op **Code → Download ZIP** of gebruik `git clone` om de
   repository lokaal op je computer te krijgen.
2. Pak het ZIP-bestand uit. Je hebt straks twee mappen nodig:
   * `frontend/` (bevat `index.html`, `app.js`, `styles.css`, `logo.jpeg`)
   * `php-backend/public/` (bevat `index.php` en `.htaccess`)

> Tip: laat de rest van de repository voorlopig ongemoeid; deze heb je niet nodig
> voor gedeelde hosting.

## 2. Database voorbereiden bij Strato

1. Log in op het [Strato klantenpaneel](https://www.strato.nl/login/).
2. Ga naar **Databases & Webspace → Databasebeheer** en maak (of selecteer)
   een MySQL-database.
3. Noteer de volgende gegevens; je hebt ze later nodig:
   * Hostnaam (bijv. `rdbms.strato.de`)
   * Databasenaam
   * Gebruikersnaam
   * Wachtwoord
4. Klik op **phpMyAdmin starten** en importeer desgewenst het bestand
   `backend/schema.sql` om alvast lege tabellen aan te maken. Dit is optioneel
   maar versnelt de eerste login.

## 3. Configuratie instellen

Je kunt de database- en JWT-gegevens op twee manieren doorgeven aan de PHP-code.
Kies één van de onderstaande methoden.

### Optie A – Environment-variabelen via Strato-configuratie

1. Open in het klantenpaneel **Hosting → PHP-instellingen → Variabelen**.
2. Voeg de volgende variabelen toe:
   * `DB_HOST`, `DB_PORT` (meestal `3306`), `DB_NAME`, `DB_USER`, `DB_PASS`
   * `JWT_SECRET` – kies een lang, willekeurig geheim (bijv. met een
     wachtwoordgenerator)
   * Optioneel: `NFC_BRIDGE_TOKEN` voor de NFC-bridge
3. Sla de wijzigingen op. Strato zet de variabelen binnen enkele minuten door.

### Optie B – Configuratie direct in `config.php`

1. Open lokaal het bestand `php-backend/src/config.php` in een teksteditor.
2. Vervang de standaardwaarden in het `db`-gedeelte door jouw Strato-gegevens.
3. Pas `jwt_secret` aan naar een lang, uniek geheim.
4. Sla het bestand op. Upload later deze aangepaste versie mee.

## 4. Bestanden uploaden naar de webspace

1. Maak verbinding met je Strato-webspace via SFTP (aanbevolen) of FTP.
   * Host: zie Strato-panel (meestal `ssh.strato.de` of `ftp.strato.com`)
   * Gebruikersnaam/wachtwoord: vind je in **Databases & Webspace → Webspace**
2. Navigeer naar de hoofdmap van je website, vaak `httpdocs/`.
3. Upload de inhoud van de map `frontend/` rechtstreeks in `httpdocs/`.
   * Controleer dat `index.html` en `app.js` in de root staan.
4. Maak in `httpdocs/` een submap `api/` of gebruik de bestaande mapnaam die
   je zelf prettig vindt.
5. Upload de bestanden uit `php-backend/public/` naar deze `api/`-map.
   * Zorg dat `.htaccess` zichtbaar blijft; sommige FTP-clients verbergen
     bestanden die met een punt beginnen. Schakel "verborgen bestanden tonen"
     in indien nodig.

> Resultaat: je frontend is bereikbaar op `https://jouwdomein.nl/` en de API op
> `https://jouwdomein.nl/api/`.

## 5. Controleer rewrite en PHP-versie

1. Ga in het Strato-panel naar **Hosting → PHP-instellingen** en kies PHP 8.1 of
   hoger.
2. Controleer dat **URL rewriting** (mod_rewrite) is ingeschakeld. Dit is bij
   Strato standaard actief; neem contact op met de support als het niet werkt.

## 6. Eerste test

1. Open `https://jouwdomein.nl/` in een browser.
2. Het inlogscherm van HardCups zou moeten laden.
3. Ga naar `https://jouwdomein.nl/api/health`. Je hoort een JSON-reactie te zien:
   ```json
   {"status":"ok"}
   ```
4. Maak via de frontend een beheeraccount aan (of gebruik bestaande data). De
   database wordt automatisch aangemaakt als er nog geen tabellen bestaan.

## 7. NFC-bridge gebruiken vanaf Railway of lokaal

Strato kan geen USB-NFC-lezers aansluiten. Gebruik daarom de NFC-bridge:

1. Kies een geheime token en stel deze in als `NFC_BRIDGE_TOKEN` (zie stap 3).
2. Start lokaal of op Railway het Python-script:
   ```bash
   python backend/nfc_bridge.py --forward https://jouwdomein.nl/api --token <jouw-token>
   ```
3. Verbind je NFC-reader met de computer/VM waarop het script draait. Iedere scan
   wordt naar de Strato-API doorgestuurd en verschijnt in de webinterface.

## 8. Onderhoud en updates

* **Updates uploaden** – Vervang bij een nieuwe versie simpelweg de bestanden in
  `httpdocs/` (frontend) en `httpdocs/api/` (backend). Maak vooraf een back-up van
  je `.env` of `config.php`.
* **Back-ups** – Gebruik Strato's database-back-up in het klantenpaneel en sla
  periodiek een kopie van je webspace op.
* **Foutopsporing** – PHP-fouten verschijnen in `log/` binnen de webspace of via
  het Strato-logboek (Hosting → Logbestanden).

Met deze stappen draait HardCups volledig op je Strato gedeelde hostingpakket met
behoud van de NFC-functionaliteit via de bridge.
