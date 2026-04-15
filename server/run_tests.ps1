taskkill /F /IM server.exe 2>$null
cd C:\Users\lucas\Desktop\T-DEV-600-PAR_24\server
cargo build 2>&1 | Select-Object -Last 3
$server = Start-Process -FilePath ".\target\debug\server.exe" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5
Write-Host "Serveur PID: $($server.Id)" -ForegroundColor Green
cargo test -- --test-threads=1
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
Write-Host "Termine" -ForegroundColor Green