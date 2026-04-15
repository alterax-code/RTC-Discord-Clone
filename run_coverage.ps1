taskkill /F /IM server.exe 2>$null
Start-Sleep -Seconds 2
cd C:\Users\lucas\Desktop\T-DEV-600-PAR_24\server
Write-Host "=== Build ===" -ForegroundColor Yellow
cargo build 2>&1 | Select-Object -Last 3
cargo test --no-run 2>&1 | Select-Object -Last 3
Write-Host "=== Lancement serveur ===" -ForegroundColor Yellow
$server = Start-Process -FilePath ".\target\debug\server.exe" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5
Write-Host "Serveur PID: $($server.Id)" -ForegroundColor Green
Write-Host "=== Tarpaulin ===" -ForegroundColor Yellow
cargo tarpaulin --out Html --output-dir . --skip-clean 2>&1
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
Write-Host "=== Termine ===" -ForegroundColor Green
