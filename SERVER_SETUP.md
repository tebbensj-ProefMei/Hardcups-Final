HardCups productiehandleiding (Starto VPS + MySQL + Linux)
=========================================================

Overzicht
---------
Dit document beschrijft hoe je het HardCups-project uit deze repository in productie
kunt draaien op een Starto VPS met een Linux-distributie (bijvoorbeeld Ubuntu 22.04)
en een MySQL-database. De stappen zijn opgesplitst in voorbereiding, database,
configuratie, starten en beheer.

Voorbereiding server
--------------------
**Benodigde schijfruimte**

- Repository + configuratiebestanden: ±1 MB.
- Python-virtualenv (incl. dependencies zoals Flask, SQLAlchemy, ReportLab en NFCpy): reken op 400–500 MB na installatie.
- MySQL-server + database: Starto installeert ~1,2 GB voor de server zelf; reserveer minimaal 1 GB extra voor data en back-ups.

> **Totaaladvies**: neem minstens 3 GB vrije schijfruimte op de VPS zodat je voldoende marge hebt voor logbestanden, toekomstige updates en databasegroei.

1. **Inloggen op de VPS**
   ```bash
   ssh <gebruiker>@<vps-ip>
   ```
2. **Systeem updaten en vereiste pakketten installeren**
   ```bash
   sudo apt update
   sudo apt install -y python3 python3-venv python3-pip git mysql-server
   ```
   > Heb je al een MySQL-server elders draaien? Sla dan de installatie van
   > `mysql-server` over en gebruik de externe server in de volgende stappen.
3. **Repository ophalen**
   ```bash
   git clone https://github.com/<jouw-account>/Hardcups-Final.git
   cd Hardcups-Final
   ```

MySQL-database klaarzetten
--------------------------
1. Meld je aan op de MySQL-shell:
   ```bash
   sudo mysql
   ```
2. Maak een database en een aparte gebruiker aan:
   ```sql
   CREATE DATABASE proefmei CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'hardcups'@'localhost' IDENTIFIED BY 'sterkWachtwoord!';
   GRANT ALL PRIVILEGES ON proefmei.* TO 'hardcups'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```
   > Kies uiteraard een eigen, sterk wachtwoord.
3. De tabellen worden automatisch aangemaakt wanneer de backend voor het eerst start.
   Wil je ze handmatig vullen of opnieuw initialiseren? Voer dan `backend/schema.sql`
   uit met `mysql`.

Configuratie (.env)
-------------------
1. Kopieer het voorbeeldbestand en vul de MySQL-gegevens in:
   ```bash
   cp backend/env.example backend/.env
   nano backend/.env
   ```
2. Pas de volgende regels aan:
   ```dotenv
   DB_BACKEND=mysql
   DB_USER=hardcups
   DB_PASS=sterkWachtwoord!
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_NAME=proefmei
   JWT_SECRET=<kies_een_lang_random_geheim>
   ```
   > Laat `DATABASE_URL` leeg tenzij je liever één complete connectiestring gebruikt.
3. Bewaar het bestand. Het script `start_server.sh` leest deze waarden automatisch in.

Server starten
--------------
Gebruik het meegeleverde opstartscript. Het script maakt (indien nodig) een
virtuele omgeving, installeert Python-packages en start zowel de Flask-backend als
het statische frontend.

```bash
chmod +x start_server.sh        # eenmalig nodig
./start_server.sh
```

Bij de eerste run zie je meldingen zoals:
```
[setup] Creating Python virtual environment in /pad/naar/.venv
[setup] Installing/updating Python dependencies
[setup] Loading environment variables from backend/.env
[backend] Flask API gestart op http://0.0.0.0:5000 (PID ...)
[frontend] Static server opgestart op http://0.0.0.0:8001 (PID ...)
Services draaien. Druk op Enter om te stoppen...
```
Laat het venster open staan zolang de diensten actief moeten blijven. Stoppen doe
je door **Enter** te drukken (of `Ctrl+C`).

Handige variabelen
------------------
Je kunt gedrag van het script sturen met omgevingsvariabelen:

| Variabele          | Standaard | Beschrijving                                                |
|--------------------|-----------|-------------------------------------------------------------|
| `BACKEND_HOST`     | `0.0.0.0` | Netwerkinterface waarop Flask luistert.                    |
| `BACKEND_PORT`     | `5000`    | Poort voor de API.                                          |
| `FRONTEND_HOST`    | `0.0.0.0` | Netwerkinterface voor de statische server.                 |
| `FRONTEND_PORT`    | `8001`    | Poort voor de frontend.                                    |
| `VENV_DIR`         | `.venv`   | Locatie van de virtuele Python-omgeving.                   |
| `PYTHON_BIN`       | `python3` | Alternatieve Python-binary (bv. `/usr/bin/python3.11`).    |
| `ENV_FILE`         | `backend/.env` | Pad naar het configuratiebestand.                    |
| `SKIP_PIP_INSTALL` | `0`       | Zet op `1` wanneer packages reeds geïnstalleerd zijn.      |

Voorbeeld voor aangepaste poorten:
```bash
BACKEND_PORT=5050 FRONTEND_PORT=9000 ./start_server.sh
```

Server automatisch laten draaien
--------------------------------
Voor productie wil je de diensten waarschijnlijk als achtergrondproces of systemd
service draaien. Een eenvoudig systemd-unitbestand (bijvoorbeeld `/etc/systemd/system/hardcups.service`):

```ini
[Unit]
Description=HardCups Flask + Frontend
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/pad/naar/Hardcups-Final
Environment="BACKEND_HOST=0.0.0.0"
Environment="FRONTEND_HOST=0.0.0.0"
ExecStart=/bin/bash -lc '/pad/naar/Hardcups-Final/start_server.sh'
Restart=on-failure
User=<jouw-gebruiker>

[Install]
WantedBy=multi-user.target
```

Activeer de service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hardcups.service
```

Logs bekijken:
```bash
journalctl -u hardcups.service -f
```

Extra tips
----------
- **Firewall**: open poorten 5000 (API) en 8001 (frontend) of stel een reverse proxy
  (bijvoorbeeld Nginx) in die naar deze poorten doorstuurt.
- **SSL/HTTPS**: zet bijvoorbeeld Caddy of Nginx + Certbot voor de applicatie voor
  een versleutelde verbinding.
- **Database back-ups**: gebruik `mysqldump` of een beheertool om regelmatig backups
  te maken.
- **Admin-login**: standaardgebruiker `Tebbensj` met wachtwoord `Proefmei2026!`.
  Wijzig het wachtwoord via de database of voeg een eigen admin toe voor productie.
- **Environment updates**: voer `git pull` uit om nieuwe versies binnen te halen en
  start de service opnieuw (`systemctl restart hardcups.service`).

Veel succes met het draaien van HardCups op je Starto VPS!
