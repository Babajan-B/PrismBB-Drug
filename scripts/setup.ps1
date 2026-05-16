<#
.SYNOPSIS
  PrismBB Drug — bootstrap script (Windows / PowerShell).

.DESCRIPTION
  Creates a Python venv, installs all dependencies, and prints next-steps.
  Run from the repo root:    .\scripts\setup.ps1

.NOTES
  Requires Python 3.10+ on PATH.  If `python` doesn't resolve, install from
  https://python.org or use `py -3.13 -m venv venv` manually.
#>

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $RepoRoot

# ---- 1. find Python ---------------------------------------------------------
$Python = "python"
try { & $Python --version | Out-Null } catch {
    Write-Error "Python not found. Install Python 3.10+ from https://python.org and re-run."
}

$PyVer = & $Python -c "import sys; print('%d.%d' % sys.version_info[:2])"
Write-Host "→ Using Python $PyVer"
$ok = & $Python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
if ($LASTEXITCODE -ne 0) { Write-Error "Python 3.10+ required (have $PyVer)." }

# ---- 2. create / reuse venv -------------------------------------------------
$VenvDir = "venv"
if (-not (Test-Path $VenvDir)) {
    Write-Host "→ Creating venv at $VenvDir"
    & $Python -m venv $VenvDir
}
$Activate = Join-Path $VenvDir "Scripts\Activate.ps1"
. $Activate

# ---- 3. install requirements ------------------------------------------------
pip install --upgrade pip
Write-Host "→ Installing dependencies (this may take a few minutes — torch is large)"
pip install -r requirements.txt

# ---- 4. detect Vina ---------------------------------------------------------
Write-Host ""
$VinaPath = (Get-Command vina -ErrorAction SilentlyContinue)
if ($VinaPath) {
    Write-Host "✓ AutoDock Vina detected at $($VinaPath.Source)" -ForegroundColor Green
    Write-Host "  Real docking is enabled."
} else {
    Write-Host "⚠  AutoDock Vina not found on PATH — docking will run in STUB mode." -ForegroundColor Yellow
    Write-Host "  Recommended with Conda/Miniforge:"
    Write-Host "      conda install -c conda-forge vina"
    Write-Host "  Download the Windows binary from:"
    Write-Host "      https://vina.scripps.edu/downloads/"
    Write-Host "  Unzip, then add the folder containing vina.exe to your PATH"
    Write-Host "  (or copy vina.exe into the project venv's Scripts\ directory)."
}

# ---- 5. friendly hint -------------------------------------------------------
@"

╔════════════════════════════════════════════════════════════════════════╗
║  Setup complete.                                                       ║
║                                                                        ║
║  Activate the env:                                                     ║
║      .\venv\Scripts\Activate.ps1                                       ║
║                                                                        ║
║  Run the backend:                                                      ║
║      cd backend; uvicorn app.main:app --reload --port 8000             ║
║                                                                        ║
║  Run the Flask UI (in another PowerShell):                             ║
║      cd flask_frontend; python app.py                                  ║
║                                                                        ║
║  Open:  http://localhost:3000                                          ║
╚════════════════════════════════════════════════════════════════════════╝
"@ | Write-Host
