[CmdletBinding()]
param(
    [string]$PythonBin,
    [string]$EnvFile
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Log {
    param(
        [Parameter(Mandatory)]
        [string]$Level,
        [Parameter(Mandatory)]
        [string]$Message
    )
    switch ($Level) {
        'setup' { $color = 'Cyan' }
        'backend' { $color = 'Green' }
        'frontend' { $color = 'Yellow' }
        'info' { $color = 'White' }
        'warn' { $color = 'DarkYellow' }
        'shutdown' { $color = 'DarkCyan' }
        default { $color = 'White' }
    }
    Write-Host "[$Level] $Message" -ForegroundColor $color
}

$projectRoot = Split-Path -Parent $PSCommandPath
Set-Location $projectRoot

if (-not $PythonBin) {
    if ($env:PYTHON_BIN) {
        $PythonBin = $env:PYTHON_BIN
    } else {
        $candidate = Get-Command python3 -ErrorAction SilentlyContinue
        if ($candidate) {
            $PythonBin = $candidate.Source
        } else {
            $candidate = Get-Command python -ErrorAction SilentlyContinue
            if ($candidate) {
                $PythonBin = $candidate.Source
            }
        }
    }
}

if (-not $PythonBin) {
    throw "Geen python-interpreter gevonden. Zet PYTHON_BIN of zorg dat python/python3 in PATH staat."
}

$venvDir = if ($env:VENV_DIR) { $env:VENV_DIR } else { Join-Path $projectRoot '.venv' }
if (-not (Test-Path -LiteralPath $venvDir)) {
    Write-Log -Level setup -Message "Virtuele omgeving wordt aangemaakt in $venvDir"
    & $PythonBin -m venv $venvDir
}

$activateScript = Join-Path $venvDir 'Scripts\Activate.ps1'
if (-not (Test-Path -LiteralPath $activateScript)) {
    throw "Kon de activatiescript niet vinden op $activateScript"
}
. $activateScript

$pythonExe = Join-Path $venvDir 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) {
    $pythonExe = (Get-Command python).Source
}

if (-not $pythonExe) {
    throw "Kon het python-commando in de virtuele omgeving niet vinden."
}

if ($env:SKIP_PIP_INSTALL -ne '1') {
    Write-Log -Level setup -Message 'Python dependencies bijwerken (pip install)'
    pip install --upgrade pip
    pip install -r (Join-Path $projectRoot 'backend\requirements.txt')
} else {
    Write-Log -Level setup -Message 'SKIP_PIP_INSTALL=1; pip install wordt overgeslagen'
}

if (-not $EnvFile) {
    if ($env:ENV_FILE) {
        $EnvFile = $env:ENV_FILE
    } else {
        $EnvFile = Join-Path $projectRoot 'backend\.env'
    }
}

if (Test-Path -LiteralPath $EnvFile) {
    Write-Log -Level setup -Message "Environment-variabelen worden geladen uit $EnvFile"
    Get-Content -LiteralPath $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            return
        }
        $pair = $line.Split('=', 2)
        if ($pair.Count -ne 2) {
            return
        }
        $key = $pair[0].Trim()
        $value = $pair[1].Trim()
        Set-Item -Path Env:$key -Value $value
    }
} else {
    Write-Log -Level warn -Message "Geen env-bestand gevonden op $EnvFile (huidige environment wordt gebruikt)"
}

if (-not $env:BACKEND_HOST) { $env:BACKEND_HOST = '0.0.0.0' }
if (-not $env:BACKEND_PORT) { $env:BACKEND_PORT = '5000' }
if (-not $env:FRONTEND_HOST) { $env:FRONTEND_HOST = '0.0.0.0' }
if (-not $env:FRONTEND_PORT) { $env:FRONTEND_PORT = '8001' }
if (-not $env:START_FRONTEND) { $env:START_FRONTEND = '1' }

$backendDir = Join-Path $projectRoot 'backend'
$frontendDir = Join-Path $projectRoot 'frontend'

$backendProcess = $null
$frontendProcess = $null

try {
    Write-Log -Level backend -Message "Start Flask API op http://$($env:BACKEND_HOST):$($env:BACKEND_PORT)"
    $backendProcess = Start-Process -FilePath $pythonExe -ArgumentList @('app.py') -WorkingDirectory $backendDir -NoNewWindow -PassThru

    if ($env:START_FRONTEND -eq '1') {
        Write-Log -Level frontend -Message "Start statische server op http://$($env:FRONTEND_HOST):$($env:FRONTEND_PORT)"
        $frontendProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-m', 'http.server', $env:FRONTEND_PORT, '--bind', $env:FRONTEND_HOST) -WorkingDirectory $frontendDir -NoNewWindow -PassThru
    } else {
        Write-Log -Level frontend -Message 'START_FRONTEND!=1, frontend-server wordt niet gestart'
    }

    Write-Host
    $interactive = $true
    try {
        $null = [Console]::KeyAvailable
    } catch {
        $interactive = $false
    }

    if ($interactive -and -not [Console]::IsInputRedirected) {
        Write-Log -Level info -Message 'Services draaien. Druk op Enter om te stoppen...'
        while ($true) {
            if ($backendProcess.HasExited -or ($frontendProcess -and $frontendProcess.HasExited)) {
                Write-Log -Level warn -Message 'Een van de processen is onverwacht gestopt.'
                break
            }
            if ([Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true)
                if ($key.Key -eq [ConsoleKey]::Enter) {
                    break
                }
            }
            Start-Sleep -Milliseconds 200
        }
    } else {
        Write-Log -Level info -Message 'Geen interactieve console gedetecteerd; wacht tot processen stoppen.'
        if ($frontendProcess) {
            Wait-Process -Id @($backendProcess.Id, $frontendProcess.Id)
        } else {
            Wait-Process -Id $backendProcess.Id
        }
    }
}
finally {
    Write-Host
    Write-Log -Level shutdown -Message 'Services worden gestopt'
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        try {
            Stop-Process -Id $frontendProcess.Id -ErrorAction Stop
            Wait-Process -Id $frontendProcess.Id -ErrorAction SilentlyContinue
        } catch {
            Write-Log -Level warn -Message "Kon frontend-proces niet stoppen: $($_.Exception.Message)"
        }
    }
    if ($backendProcess -and -not $backendProcess.HasExited) {
        try {
            Stop-Process -Id $backendProcess.Id -ErrorAction Stop
            Wait-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue
        } catch {
            Write-Log -Level warn -Message "Kon backend-proces niet stoppen: $($_.Exception.Message)"
        }
    }
    Write-Log -Level shutdown -Message 'Klaar'
}
