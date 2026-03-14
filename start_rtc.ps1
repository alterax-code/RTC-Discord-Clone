# ============================================================
#  RTC - Script de lancement complet
#  Usage : powershell -ExecutionPolicy Bypass -File .\start_rtc.ps1
# ============================================================

$RootDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = "$RootDir\server"
$ClientDir = "$RootDir\client"
$ServerExe = "$ServerDir\target\release\server.exe"

function Write-Title { param($msg)
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
}
function Write-Step { param($msg) Write-Host "`n>> $msg"         -ForegroundColor Yellow }
function Write-Ok   { param($msg) Write-Host "   [OK] $msg"     -ForegroundColor Green }
function Write-Fail { param($msg) Write-Host "   [ERREUR] $msg" -ForegroundColor Red ; exit 1 }
function Write-Info { param($msg) Write-Host "   $msg"          -ForegroundColor Gray }

function Kill-Port { param($port)
    $lines = netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
    foreach ($line in $lines) {
        $pidNum = ($line.ToString().Trim() -split '\s+')[-1]
        if ($pidNum -match '^\d+$') {
            Stop-Process -Id ([int]$pidNum) -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 600
}

function Wait-Url { param($url, $maxSec = 40)
    Write-Info "Attente de $url ..."
    for ($i = 0; $i -lt $maxSec; $i++) {
        Start-Sleep -Seconds 1
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($r.StatusCode -lt 500) { return $true }
        } catch {}
    }
    return $false
}

function Start-ServerProc { param($visible = $false)
    Kill-Port 3001
    $style = if ($visible) { "Normal" } else { "Hidden" }
    # -WorkingDirectory est suffisant pour que le .env soit trouve
    $proc = Start-Process `
        -FilePath $ServerExe `
        -WorkingDirectory $ServerDir `
        -PassThru `
        -WindowStyle $style
    Write-Info "Serveur demarre (PID: $($proc.Id))"
    return $proc
}

# ============================================================
#  PHASE 1 — TESTS
# ============================================================
Write-Title "PHASE 1 : TESTS"

# 1/4 — Build
Write-Step "1/4 - cargo build --release"
Set-Location $ServerDir
cargo build --release
if ($LASTEXITCODE -ne 0) { Write-Fail "Build echoue !" }
Write-Ok "Build OK"

# 2/4 — Serveur de test (visible pour voir les erreurs)
Write-Step "2/4 - Demarrage serveur de test (port 3001)"
$testServer = Start-ServerProc -visible $true

$ready = Wait-Url "http://127.0.0.1:3001/health" 40
if (-not $ready) {
    Stop-Process -Id $testServer.Id -Force -ErrorAction SilentlyContinue
    Kill-Port 3001
    Write-Fail "Serveur de test non accessible. Verifiez la fenetre du serveur pour l'erreur."
}
Write-Ok "Serveur pret sur http://localhost:3001"

# 3/4 — Tests
Write-Step "3/4 - cargo test -- --test-threads=1"
Set-Location $ServerDir
cargo test -- --test-threads=1
$testCode = $LASTEXITCODE

# 4/4 — Arrêt serveur de test
Write-Step "4/4 - Arret du serveur de test"
Stop-Process -Id $testServer.Id -Force -ErrorAction SilentlyContinue
Kill-Port 3001
Start-Sleep -Seconds 1
Write-Ok "Serveur de test arrete"

if ($testCode -ne 0) { Write-Fail "Des tests ont echoue. Corrigez avant de continuer." }
Write-Ok "Tous les tests sont passes !"

# ============================================================
#  PHASE 2 — LANCEMENT APPLICATION
# ============================================================
Write-Title "PHASE 2 : LANCEMENT APPLICATION"

# 1/3 — Backend
Write-Step "1/3 - Demarrage du backend (port 3001)"
$backendProc = Start-ServerProc -visible $true
$ready = Wait-Url "http://127.0.0.1:3001/health" 40
if (-not $ready) {
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    Write-Fail "Backend non accessible."
}
Write-Ok "Backend pret sur http://localhost:3001"

# 2/3 — Frontend
Write-Step "2/3 - Demarrage du frontend Next.js (port 3000)"
Kill-Port 3000
$frontendProc = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", "cd /d `"$ClientDir`" && npm run dev" `
    -PassThru `
    -WindowStyle Normal

Write-Info "Frontend demarre (PID: $($frontendProc.Id))"
$ready = Wait-Url "http://127.0.0.1:3000" 60
if (-not $ready) {
    Stop-Process -Id $backendProc.Id  -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
    Write-Fail "Frontend non accessible."
}
Write-Ok "Frontend pret sur http://127.0.0.1:3000"

# 3/3 — Navigateur
Write-Step "3/3 - Ouverture du navigateur"
Start-Process "http://127.0.0.1:3000"
Write-Ok "Navigateur ouvert !"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  RTC tourne !" -ForegroundColor Green
Write-Host "  Frontend : http://127.0.0.1:3000" -ForegroundColor White
Write-Host "  Backend  : http://localhost:3001" -ForegroundColor White
Write-Host "  Ctrl+C pour tout arreter" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Green

try {
    while ($true) { Start-Sleep -Seconds 5 }
} finally {
    Write-Host "`nArret..." -ForegroundColor Yellow
    Stop-Process -Id $backendProc.Id  -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
    Kill-Port 3001
    Kill-Port 3000
    Write-Ok "Tout arrete."
}
