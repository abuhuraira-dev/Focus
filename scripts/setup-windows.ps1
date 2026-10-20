$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 LTS, then restart PowerShell.' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Install Git for Windows, then restart PowerShell.' }
$focusPath = 'C:\Solopreneur\Focus'
if (-not (Test-Path $focusPath)) {
  New-Item -ItemType Directory -Force 'C:\Solopreneur' | Out-Null
  git clone https://github.com/abuhuraira-dev/Focus.git $focusPath
  if ($LASTEXITCODE -ne 0) { throw 'Git clone failed.' }
}
Set-Location $focusPath
if (-not (Test-Path 'package.json')) { throw 'This folder is not a Focus checkout. Existing files were left unchanged.' }
if (-not (Test-Path '.env.local')) { Copy-Item '.env.example' '.env.local' }
npm.cmd install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
Write-Host "Ready at $focusPath. Configure .env.local for optional cloud sync."
Write-Host 'Run: npm.cmd run dev'
