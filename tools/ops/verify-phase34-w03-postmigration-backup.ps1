param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][0-9]{3,}$')]
    [string]$BackupId
)

$App = 'notebook-rental-api-staging-01'
$LocalBase = 'E:\project\rental-system\_local-backup-validation\w03'

Set-StrictMode -Version Latest
# Native Heroku CLI emits update warnings on stderr; validate exit codes explicitly.
$ErrorActionPreference = 'Continue'

$historical = @('a004', 'b003', 'a002', 'b001')
if ($historical -contains $BackupId) {
    throw "Backup $BackupId is pre-migration 043; select a genuinely new Completed backup."
}

foreach ($tool in @('heroku', 'pg_restore')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Required local command is missing: $tool"
    }
}

Write-Host "[1/5] Querying Heroku Staging backup metadata ($App)"
$listing = (& heroku pg:backups -a $App 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Heroku backup listing failed; no files downloaded.' }
$line = @($listing -split "`r?`n" | Where-Object { $_ -match "(?<!\S)$([regex]::Escape($BackupId))\s+" }) | Select-Object -First 1
if (-not $line) { throw "Backup $BackupId is not in the listing; do not guess IDs." }
if ($line -notmatch '\bCompleted\b') { throw "Backup $BackupId is not Completed; abort." }
Write-Host $line.Trim()

$targetDir = Join-Path $LocalBase $BackupId
$dump = Join-Path $targetDir 'latest.dump'
if ((Test-Path $dump)) {
    Write-Host "[2/5] Using existing local archive: $dump"
} else {
    New-Item -ItemType Directory -Path $targetDir -Force -ErrorAction Stop | Out-Null
    Push-Location $targetDir
    try {
        Write-Host '[2/5] Downloading specific completed backup into local-only folder'
        & heroku pg:backups:download $BackupId -a $App
        if ($LASTEXITCODE -ne 0) { throw 'Download failed.' }
    } finally { Pop-Location }
    if (-not (Test-Path $dump)) { throw "Archive missing after download: $dump" }
}

Write-Host '[3/5] Archive hash and TOC structure'
$sha = (Get-FileHash -Path $dump -Algorithm SHA256 -ErrorAction Stop).Hash
$toc = (& pg_restore --list $dump 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Archive TOC could not be read.' }
if ($toc -notmatch '\bTABLE\s+public\s+app_device_trust_operations\b') {
    throw 'Required migration 043 table app_device_trust_operations is absent from TOC.'
}
Write-Host "SHA256: $sha"
Write-Host 'Migration 043 table: PRESENT'

Write-Host '[4/5] Fully generate SQL to Windows null device without connecting to a database'
& pg_restore --file NUL $dump
if ($LASTEXITCODE -ne 0) { throw 'Archive SQL generation failed.' }

Write-Host '[5/5] W03 read-only postmigration backup check PASS'
Write-Host "BackupId: $BackupId"
Write-Host "File: $dump"
Write-Host "Bytes: $((Get-Item $dump).Length)"
Write-Host "SHA256: $sha"
Write-Host 'NOT an isolated database restore; AC-S04 still unaccepted.'
