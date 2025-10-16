HardCups serverhandleiding (Linux of Windows VPS + MySQL 8/SQLite)

> **Nieuw (2026): volledige Windows-ondersteuning**
>
> Draai je HardCups op een Hetzner Windows Server of andere Windows-hosting?
> Gebruik dan het script `start_windows.ps1`. Dat script maakt automatisch
> een virtuele omgeving aan, installeert de Python-dependencies en start
> zowel de Flask-backend als de statische frontend. In de sectie
> [Windows Server (Hetzner / Windows Server 2022)](#windows-server-hetzner--windows-server-2022)
> staan alle stappen om de server te configureren en – indien gewenst – als
> Scheduled Task te laten opstarten.

> **Nieuwe PHP-hostingvariant (optioneel)**
>
> Gebruik je gedeelde hosting zoals Strato Pakket (Apache + PHP) en heb je
> geen toegang tot Python? Deploy dan de map `php-backend/public` naar je
> webroot en laat de statische frontend (`frontend/`) mee uploaden. Zie
> `php-backend/README.md` voor de stappen om `.htaccess`,
> databaseconfiguratie en NFC-bridge in te stellen. De rest van dit document
> beschrijft de Python-backend op een eigen VPS of cloudomgeving.

> **Alleen lokaal draaien?**
>
> De meeste gebruikers willen HardCups gewoon op hun eigen computer uitvoeren.
> Volg in dat geval de stappen uit `LOCAL_STARTUP.txt`. Dat document behandelt
> zowel Windows (PowerShell of dubbelklikken) als macOS/Linux, gebruikt standaard
> de meegeleverde SQLite-database (`backend/proefmei.db`) en beschrijft hoe je
> via het menu **Accounts** rechten toewijst. De rest van deze gids is vooral
> relevant wanneer je het systeem op een externe server of gedeelde hosting wilt
> plaatsen.

**Benodigde schijfruimte**

- Repository + configuratiebestanden: ±1 MB.
- Python-virtualenv incl. afhankelijkheden: reken op 400–500 MB.
- MySQL-database: reserveer minimaal 1 GB vrije ruimte voor data en back-ups.
- Logbestanden/systemd-journal: plan extra 500 MB voor groei.

> **Totaaladvies**: zorg voor minstens 3 GB vrije ruimte op de server zodat er
> marge is voor updates, logs en toekomstige datasets.

Snelle checklist
----------------
1. SSH inloggen als beheerder en systeem up-to-date brengen.
2. Vereiste pakketten installeren (Python, Git, MySQL-client, optioneel Nginx).
3. MySQL 8-database en gebruiker aanmaken of gegevens verzamelen.
4. Repository plaatsen in `/opt/hardcups` of `/srv/hardcups` en `.env` vullen.
5. Applicatie starten met `./start_server.sh` of inrichten als systemd-service.
6. (Optioneel) Reverse proxy (Nginx/Apache) voor publieke HTTPS-endpoints.

> **Nieuw:** de applicatie bevat een muntenmodule en dashboard-gebaseerde
> autorisatie. Zorg dat je na het opstarten admin-accounts gebruikt om per
> gebruiker de gewenste dashboards (Munten, Klanten, Overzicht, etc.) toe te
> wijzen. Alleen accounts met het dashboard "Munten" zien de nieuwe muntenviews.

Windows Server (Hetzner / Windows Server 2022)
----------------------------------------------
De onderstaande stappen zijn getest op een Hetzner Cloud-instance met
Windows Server 2022, maar werken ook op andere Windows-hosts (2019/2022)
zolang PowerShell 5.1+ aanwezig is.

1. **Voorbereiden**
   - Log in via Remote Desktop als Administrator.
   - Installeer updates via *Settings → Windows Update* en herstart indien nodig.
   - Installeer Python en Git (via [winget](https://learn.microsoft.com/windows/package-manager/winget/)):  
     ```powershell
     winget install --id Python.Python.3.11
     winget install --id Git.Git
     ```
     > Geen winget beschikbaar? Download de installers vanaf python.org en git-scm.com en voer ze handmatig uit.

2. **Repository plaatsen**
   ```powershell
   cd C:\HardCups
   git clone https://github.com/<jouw-org>/Hardcups-Final.git .
   Copy-Item backend\env.example backend\.env -Force
   ```
   - Pas `backend\.env` aan met je productieconfiguratie (MySQL of SQLite).  
     Laat `DB_BACKEND=sqlite` staan wanneer je de standaarddatabase wilt blijven gebruiken.

3. **Backend + frontend starten**
   - Open een PowerShell-venster in de projectmap en start het nieuwe script:
     ```powershell
     # Luister op alle interfaces zodat clients in je netwerk kunnen verbinden
     $env:BACKEND_HOST = '0.0.0.0'
     $env:FRONTEND_HOST = '0.0.0.0'
     ./start_windows.ps1
     ```
   - Het script maakt automatisch `.venv\`, installeert `backend\requirements.txt`
     en start de services. Sluit af door **Enter** te drukken.
   - Gebruik `SKIP_PIP_INSTALL=1` wanneer je pip-installaties wilt overslaan, of
     stel andere poorten in via `$env:BACKEND_PORT`/`$env:FRONTEND_PORT`.

4. **Automatisch starten (Scheduled Task)**
   1. Open *Task Scheduler* en kies **Create Task**.
   2. Geef de taak een naam zoals "HardCups Server" en vink **Run whether user is logged on or not** aan.
   3. Voeg een trigger toe "At startup" of "At log on" van het service-account.
   4. Actie: **Start a program** met:
      - Program/script: `powershell.exe`
      - Add arguments: `-NoProfile -ExecutionPolicy Bypass -File "C:\HardCups\start_windows.ps1"`
      - Start in: `C:\HardCups`
   5. Sla op en voer de taak eenmalig handmatig uit om te testen.

5. **Firewall + HTTPS**
   - Sta verkeer toe op de gebruikte poorten:
     ```powershell
     New-NetFirewallRule -DisplayName 'HardCups Backend' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
     New-NetFirewallRule -DisplayName 'HardCups Frontend' -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow
     ```
   - Voor publieke toegang wordt een reverse proxy (bijv. IIS + ARR of Nginx voor Windows) aanbevolen om HTTPS te termineren.

6. **Lokaal testen blijft beschikbaar**
   - Gebruik `LOCAL_STARTUP.txt` voor ontwikkelaars die lokaal willen draaien.
   - Op Windows kun je hetzelfde `start_windows.ps1`-script gebruiken; op macOS/Linux is er
     nu een korte alias `./start_local.sh` die `start_server.sh` aanroept.
   - Zowel lokaal als op de server kun je via het dashboard **Instellingen** het API-adres
     aanpassen (bijv. `http://127.0.0.1:5000/api` lokaal en `https://<server>/api` extern).

Stap 1 – Verbinden en voorbereiden
----------------------------------
1. **SSH-verbinding**
   ```bash
   ssh root@<server-ip>
   ```
   > Bij Strato kan de standaardgebruikersnaam `root` zijn; bij Hetzner kan dit
   > ook `root` of een ingestelde cloud-init user zijn.

2. **Optioneel: maak een beheerder aan**
   ```bash
   adduser hardcups
   usermod -aG sudo hardcups
   ```
   Log daarna in als deze gebruiker:
   ```bash
   su - hardcups
   ```

3. **Systeem bijwerken**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

4. **Benodigde pakketten installeren**
   ```bash
   sudo apt install -y python3 python3-venv python3-pip git mysql-client
   ```
   Voor reverse proxy of statische hosting:
   ```bash
   sudo apt install -y nginx
   ```

5. **Firewall configureren (optioneel maar aanbevolen)**
   ```bash
   sudo apt install -y ufw
   sudo ufw allow OpenSSH
   sudo ufw allow 5000/tcp   # backend API (pas aan indien gewenst)
   sudo ufw allow 8001/tcp   # frontend static server
   sudo ufw enable
   ```
   > Gebruik je een reverse proxy zoals Nginx? Sta dan poorten 80 en 443 toe en
   > houd interne poorten (5000/8001) lokaal door alleen `127.0.0.1` te binden.

Stap 2 – MySQL 8 inrichten
--------------------------
1. **MySQL-gegevens verzamelen**
   - Voor managed databases (Strato Database Cloud, Hetzner Managed DB): noteer
     hostnaam, poort (meestal 3306), database, gebruiker en wachtwoord.
   - Voor een MySQL-server op dezelfde host:
     ```bash
     sudo apt install -y mysql-server
     sudo mysql_secure_installation
     ```

2. **Nieuwe database en gebruiker aanmaken** (pas waarden aan):
   ```sql
   CREATE DATABASE hardcups CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'hardcups_app'@'%' IDENTIFIED BY 'sterkWachtwoord!';
   GRANT ALL PRIVILEGES ON hardcups.* TO 'hardcups_app'@'%';
   FLUSH PRIVILEGES;
   ```
   > Zorg dat de gebruiker het `caching_sha2_password`-mechanisme van MySQL 8
   > gebruikt (standaard vanaf MySQL 8.0). Controleer dit met `SHOW CREATE USER`.

3. **Verbinding testen**
   ```bash
   mysql -h <db-host> -u hardcups_app -p hardcups -e "SELECT VERSION();"
   ```
   Verwacht output in de vorm `8.x.y`. Bij een lagere versie neem contact op met
   de provider en vraag naar MySQL 8-ondersteuning.

4. **Optioneel: schema vooraf importeren**
   ```bash
   mysql -h <db-host> -u hardcups_app -p hardcups < backend/schema.sql
   ```
   De applicatie maakt tabellen automatisch aan, maar een vooraf import garandeert
   het juiste `utf8mb4`-schema.

Stap 3 – Applicatie plaatsen
----------------------------
1. Kies een installatielocatie (voorbeeld `/opt/hardcups`).
   ```bash
   sudo mkdir -p /opt/hardcups
   sudo chown "$USER":"$USER" /opt/hardcups
   cd /opt/hardcups
   ```

2. Repository klonen of uploaden:
   ```bash
   git clone https://github.com/<jouw-account>/Hardcups-Final.git .
   ```
   > Heb je geen Git-toegang op de server, upload dan een ZIP en pak deze hier uit.

3. Controleer de structuur:
   ```bash
   ls
   # verwacht: backend/  frontend/  start_server.sh  ...
   ```

Stap 4 – Configuratie (.env)
----------------------------
1. Voorbeeldbestand kopiëren en openen:
   ```bash
   cp backend/env.example backend/.env
   nano backend/.env
   ```

2. Vul de MySQL-gegevens in en kies een sterk JWT-secret:
   ```dotenv
   DB_BACKEND=mysql
   DB_USER=hardcups_app
   DB_PASS=sterkWachtwoord!
   DB_HOST=<db-host>
   DB_PORT=3306
   DB_NAME=hardcups
   JWT_SECRET=<lang_random_geheim>
   ```
   > Laat `DATABASE_URL` leeg tenzij je liever één connectiestring gebruikt.

3. Sla het bestand op en sluit de editor. Controleer dat er geen quotes of extra
   spaties aanwezig zijn.

Schema-update voor dashboards & munten
--------------------------------------
Vanaf deze versie gebruikt de backend extra database-objecten:

- Kolom `allowed_dashboards` op de `users`-tabel om per account de toegestane
  dashboards op te slaan.
- Tabel `coin_transactions` voor de muntenmodule.

De Flask-app controleert dit automatisch bij het starten (`Base.metadata.create_all`
en een aanvullende migratie). Bij een lege of nieuwe database hoef je niets te
doen. Draait er al een oudere database, start dan de backend één keer zodat de
kolom en tabel automatisch worden toegevoegd. Zie je SQL-fouten over ontbrekende
kolommen, voer dan handmatig uit:

```sql
ALTER TABLE users ADD COLUMN allowed_dashboards VARCHAR(255) DEFAULT 'dashboard';
```

Daarna opnieuw starten. Zodra de migratie is uitgevoerd kun je vanuit de UI de
dashboardrechten en muntenregistratie gebruiken.

Stap 5 – Applicatie starten
---------------------------
1. Maak het script uitvoerbaar en start de services:
   ```bash
   chmod +x start_server.sh
   ./start_server.sh
   ```

2. Het script maakt automatisch een Python-virtualenv aan (standaard `.venv`),
   installeert alle afhankelijkheden en laadt `backend/.env`.

3. Verwachte output bij de eerste run:
   ```
   [setup] Creating Python virtual environment in /opt/hardcups/.venv
   [setup] Installing/updating Python dependencies
   [setup] Loading environment variables from backend/.env
   [backend] Flask API gestart op http://0.0.0.0:5000 (PID ...)
   [frontend] Static server opgestart op http://0.0.0.0:8001 (PID ...)
   [info] Geen interactieve terminal gedetecteerd; wacht tot een proces stopt.
   ```

4. Laat de sessie actief of gebruik `screen`, `tmux` of `nohup` om de processen te
   laten doorlopen:
   ```bash
   nohup ./start_server.sh >/var/log/hardcups.log 2>&1 &
   ```

5. Controleer of de backend bereikbaar is:
   ```bash
   curl http://127.0.0.1:5000/health
   ```
   Verwacht een JSON-respons met statusinformatie.

Stap 6 – Optionele systemd-service
----------------------------------
Voor een robuuste productie-inzet kun je systemd gebruiken om de app automatisch
te laten starten na reboot en crashes.

1. Maak een unit-bestand `/etc/systemd/system/hardcups.service` aan:
   ```ini
   [Unit]
   Description=HardCups backend + frontend
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/opt/hardcups
   ExecStart=/opt/hardcups/start_server.sh
   Restart=on-failure
   User=hardcups
   Environment=ENV_FILE=/opt/hardcups/backend/.env
   # Pas poorten of opties aan via extra Environment= regels, bv:
   # Environment=BACKEND_HOST=127.0.0.1
   # Environment=FRONTEND_HOST=127.0.0.1

   [Install]
   WantedBy=multi-user.target
   ```

2. Systemd herladen en service activeren:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now hardcups.service
   ```

3. Status bekijken en logs volgen:
   ```bash
   sudo systemctl status hardcups.service
   journalctl -u hardcups.service -f
   ```

Stap 7 – Reverse proxy en HTTPS (optioneel maar aanbevolen)
-----------------------------------------------------------
1. **Nginx configureren** (voorbeeld `/etc/nginx/sites-available/hardcups`):
   ```nginx
   server {
       listen 80;
       server_name voorbeeld.nl;

       location /api/ {
           proxy_pass http://127.0.0.1:5000/;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }

       location / {
           proxy_pass http://127.0.0.1:8001/;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

2. Site activeren en Nginx herstarten:
   ```bash
   sudo ln -s /etc/nginx/sites-available/hardcups /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

3. HTTPS toevoegen met Let's Encrypt (Certbot):
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d voorbeeld.nl
   ```

Troubleshooting en beheer
-------------------------
- **Poorten aanpassen**: gebruik omgevingsvariabelen `BACKEND_PORT` en
  `FRONTEND_PORT` wanneer 5000/8001 al in gebruik zijn.
- **Frontend elders hosten**: zet `START_FRONTEND=0` in de systemd-service of bij
  het starten als je statische bestanden via Nginx of een CDN laat serveren.
- **Database-connectie faalt**: controleer firewallregels bij de provider (Strato
  Database Cloud vereist vaak whitelisting van het server-IP) en test met `mysql`
  of `nc`.
- **Updates uitvoeren**:
  ```bash
  cd /opt/hardcups
  git pull
  ./start_server.sh
  ```
  Of, bij systemd:
  ```bash
  sudo systemctl restart hardcups.service
  ```
- **Standaard admin wijzigen**: log in op de app en verander het wachtwoord van
  gebruiker `Tebbensj` (initieel `Proefmei2026!`) of pas dit aan via de database
  voordat je live gaat.

Met deze stappen draait HardCups stabiel op een Linux-server bij Strato, Hetzner
of een vergelijkbare provider met MySQL 8. Veel succes met de installatie!

Strato Webhosting (Basic) – gedeelde hosting stappenplan
--------------------------------------------------------
Gebruik je Strato Webhosting (Basic) in plaats van een eigen VPS, houd dan
rekening met een paar belangrijke verschillen:

- Je deelt CPU/geheugen met andere klanten. Processen die te veel geheugen of
  runtime nemen, worden automatisch gestopt. Optimaliseer daarom rapporten en
  import-/exporttaken en plan zware bulkacties buiten piekmomenten.
- Je kunt geen langdurige achtergrondprocessen draaien; de backend moet via het
  door Strato geleverde **Passenger/FCGI-platform** worden gestart.
- Alle bestanden staan in het webspace-pad (`/home/strato/www/<contract-id>/`).
  Gebruik bij voorkeur SFTP/SSH om bestanden te uploaden in plaats van alleen
  de web-FTP.
- Strato levert standaard MySQL 5.7/8.0. Controleer in het klantenpaneel welke
  versie actief is. Voor HardCups is minimaal MySQL 8 gewenst; vraag anders een
  upgrade aan via het klantenportaal.

### 1. Voorbereiding in het Strato klantenpaneel

1. Log in op `https://login.strato.de` en kies jouw hostingcontract.
2. Ga naar **Databases & Webspace → SSH-toegang** en activeer (indien mogelijk)
   SSH. Noteer de gebruikersnaam (meestal `ssh-<contract-id>`), hostnaam en
   poort.
3. Maak onder **Databases & Webspace → Databases** een nieuwe MySQL-database aan
   en noteer host, databasenaam, gebruikersnaam en wachtwoord.
4. (Optioneel) maak een subdomein aan, bijvoorbeeld `app.jouwdomein.nl`, en
   koppel deze later aan de map waar de frontendbestanden komen te staan.

### 2. Verbinden met de hostingomgeving

```bash
ssh ssh-<contract-id>@ssh.strato.de
# of gebruik SFTP voor bestandsoverdracht
```

Op Strato ziet de mappenstructuur er doorgaans zo uit:

```
~/
 ├── httpdocs/           # Publieke webroot
 ├── log/
 ├── tmp/
 └── python-apps/       # Aan te maken map voor Passenger-projecten
```

Maak alvast de werkmappen aan:

```bash
mkdir -p ~/python-apps/hardcups
mkdir -p ~/httpdocs/app/api
```

### 3. Backend uitrollen met Passenger

1. **Bestanden uploaden**

   - Upload de map `backend/` en het script `start_server.sh` naar
     `~/python-apps/hardcups/`. Je kunt `git` gebruiken (`git clone` in de
     hostingomgeving) of lokaal een ZIP maken en uitpakken met `unzip`.
   - Plaats ook de bestanden `backend/requirements.txt`, `backend/schema.sql`
     en `backend/env.example`.

2. **Virtualenv maken**

   ```bash
   cd ~/python-apps/hardcups/backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   deactivate
   ```

   > Strato heeft meerdere Python-versies; controleer met `python3 -V` welke
   > versie beschikbaar is. Gebruik `python3.9` of hoger indien aanwezig.

3. **Omgevingsvariabelen instellen**

   Maak `~/python-apps/hardcups/backend/.env` en vul de waarden vergelijkbaar met
   het VPS-scenario in. Omdat Passenger het bestand niet automatisch leest, voeg
   je in de WSGI-wrapper (zie stap 4) een loader toe:

   ```dotenv
   # Gebruik standaard de lokale SQLite-database op gedeelde hosting
   DB_BACKEND=sqlite
   SQLITE_DB_PATH=/home/strato/python-apps/hardcups/backend/proefmei.db

   # Schakel alleen over op MySQL wanneer je een externe database hebt ingericht
   # DB_BACKEND=mysql
   # DB_HOST=<mysql-host>
   # DB_PORT=3306
   # DB_NAME=<db-naam>
   # DB_USER=<db-gebruiker>
   # DB_PASS=<db-wachtwoord>
   JWT_SECRET=<sterk_geheim>
   INVOICE_OUTPUT_DIR=/home/strato/tmp/hardcups
   ```

   Maak de outputmap alvast aan:

   ```bash
   mkdir -p ~/tmp/hardcups
   ```

4. **Passenger configureren**

   Maak in `~/python-apps/hardcups/` het bestand `passenger_wsgi.py` met:

   ```python
   import os
   from pathlib import Path

   BASE_DIR = Path(__file__).resolve().parent
   BACKEND_DIR = BASE_DIR / "backend"

   # Virtuele omgeving activeren
   activate_this = BACKEND_DIR / ".venv" / "bin" / "activate_this.py"
   if activate_this.exists():
       with open(activate_this) as f:
           exec(f.read(), {"__file__": str(activate_this)})

   # Omgevingsvariabelen laden
   env_path = BACKEND_DIR / ".env"
   if env_path.exists():
       for line in env_path.read_text().splitlines():
           if not line or line.strip().startswith("#"):
               continue
           key, _, value = line.partition("=")
           os.environ.setdefault(key.strip(), value.strip())

   from backend.app import app as application  # noqa: E402
   ```

   Passenger start automatisch de Flask-applicatie via de WSGI-`application`
   variabele. Controleer de bestandsrechten (`chmod 640 passenger_wsgi.py`).

5. **.htaccess toevoegen**

   Maak in `~/httpdocs/app/api/` een `.htaccess` met:

   ```apache
   PassengerEnabled On
   PassengerPython /home/strato/python-apps/hardcups/backend/.venv/bin/python
   PassengerAppRoot /home/strato/python-apps/hardcups
   PassengerBaseURI /app/api

   # Zorg dat alleen /api/ naar Passenger gaat; overige paden blijven statisch
   RewriteEngine On
   RewriteCond %{REQUEST_URI} ^/app/api
   RewriteRule ^/app/api(.*)$ /app/api$1 [PT,L]
   ```

   Hiermee draait de backend onder `/app/api`. Pas het pad aan als je de
   frontend op een ander subpad of subdomein serveert.

6. **Passenger herstarten**

   Telkens wanneer je code of afhankelijkheden wijzigt:

   ```bash
   touch ~/python-apps/hardcups/tmp/restart.txt
   ```

   Bekijk logbestanden via `tail -f ~/log/passenger.log` bij fouten.

### 4. Frontend-bestanden plaatsen

1. Upload de inhoud van `frontend/` naar `~/httpdocs/app/` (of naar de map die je
   aan jouw domein koppelt). Zorg dat `index.html`, `app.js`, `styles.css` en
   assets allemaal aanwezig zijn.
2. Controleer dat `index.html` verwijst naar de juiste paden. Als je de app op
   een submap (`/app/`) draait, kloppen de relatieve verwijzingen standaard.
3. Het API-adres kun je via het Instellingen-dashboard aanpassen. Stel na het
   eerste inloggen `https://<jouwdomein>/app/api` in, zodat de frontend de
   Passenger-backend aanspreekt.

### 5. Database importeren

Gebruik de Strato Database Manager (phpMyAdmin) om het schema te vullen wanneer
je MySQL inschakelt. Werk je volledig lokaal met SQLite, dan kun je deze stap
overslaan.

```bash
mysql -h <mysql-host> -u <db-gebruiker> -p <db-naam> < backend/schema.sql
```

Heb je geen shell-toegang tot de database, upload dan `backend/schema.sql` via
phpMyAdmin en voer het script daar uit. Start vervolgens de backend zodat de
laatste migraties (zoals `allowed_dashboards` en `coin_transactions`) worden
gecontroleerd.

### 6. Testen en in productie nemen

1. Ga naar `https://<jouwdomein>/app/` en log in met het adminaccount.
2. Pas in Instellingen het API-adres aan naar jouw Passenger-pad en reset de
   cache via de resetknop.
3. Controleer of downloads (PDF/CSV) werken; bestanden worden opgeslagen in
   `~/tmp/hardcups`. Verwijder oude bestanden periodiek om quota te besparen.
4. Gebruik het Accounts-dashboard om klantaccounts alleen het dashboard
   "klantportaal" te geven en wijs overige dashboards toe aan interne gebruikers.

### 7. Beheer en troubleshooting

- **Passenger-logboeken**: `tail -f ~/log/passenger.log` voor runtime-fouten.
- **Resource-limieten**: zie je HTTP 503 of 500 met melding "process terminated",
  controleer dan of het geheugen verbruikt wordt door zware exports. Verklein
  datasets of voer deze buiten piekuren uit.
- **Automatisch updaten**: bij gedeelde hosting zijn `git pull` en `pip install`
  vaak trager. Plan updates via een maintenancevenster en herstart Passenger na
  iedere wijziging.
- **Back-ups**: download regelmatig de database via het Strato-paneel en maak
  een kopie van `~/python-apps/hardcups/backend/.env` en `~/tmp/hardcups`.

Met deze stappen kan HardCups ook op Strato Webhosting (Basic) draaien, zolang je
rekening houdt met de gedeelde resources en het Passenger-model. Voor zwaardere
workloads blijft een VPS of Managed Server aanbevolen, maar het Basic-pakket is
geschikt voor kleinere installaties en demonstraties.
