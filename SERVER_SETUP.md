HardCups serverhandleiding (Linux VPS/dedicated + MySQL 8)

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
