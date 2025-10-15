HardCups hostinghandleiding (Linux webhosting + MySQL)
=====================================================

Overzicht
---------
Dit document beschrijft hoe je het HardCups-project kunt draaien op een
Linux-gebaseerde **webhostingomgeving** (shared of managed hosting) waar je via SSH
toegang hebt en een MySQL-database kunt gebruiken. De stappen zijn opgesplitst in
voorbereiding, database, configuratie, starten en beheer.

Uitgangspunten
--------------
- Je hostingpakket biedt SSH-toegang en staat toe dat je zelf een Python-applicatie
  met een eigen virtuele omgeving start.
- Python 3.10 of hoger en `pip` zijn beschikbaar (controleer met `python3 --version`
  en `pip3 --version`).
- MySQL-gegevens (host, databasenaam, gebruikersnaam, wachtwoord) krijg je van je
  hostingprovider of maak je zelf aan via het controlepaneel.

**Benodigde schijfruimte**

- Repository + configuratiebestanden: ±1 MB.
- Python-virtualenv (incl. dependencies zoals Flask, SQLAlchemy, ReportLab en NFCpy):
  reken op 400–500 MB na installatie.
- MySQL-database: reserveer minstens 1 GB voor data en back-ups (of volg het advies
  van je hostingprovider).

> **Totaaladvies**: zorg voor minimaal 3 GB vrije ruimte in je webhostingpakket, zo
> heb je marge voor logbestanden en toekomstige groei.

Voorbereiding hostingomgeving
-----------------------------
1. **Verbind via SSH**
   ```bash
   ssh <hosting-gebruiker>@<domein-of-ip>
   ```
2. **Kies een map in je home-directory**
   ```bash
   mkdir -p ~/apps
   cd ~/apps
   ```
3. **Repository plaatsen**
   - Optie A: klonen via Git
     ```bash
     git clone https://github.com/<jouw-account>/Hardcups-Final.git
     cd Hardcups-Final
     ```
   - Optie B: upload een ZIP vanuit je lokale machine en pak deze uit:
     ```bash
     unzip Hardcups-Final.zip -d ~/apps
     cd Hardcups-Final
     ```
4. **Controleer Python en pip**
   ```bash
   python3 --version
   pip3 --version
   ```
   > Werkt dit niet? Raadpleeg de documentatie van je hostingprovider hoe je Python
   > activeert (sommige pakketten vereisen `python` in plaats van `python3`).

MySQL-database koppelen
-----------------------
1. Maak in het controlepaneel een database en gebruiker aan, of noteer de gegevens
   van een bestaande database. Typisch krijg je iets als:
   - **Host**: `mysql.<provider>.nl` of `localhost`
   - **Poort**: `3306`
   - **Database**: `u123456_hardcups`
   - **Gebruiker**: `u123456_hardcups`
   - **Wachtwoord**: door jou ingesteld
2. Test de connectie via de shell (optioneel):
   ```bash
   mysql -h <db-host> -u <db-gebruiker> -p<db-wachtwoord> <db-naam>
   ```
   > Sommige hosts vereisen een spatie tussen `-p` en het wachtwoord. Volg hun
   > handleiding als bovenstaande niet werkt.
3. De HardCups-backend maakt de tabellen automatisch bij de eerste start. Wil je een
   schone structuur forceren, voer dan (met jouw waarden) uit:
   ```bash
   mysql -h <db-host> -u <db-gebruiker> -p<db-wachtwoord> <db-naam> < backend/schema.sql
   ```

Configuratie (.env)
-------------------
1. Kopieer het voorbeeldbestand:
   ```bash
   cp backend/env.example backend/.env
   nano backend/.env
   ```
2. Vul je hostinggegevens in:
   ```dotenv
   DB_BACKEND=mysql
   DB_USER=u123456_hardcups
   DB_PASS=<jouw_wachtwoord>
   DB_HOST=mysql.<provider>.nl
   DB_PORT=3306
   DB_NAME=u123456_hardcups
   JWT_SECRET=<kies_een_lang_random_geheim>
   ```
   > Laat `DATABASE_URL` leeg tenzij je liever één connectiestring gebruikt. Bewaar
   > het bestand en sluit de editor.
3. Optioneel: pas poorten aan als je hostingprovider specifieke poorten voor
   applicaties voorschrijft (zie tabel verderop).

Applicatie starten
------------------
Gebruik het opstartscript. Het script maakt (indien nodig) een virtuele omgeving,
installeert dependencies en start backend + statische frontend.

```bash
chmod +x start_server.sh        # eenmalig nodig
./start_server.sh
```

Tijdens de eerste run zie je bijvoorbeeld:
```
[setup] Creating Python virtual environment in /home/<user>/apps/Hardcups-Final/.venv
[setup] Installing/updating Python dependencies
[setup] Loading environment variables from backend/.env
[backend] Flask API gestart op http://0.0.0.0:5000 (PID ...)
[frontend] Static server opgestart op http://0.0.0.0:8001 (PID ...)
Services draaien. Druk op Enter om te stoppen...
```

Laat de sessie open zolang de app actief moet blijven. Wil je uitloggen maar de
processen actief houden, gebruik dan een tool zoals `screen` of `tmux`, of start het
script met `nohup`:

```bash
nohup ./start_server.sh >/home/<user>/logs/hardcups.log 2>&1 &
```

> **Let op:** bij sommige hostingpakketten worden processen die HTTP-poorten open
> zetten na verloop van tijd automatisch gestopt. Controleer de voorwaarden van je
> provider of gebruik hun aanbevolen applicatieplatform (bijvoorbeeld Passenger,
> Gunicorn of een Python-app wizard) en laat dat platform naar `backend/app.py`
> wijzen. De vereiste omgeving blijft hetzelfde.

Handige variabelen
------------------
Je kunt gedrag van het script sturen met omgevingsvariabelen:

| Variabele          | Standaard | Beschrijving                                                |
|--------------------|-----------|-------------------------------------------------------------|
| `BACKEND_HOST`     | `0.0.0.0` | Interface waarop Flask luistert. Kies `127.0.0.1` als alleen interne toegang nodig is. |
| `BACKEND_PORT`     | `5000`    | Poort voor de API. Pas aan als je provider een andere poort vereist. |
| `FRONTEND_HOST`    | `0.0.0.0` | Interface voor de statische server.                         |
| `FRONTEND_PORT`    | `8001`    | Poort voor de frontend.                                     |
| `VENV_DIR`         | `.venv`   | Locatie van de virtuele Python-omgeving.                    |
| `PYTHON_BIN`       | `python3` | Alternatieve Python-binary (bv. `/usr/local/bin/python3.11`). |
| `ENV_FILE`         | `backend/.env` | Pad naar het configuratiebestand.                     |
| `SKIP_PIP_INSTALL` | `0`       | Zet op `1` wanneer packages reeds geïnstalleerd zijn.       |

Voorbeeld met aangepaste poorten:
```bash
BACKEND_PORT=5050 FRONTEND_PORT=9000 ./start_server.sh
```

App laten doorlopen
-------------------
- **screen/tmux**: start `screen`, voer `./start_server.sh` uit en detach met
  `Ctrl+A` → `D`. Herverbind later met `screen -r`.
- **nohup**: zoals hierboven getoond, zodat het proces actief blijft na uitloggen.
- **Cron @reboot**: sommige hosts bieden een "scheduled task" of "cron job" die je
  bij elke herstart kunt laten uitvoeren:
  ```
  @reboot /bin/bash -lc 'cd ~/apps/Hardcups-Final && ./start_server.sh'
  ```
  Controleer of je hostingprovider `@reboot` ondersteunt.

Extra tips
----------
- **Domeinkoppeling**: gebruik een reverse proxy of de applicatie-configuratie van je
  host om verkeer naar de poort van de backend of de statische frontend te sturen.
- **SSL/HTTPS**: veel providers bieden Let's Encrypt-integratie. Richt je domein naar
  de proxy/poorten van de app om HTTPS te activeren.
- **Database back-ups**: maak regelmatig exports via phpMyAdmin of `mysqldump`.
- **Admin-login**: standaardgebruiker `Tebbensj` met wachtwoord `Proefmei2026!`.
  Wijzig dit in de database of voeg een eigen admin toe voordat je live gaat.
- **Updates**: haal nieuwe versies binnen met `git pull` (of upload opnieuw) en
  herstart daarna de applicatie.

Veel succes met het hosten van HardCups op je webhostingpakket!
