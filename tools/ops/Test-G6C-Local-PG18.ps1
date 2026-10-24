# PowerShell 5.1 local-only G6C SQL integration. No staging connection.
# Execute ONLY on existing LOCAL PostgreSQL 18 restore DB with explicit consent.
param(
    [string]$Database = 'rental_restore_20261020_112826',
    [string]$DbUser = 'postgres',
    [switch]$ExecuteLocal,
    [switch]$ApproveTemporaryScratchSchema
)
$ErrorActionPreference = 'Stop'
if (-not $ExecuteLocal) {
    & node '.\tools\backend\run-phase34-g6c-local-pg18.mjs' '--plan'
    if ($LASTEXITCODE -ne 0) { throw 'G6C plan check failed' }
    return
}
if (-not $ApproveTemporaryScratchSchema) {
    throw 'Explicit -ApproveTemporaryScratchSchema is required to execute local DDL'
}
if ($Database -notmatch '^rental_(staging_)?restore_\d{8}(_\d{6})?$') {
    throw 'Only an existing named LOCAL restore database is permitted'
}
if ($DbUser -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
    throw 'Invalid local PostgreSQL user'
}
$secret = Read-Host 'Local PostgreSQL password (hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $encoded = [Uri]::EscapeDataString($plain)
    $env:G6C_LOCAL_RESTORE_DATABASE_URL = 'postgresql://' + $DbUser + ':' + $encoded + '@127.0.0.1:5432/' + $Database
    $env:G6C_CONFIRM_LOCAL_SCHEMA = 'I_APPROVE_EXISTING_LOCAL_RESTORE_SCRATCH_SCHEMA'
    # Avoid leaking any sensitive URL to stdout, history, or log files.
    $plain = $null
    $encoded = $null
    & node '.\tools\backend\run-phase34-g6c-local-pg18.mjs' '--execute-local' '--allow-temporary-schema'
    if ($LASTEXITCODE -ne 0) { throw 'G6C LOCAL PG18 integration failed; inspect sanitized error above' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    Remove-Item Env:G6C_LOCAL_RESTORE_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:G6C_CONFIRM_LOCAL_SCHEMA -ErrorAction SilentlyContinue
}
