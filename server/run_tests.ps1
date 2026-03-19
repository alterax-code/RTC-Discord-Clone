# run_tests.ps1 - Lance les tests integration RTC
# Usage: powershell -ExecutionPolicy Bypass -File .\run_tests.ps1

$ErrorActionPreference = "Stop"

Write-Host "`nRTC - Test Runner" -ForegroundColor Cyan
Write-Host "========================`n"

# 1. Tuer tout processus serveur existant
Write-Host "Arret du serveur..." -ForegroundColor Yellow
Get-Process -Name "server" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# 2. Compiler tout (serveur + tests)
Write-Host "Compilation..." -ForegroundColor Yellow
cargo build --tests 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erreur de compilation!" -ForegroundColor Red
    exit 1
}
Write-Host "Compilation OK`n" -ForegroundColor Green

# 3. Lancer le serveur en arriere-plan
Write-Host "Demarrage du serveur..." -ForegroundColor Yellow
$serverProcess = Start-Process -FilePath ".\target\debug\server.exe" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3

# Verifier que le serveur repond
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "Serveur OK sur :3001`n" -ForegroundColor Green
} catch {
    Write-Host "Le serveur ne repond pas sur :3001" -ForegroundColor Red
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

# 4. Lancer les tests
Write-Host "Lancement des tests...`n" -ForegroundColor Yellow
cargo test -- --test-threads=1 --nocapture 2>&1
$testResult = $LASTEXITCODE

# 5. Arreter le serveur
Write-Host "`nArret du serveur..." -ForegroundColor Yellow
Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 6. Resultat
if ($testResult -eq 0) {
    Write-Host "`nTOUS LES TESTS PASSENT !" -ForegroundColor Green
} else {
    Write-Host "`nCertains tests ont echoue (code: $testResult)" -ForegroundColor Red
}

Write-Host ""
exit $testResult
