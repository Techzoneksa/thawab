#!/usr/bin/env pwsh
# ================================================================
# deploy.ps1 — Deploy Thawab to Hostinger from local machine
# ================================================================
# Prerequisites:
#   - Windows with OpenSSH Client (ssh.exe, scp.exe)
#   - SSH key or password for Hostinger
#
# Setup:
#   1. Copy `.env.example` to `.env` and fill in:
#      HOSTINGER_SSH_HOST=sxx.example.com
#      HOSTINGER_SSH_USER=u633767125
#
# Usage:
#   .\deploy.ps1          # Build + deploy
#   .\deploy.ps1 -Quick   # Skip build (re-deploy last build)
# ================================================================

param(
    [string]$HostingerHost,
    [string]$HostingerUser,
    [switch]$Quick,
    [switch]$Help
)

if ($Help) {
    Write-Host "Usage: .\deploy.ps1 [-Quick] [-HostingerHost host] [-HostingerUser user]"
    Write-Host ""
    Write-Host "  -Quick          Skip local build, re-deploy last build output"
    Write-Host "  -HostingerHost  SSH host (e.g. sxx.example.com)"
    Write-Host "  -HostingerUser  SSH user (e.g. u633767125)"
    exit 0
}

$Root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$EnvFile = Join-Path $Root ".env"

# Load from .env if exists
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match "^\s*([^#=]+)=(.+)\s*$") {
            $k = $matches[1].Trim()
            $v = $matches[2].Trim()
            Set-Variable -Name $k -Value $v -Scope Script -ErrorAction SilentlyContinue
        }
    }
}

# Use params or env vars or prompt
if (-not $HostingerHost) { $HostingerHost = $env:HOSTINGER_SSH_HOST }
if (-not $HostingerUser) { $HostingerUser = $env:HOSTINGER_SSH_USER }

if (-not $HostingerHost -or -not $HostingerUser) {
    Write-Host "ERROR: Hostinger SSH credentials not configured." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Set in .env file or pass as parameters:"
    Write-Host "    .\deploy.ps1 -HostingerHost sxx.example.com -HostingerUser u633767125"
    Write-Host ""
    Write-Host "  Or set environment variables:"
    Write-Host "    `$env:HOSTINGER_SSH_HOST = 'sxx.example.com'"
    Write-Host "    `$env:HOSTINGER_SSH_USER = 'u633767125'"
    exit 1
}

$RemoteHost = "${HostingerUser}@${HostingerHost}"
$AppDir = "/home/${HostingerUser}/domains/thawab.jaadpro.com/nodejs"
$TempDir = "/tmp/thawab-deploy-$(Get-Date -Format yyyyMMdd-HHmmss)"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Thawab Deploy" -ForegroundColor Cyan
Write-Host "  Target: $RemoteHost" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build
if (-not $Quick) {
    Write-Host "[1/4] Building project..." -ForegroundColor Yellow
    Push-Location $Root
    npm run build 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "BUILD FAILED" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "  Build OK" -ForegroundColor Green
} else {
    Write-Host "[1/4] Skipping build (-Quick)" -ForegroundColor Yellow
}

# Step 2: Verify local build
Write-Host "[2/4] Verifying build output..." -ForegroundColor Yellow
$IndexPath = Join-Path $Root "server\index.mjs"
if (-not (Test-Path $IndexPath)) {
    Write-Host "  ERROR: server/index.mjs not found. Run build first." -ForegroundColor Red
    exit 1
}
$IndexSize = (Get-Item $IndexPath).Length
if ($IndexSize -lt 50000) {
    Write-Host "  ERROR: server/index.mjs too small ($IndexSize bytes)" -ForegroundColor Red
    exit 1
}
Write-Host "  server/index.mjs: $IndexSize bytes" -ForegroundColor Green

$WorkerPath = Join-Path $Root "server\_ssr\libsql-worker.mjs"
if (-not (Test-Path $WorkerPath)) {
    Write-Host "  ERROR: libsql-worker.mjs missing from build output" -ForegroundColor Red
    exit 1
}
Write-Host "  libsql-worker.mjs: OK" -ForegroundColor Green

$DbPath = Join-Path $Root "data\thawab.db"
if (-not (Test-Path $DbPath)) {
    Write-Host "  WARNING: No local DB file found" -ForegroundColor Yellow
}

# Step 3: Upload via SSH
Write-Host "[3/4] Uploading to server..." -ForegroundColor Yellow

# Create temp remote dir and copy files via tar over SSH
ssh "$RemoteHost" "mkdir -p ${TempDir}/server ${TempDir}/public ${TempDir}/data ${TempDir}/scripts" 2>&1 | ForEach-Object { Write-Host "  $_" }

# Use tar over SSH for efficiency
Push-Location $Root
$tarFiles = @(
    "server/index.mjs",
    "server/_runtime.mjs",
    "server/_tanstack-start-manifest_v-*.mjs",
    "server/package.json"
)
# Upload server main files
Get-ChildItem server/*.mjs, server/package.json | ForEach-Object {
    $rel = $_.FullName.Substring($Root.Length + 1)
    Write-Host "    uploading $rel..."
    scp "$($_.FullName)" "${RemoteHost}:${TempDir}/${rel}" 2>&1 | Out-Null
}

# Upload server subdirectories
foreach ($sub in @("_chunks", "_libs", "_ssr", "node_modules")) {
    $src = Join-Path $Root "server" $sub
    if (Test-Path $src) {
        Write-Host "    uploading server/$sub/..."
        & "scp" -r -q "$src" "${RemoteHost}:${TempDir}/server/" 2>&1 | Out-Null
    }
}

# Upload public
if (Test-Path (Join-Path $Root "public\assets")) {
    Write-Host "    uploading public/..."
    & "scp" -r -q (Join-Path $Root "public") "${RemoteHost}:${TempDir}/" 2>&1 | Out-Null
}

# Upload nitro.json
$NitroJson = Join-Path $Root ".output\nitro.json"
if (Test-Path $NitroJson) {
    Write-Host "    uploading nitro.json..."
    scp "$NitroJson" "${RemoteHost}:${TempDir}/nitro.json" 2>&1 | Out-Null
}

# Upload db-init script
$DbInit = Join-Path $Root "scripts\db-init-prod.mjs"
if (Test-Path $DbInit) {
    Write-Host "    uploading scripts/db-init-prod.mjs..."
    scp "$DbInit" "${RemoteHost}:${TempDir}/scripts/db-init-prod.mjs" 2>&1 | Out-Null
}

# Upload deploy-hostinger.sh as well
$DeploySh = Join-Path $Root "scripts\deploy-hostinger.sh"
if (Test-Path $DeploySh) {
    Write-Host "    uploading deploy-hostinger.sh..."
    scp "$DeploySh" "${RemoteHost}:${TempDir}/deploy-hostinger.sh" 2>&1 | Out-Null
}

Pop-Location

Write-Host "  Upload complete" -ForegroundColor Green

# Step 4: Install on server
Write-Host "[4/4] Installing on server..." -ForegroundColor Yellow

$remoteCmd = @"
set -e
echo '  Backing up database...'
mkdir -p ${AppDir}/data/backups

if [ -f '${AppDir}/data/thawab.db' ] && [ -s '${AppDir}/data/thawab.db' ]; then
    cp '${AppDir}/data/thawab.db' '${AppDir}/data/backups/thawab-$(date +%Y%m%d-%H%M%S).db'
fi

echo '  Replacing server files...'
rm -rf ${AppDir}/server ${AppDir}/public ${AppDir}/tmp 2>/dev/null || true
cp -r ${TempDir}/server ${AppDir}/server
cp -r ${TempDir}/public ${AppDir}/public 2>/dev/null || true
cp ${TempDir}/nitro.json ${AppDir}/nitro.json 2>/dev/null || true
mkdir -p ${AppDir}/scripts
cp ${TempDir}/scripts/db-init-prod.mjs ${AppDir}/scripts/ 2>/dev/null || true
cp ${TempDir}/deploy-hostinger.sh ~/deploy-hostinger.sh 2>/dev/null || true

# DB init if needed
if [ ! -f '${AppDir}/data/thawab.db' ] || [ ! -s '${AppDir}/data/thawab.db' ]; then
    echo '  Initializing database...'
    cd ${TempDir}
    # Copy source node_modules for init script
    if [ -f '${AppDir}/scripts/db-init-prod.mjs' ]; then
        cd ${AppDir}
        node scripts/db-init-prod.mjs 2>&1 || echo '  DB init skipped (needs manual)'
    fi
fi

# Verification
echo ''
echo '  === Verification ==='
for f in server/index.mjs server/_ssr/libsql-worker.mjs nitro.json data/thawab.db; do
    if [ -f "${AppDir}/\$f" ]; then
        echo "  OK  \$f (\$(stat -c%s "${AppDir}/\$f" 2>/dev/null || echo '?'))"
    else
        echo "  MISSING  \$f"
    fi
done

# Cleanup
rm -rf ${TempDir}
echo ''
echo '  Deploy complete. App should restart automatically.'
"@

ssh "$RemoteHost" "bash -s" << "$remoteCmd" 2>&1 | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Deploy finished" -ForegroundColor Cyan
Write-Host "  https://thawab.jaadpro.com" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
