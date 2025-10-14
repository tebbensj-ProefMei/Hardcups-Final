ProefMei Backend (Flask + SQLite/MySQL + NFC + PDF)
==================================================
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
- Probeert eerst hardware via nfcpy ('usb')
- Indien niet beschikbaar -> simulatiecode
Response: { "nfc_code": "...", "mode": "hardware|simulation" }

Belangrijke endpoints
---------------------
POST /api/auth/login -> {token, role}
GET  /api/dashboard
GET  /api/inventory
POST /api/inventory/add_bulk       (admin)
GET  /api/customers
GET  /api/customers/<id>
POST /api/customers                (admin)
PUT  /api/customers/<id>           (admin)
POST /api/transaction              (issue/return met klantnummer of NFC)
POST /api/invoices/daily?customer=02&date=YYYY-MM-DD   -> PDF (Pro Forma)
POST /api/invoices/final?customer=02                   -> PDF (Pro Forma)
GET  /api/export/transactions.csv
GET  /api/export/inventory.csv
