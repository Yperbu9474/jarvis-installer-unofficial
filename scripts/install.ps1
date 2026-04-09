$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:JARVIS_INSTALLER_REPO_URL) { $env:JARVIS_INSTALLER_REPO_URL } else { "https://github.com/Yperbu9474/jarvis-installer-unofficial.git" }
$InstallDir = if ($env:JARVIS_INSTALLER_DIR) { $env:JARVIS_INSTALLER_DIR } else { Join-Path $HOME ".jarvis-installer-unofficial" }

Write-Host "Jarvis Installer (unofficial)" -ForegroundColor Cyan

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "git is required"
}

if (Test-Path (Join-Path $InstallDir ".git")) {
  git -C $InstallDir pull --ff-only
} else {
  git clone $RepoUrl $InstallDir
}

Set-Location $InstallDir

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required"
}

npm install
npm run build

Write-Host "Installer sources are ready in $InstallDir"
Write-Host "To build the Windows package: npm run dist:win"
