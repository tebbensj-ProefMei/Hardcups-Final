ProefMei Backend (Flask + SQLite/MySQL + NFC + PDF)
==================================================

Overzicht van de nieuwste functionaliteiten
-------------------------------------------
De backend ondersteunt sinds de laatste release:

- **Dashboard-gebaseerde autorisatie** – gebruikersaccounts krijgen per dashboard
  toegang (bijv. Dashboard, Klanten, Munten). Het JWT dat tijdens het inloggen
  wordt teruggegeven bevat een `dashboards`-claim met de toegestane secties.
- **Accountbeheer via API** – admins kunnen nieuwe gebruikers aanmaken,
  wachtwoorden resetten en de toegestane dashboards aanpassen zonder handmatig in
  de database te werken.
- **Muntenadministratie** – intake van munten via NFC/klantnummer, rapportages
  per dag en per klant en opslag in de nieuwe `coin_transactions`-tabel die los
  staat van de facturen.
- **Uitgebreide klant- en voorraadrapporten** – directe voorraadcorrecties,
  klantoverzichten met uitgifte/retour per product en gecombineerde cijfers voor
  munten.

Installatie
-----------
1) Database
   Standaard gebruikt de applicatie een lokale SQLite-database die bij de eerste start
   automatisch wordt aangemaakt. Het standaardpad is backend/proefmei.db, maar je kunt
   dit via de configuratie aanpassen. Er is geen aparte databaseserver nodig en je
   hoeft geen commando uit te voeren om de tabellen te creëren. Bij de eerste start
   worden de tabellen gemaakt en wordt het admin-account (Tebbensj/Proefmei2026!) samen
   met een voorbeeldklant en voorraad toegevoegd.

   Wil je opnieuw beginnen met een schone database? Verwijder dan het aangemaakte
   backend/proefmei.db-bestand voordat je de server opnieuw start.

   Wil je liever MySQL gebruiken? Maak dan de database met schema.sql aan:
     mysql -u root -p < schema.sql

2) Config
   cp .env.example .env
   Laat DB_BACKEND=sqlite staan voor de lokale database. Je kunt optioneel
   SQLITE_DB_PATH invullen als je een ander pad voor het SQLite-bestand wilt gebruiken
   (relatief of absoluut).

   Schakel over naar MySQL door DB_BACKEND=mysql te zetten en vul vervolgens
   DB_USER/DB_PASS/DB_HOST/DB_PORT/DB_NAME in, of gebruik rechtstreeks een
   DATABASE_URL. Vergeet niet om altijd een eigen JWT_SECRET te kiezen.

3) Packages
   pip install -r requirements.txt
   (Voor NFC op Linux: libusb/pcscd vaak nodig; zie nfcpy documentatie.)

4) Start
   python app.py  (API op http://localhost:5000)

Inloggen
--------
Seed user: Tebbensj / Proefmei2026!  (rol: admin)

Admins krijgen standaard toegang tot alle dashboards (`allowed_dashboards="*"`).
Nieuwe accounts erven alleen de dashboards die je meegeeft bij het aanmaken.

SQLite tips
-----------
- Controleer of backend/proefmei.db wordt aangemaakt na het eerste opstarten. Als het
  bestand niet verschijnt, controleer dan of de applicatie schrijfrechten heeft op de
  map.
- Het seed-script draait één keer. Wil je de seed opnieuw uitvoeren? Verwijder de
  database of maak handmatig extra gebruikers aan via de API (POST /api/customers,
  POST /api/auth/register wanneer je dit toevoegt, enz.).
- Je kunt het pad naar de database aanpassen via SQLITE_DB_PATH in .env. Gebruik een
  absoluut pad wanneer je het bestand buiten de repository wilt bewaren.

NFC lezen
---------
GET /api/nfc/read (admin/medewerker)
- Standaard probeert de backend een USB-lezer via nfcpy (`NFC_MODE=auto`).
- Wanneer `NFC_MODE=bridge` of hardware faalt en een bridge-token is gezet,
  wordt gekeken of er een recente scan is doorgestuurd via de bridge.
- Zonder hardware of bridge blijft er een simulatiecode terugkomen (handig voor
  demo's, maar niet voor productie).
Response: `{ "nfc_code": "...", "mode": "hardware|bridge|simulation" }`

Bridge configureren (Railway e.d.)
----------------------------------
Voor omgevingen zonder directe USB-toegang (zoals Railway) kun je een lokale
bridge inzetten:

1. Kies een geheime token en stel die in op de server (`NFC_BRIDGE_TOKEN`) en
   lokaal. Optioneel stel je ook `NFC_MODE=bridge` in om hardwarepogingen over
   te slaan en `NFC_BRIDGE_MAX_AGE_SECONDS` (standaard 30 seconden) om scans te
   verwerpen die te oud zijn.
2. Start de backend met deze variabelen. `/api/nfc/push` accepteert nu
   `POST`-requests met header `X-NFC-Bridge-Token`.
3. Draai lokaal de `nfc_bridge.py` helper (of stuur eigen requests) op een
   machine met USB-lezer. Elke scan wordt naar de server gepusht en kan daarna
   één keer worden opgehaald via `/api/nfc/read`.

Voorbeeld-request:

```
POST /api/nfc/push
Headers: X-NFC-Bridge-Token: <geheime token>
Body: { "nfc_code": "NFC123", "source": "kassa-1" }
```

Belangrijke endpoints
---------------------
Onderstaande lijst is gegroepeerd op functionaliteit; alle routes gebruiken
Bearer JWT-authenticatie.

**Authenticatie & accounts**
- `POST /api/auth/login` – retourneert `{token, role, dashboards}`.
- `GET /api/users` – overzicht van alle accounts (alleen admins met dashboard
  "accounts").
- `POST /api/users` – nieuw account aanmaken met rol en toegestane dashboards.
- `PUT /api/users/<id>` – rol, wachtwoord en dashboardrechten bijwerken.

**Dashboard en rapportages**
- `GET /api/dashboard` – voorraadoverzicht, uitgifte/retour en ratio voor de
  grafiek van uitgegeven versus ingenomen cups.
- `GET /api/customers/summary` – totaalbeeld per klant (uitgegeven, ingenomen,
  munten) voor het klantoverzicht-dashboard.

**Klantenbeheer**
- `GET /api/customers` en `GET /api/customers/<id>` – ophalen van klantdata.
- `POST /api/customers` – klant aanmaken incl. optionele NFC-tag.
- `PUT /api/customers/<id>` – klantgegevens en NFC-tag aanpassen.

**Voorraad en transacties**
- `GET /api/inventory` – huidige voorraad per product.
- `POST /api/inventory/add_bulk` – bulk-aanvulling (positieve aantallen).
- `PUT /api/inventory/<product>` – direct aanpassen naar gewenst aantal.
- `POST /api/transaction` – uitgifte/retour registreren (verlaagt/verhoogt
  voorraad automatisch).

**Muntenmodule**
- `POST /api/coins/intake` – munten innemen op basis van klantnummer of
  NFC-code.
- `GET /api/coins/daily` – totaalsommen per dag (datumfilters optioneel).
- `GET /api/coins/customers` – totaalstand munten per klant.

**Facturen & export**
- `POST /api/invoices/daily` – dagafrekening; accepteert klant via querystring
  of JSON-body en levert een PDF.
- `POST /api/invoices/final` – eindafrekening voor een klant.
- `GET /api/export/transactions.csv` – CSV-export transacties.
- `GET /api/export/inventory.csv` – CSV-export voorraad.

Alle routes vereisen dat het JWT-account zowel de juiste rol als het
bijbehorende dashboardrecht heeft. Zie de frontend voor het instellen per
account.
