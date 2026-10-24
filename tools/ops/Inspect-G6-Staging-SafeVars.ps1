# Phase34 G6-B: LOCAL, read-only Heroku configuration sanity check.
# Never prints API key or allowlisted recipient email. No writes or mail calls.
param([string]$App = 'notebook-rental-api-staging-01')
$ErrorActionPreference = 'Stop'
if ($App -ne 'notebook-rental-api-staging-01') { throw 'Only the approved Staging Heroku app is permitted.' }
if (-not (Get-Command heroku -ErrorAction SilentlyContinue)) { throw 'Heroku CLI is required.' }
function Read-Var([string]$Name) {
    $result = & heroku 'config:get' $Name '-a' $App 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Failed to read $Name" }
    return (($result | Out-String).Trim())
}
$envName = Read-Var 'APP_ENV'
$enabled = Read-Var 'MAIL_ENABLED'
$provider = Read-Var 'MAIL_PROVIDER'
$sender = Read-Var 'MAIL_FROM_ADDRESS'
$domain = Read-Var 'MAIL_DOMAIN_VERIFIED'
$g5 = Read-Var 'P108_G5_OWNER_READONLY_ENABLED'
$g6 = Read-Var 'P108_G6_SANDBOX_READINESS_ENABLED'
$results = @(
    @{ Item = 'APP_ENV Staging'; Pass = ($envName -eq 'staging') },
    @{ Item = 'Application mail OFF'; Pass = ($enabled -eq '' -or $enabled -eq 'false') },
    @{ Item = 'G5 owner probe OFF'; Pass = ($g5 -eq '' -or $g5 -eq 'false') },
    @{ Item = 'G6 readiness probe OFF'; Pass = ($g6 -eq '' -or $g6 -eq 'false') },
    @{ Item = 'Brevo provider configured'; Pass = ($provider -eq 'brevo') },
    @{ Item = 'Sender configured'; Pass = ($sender -eq 'noreply@mail.notebook.recruit.kro.kr') },
    @{ Item = 'Domain verified operator claim'; Pass = ($domain -eq 'true') }
)
foreach ($result in $results) {
    $status = if ($result.Pass) { 'PASS' } else { 'NOT READY' }
    Write-Host "$status $($result.Item)"
}
Write-Host 'BREVO_API_KEY: not inspected or printed (use authenticated G6 readiness API Boolean status).'
Write-Host 'MAIL_STAGING_ALLOWLIST: not inspected or printed (use G6 readiness API count).'
Write-Host 'Actual Brevo account/sender state: must be independently reviewed in Brevo console.'
Write-Host 'Live vendor attempts=0 by this script; no Heroku settings changed.'
if ($results[0..3].Where({-not $_.Pass}).Count -gt 0) { throw 'Staging basic safety prerequisites FAILED.' }
