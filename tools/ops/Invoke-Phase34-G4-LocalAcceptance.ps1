# Phase34 G4 LOCAL restore acceptance, PowerShell 5.1 native stderr hotfix.
# This runner does not connect to remote DBs and does not send emails.
# The Node runner remains responsible for validating localhost, restore DB name,
# approval, temporary schema isolation, PostgreSQL assertions and cleanup.
[CmdletBinding()]
param([switch]$ExecuteLocal)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$entry = Join-Path $root 'tools\backend\run-phase34-p1-08-d06d2b-g4-local.mjs'
if (-not (Test-Path -LiteralPath $entry)) { throw 'G4 runner file was not found.' }
Push-Location $root
try {
    if (-not $ExecuteLocal) {
        & node $entry --plan
        if ($LASTEXITCODE -ne 0) { throw 'G4 plan failed.' }
        return
    }
    if ([string]::IsNullOrWhiteSpace($env:G4_LOCAL_RESTORE_DATABASE_URL)) {
        throw 'Set G4_LOCAL_RESTORE_DATABASE_URL to an existing localhost restore database first. Never paste the URL into a chat or log.'
    }
    $approval = Read-Host 'Type I_APPROVE_LOCAL_SCHEMA_CREATE_AND_DROP to run on LOCAL restore database'
    if ($approval -cne 'I_APPROVE_LOCAL_SCHEMA_CREATE_AND_DROP') {
        Write-Host 'G4 execution cancelled; no DB statements were run.'
        return
    }
    $env:G4_CONFIRM_LOCAL_SCHEMA = $approval
    $outputDir = Join-Path $root 'tmp\g4-local-acceptance-logs'
    New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss_fff'
    $prefix = Join-Path $outputDir "g4-local-acceptance-$stamp"
    $stdoutFile = "$prefix.stdout.log"
    $stderrFile = "$prefix.stderr.log"
    $summaryFile = "$prefix.log"

    # Never use '2>&1 | Tee-Object' for a native process under WinPS 5.1:
    # with ErrorActionPreference=Stop, diagnostic stderr can become
    # NativeCommandError and abort before the native exit code is inspected.
    # Do not put credentials or DB URLs on the command line; the Node child
    # inherits them only via environment variables from the parent launcher.
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $quotedArgs = '"' + $entry + '" --execute-local --allow-temporary-schema'
    $process = Start-Process -FilePath $nodeCommand.Source `
        -ArgumentList $quotedArgs -WorkingDirectory $root -NoNewWindow `
        -Wait -PassThru -RedirectStandardOutput $stdoutFile `
        -RedirectStandardError $stderrFile
    $nodeExitCode = [int]$process.ExitCode

    $stdoutText = ''
    $stderrText = ''
    if (Test-Path -LiteralPath $stdoutFile) {
        $stdoutText = [string](Get-Content -LiteralPath $stdoutFile -Raw -Encoding UTF8)
    }
    if (Test-Path -LiteralPath $stderrFile) {
        $stderrText = [string](Get-Content -LiteralPath $stderrFile -Raw -Encoding UTF8)
    }
    # Only the Node runner's deliberately redacted stdout and stderr are logged.
    # Never include the environment variable, full connection string or password.
    @("G4 Node exit code: $nodeExitCode", '--- stdout (sanitized Node result) ---',
      $stdoutText, '--- stderr (sanitized Node diagnostics) ---', $stderrText) |
        Set-Content -LiteralPath $summaryFile -Encoding UTF8

    if ($nodeExitCode -ne 0) {
        throw "G4 integration did not pass (Node exit $nodeExitCode). Inspect sanitized log: $summaryFile. Do not rerun until scratch cleanup is verified."
    }
    try {
        $result = $stdoutText | ConvertFrom-Json -ErrorAction Stop
    } catch {
        throw "G4 integration output did not contain valid PASS JSON. Inspect sanitized log: $summaryFile."
    }
    $required = @('stage','result','scratchSchemaDropped','realMailAllowed',
        'realStagingTested','realClerkTested','emailSent','vendorCalls',
        'checks','providersRetained')
    foreach ($field in $required) {
        if ($null -eq $result -or $result.PSObject.Properties.Name -notcontains $field) {
            throw "G4 result is missing required field: $field. Inspect sanitized log: $summaryFile."
        }
    }
    if ($result.stage -cne 'D06-D2B-G4-LOCAL' -or
        $result.result -cne 'PASS' -or $result.scratchSchemaDropped -cne 'verified_in_finally_before_success' -or
        $result.realMailAllowed -ne $false -or $result.realStagingTested -ne $false -or
        $result.realClerkTested -ne $false -or [int]$result.emailSent -ne 0 -or
        [int]$result.vendorCalls -ne 0 -or [int]$result.checks -lt 20 -or
        @($result.providersRetained) -notcontains 'brevo' -or
        @($result.providersRetained) -notcontains 'resend') {
        throw "G4 integration returned an incomplete/unsafe result. Inspect sanitized log: $summaryFile."
    }
    Write-Host ('G4 Node result: PASS; assertions=' + [string]$result.checks + '; emails=0; vendor calls=0.')
    Write-Host ('G4 integration evidence: ' + $summaryFile)
    Write-Host 'This does not authorize any Staging migration, API call or live email.'
}
finally {
    Remove-Item Env:G4_CONFIRM_LOCAL_SCHEMA -ErrorAction SilentlyContinue
    Pop-Location
}
