<#
.SYNOPSIS
  Launches backend (port 8000) + Flask UI (port 3000) locally on Windows.
.EXAMPLE
  .\scripts\run.ps1
#>

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $RepoRoot

$VenvDir = "venv"
if (-not (Test-Path $VenvDir)) {
    Write-Error "venv not found. Run: .\scripts\setup.ps1"
}
. (Join-Path $VenvDir "Scripts\Activate.ps1")

Write-Host "→ Starting FastAPI backend on http://localhost:8000" -ForegroundColor Cyan
$backend = Start-Process -PassThru -NoNewWindow -FilePath "uvicorn" `
    -ArgumentList "app.main:app","--host","0.0.0.0","--port","8000","--log-level","info" `
    -WorkingDirectory "$RepoRoot\backend"

Start-Sleep -Seconds 3

Write-Host "→ Starting Flask UI on http://localhost:3000" -ForegroundColor Cyan
$env:BACKEND_URL = "http://localhost:8000"
$frontend = Start-Process -PassThru -NoNewWindow -FilePath "python" `
    -ArgumentList "app.py" `
    -WorkingDirectory "$RepoRoot\flask_frontend"

@"

════════════════════════════════════════════════════════════
  UI:       http://localhost:3000
  API:      http://localhost:8000/api/health
  Docking:  http://localhost:3000/docking
  Ctrl-C to stop both servers
════════════════════════════════════════════════════════════
"@ | Write-Host

try   { Wait-Process -Id $backend.Id, $frontend.Id }
finally {
    Get-Process -Id $backend.Id, $frontend.Id -ErrorAction SilentlyContinue | Stop-Process -Force
}
