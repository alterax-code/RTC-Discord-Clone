# ============================================================
# RTC — Lance le serveur puis les tests automatiquement
# Usage : .\run_tests.ps1
# ============================================================

$ServerDir = Split-Path -Parent $PSScriptRoot
if ((Split-Path -Leaf $PSScriptRoot) -ne "server") {
    $ServerDir = Join-Path $PSScriptRoot "server"
}

Write-Host ""
Write-Host "🚀 Démarrage du serveur en arrière-plan..." -ForegroundColor Cyan

# Lancer cargo run en arrière-plan
$job = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    cargo run 2>&1
} -ArgumentList $ServerDir

# Attendre que le serveur soit prêt (poll sur /health)
Write-Host "⏳ Attente du serveur sur localhost:3001..." -ForegroundColor Yellow
$ready = $false
$attempts = 0
while (-not $ready -and $attempts -lt 30) {
    Start-Sleep -Seconds 2
    $attempts++
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 1 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true }
    } catch {}
    Write-Host "  ... tentative $attempts/30" -ForegroundColor DarkGray
}

if (-not $ready) {
    Write-Host "❌ Serveur non disponible après 60s" -ForegroundColor Red
    Stop-Job $job; Remove-Job $job
    exit 1
}

Write-Host "✅ Serveur prêt !" -ForegroundColor Green
Write-Host ""
Write-Host "🧪 Lancement des tests..." -ForegroundColor Cyan
Write-Host ""

# Lancer les tests
Set-Location $ServerDir
cargo test -- --test-threads=1

$exitCode = $LASTEXITCODE

# Arrêter le serveur
Write-Host ""
Write-Host "🛑 Arrêt du serveur..." -ForegroundColor Yellow
Stop-Job $job
Remove-Job $job

exit $exitCode
