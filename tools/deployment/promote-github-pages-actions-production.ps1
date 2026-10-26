param(
    [string]$SourceBranch = "",
    [string]$ClerkPublishableKey = "",
    [switch]$Yes,
    [switch]$SkipWorkflowWatch,
    [switch]$AllowCreateBackupFromCurrentProduction,
    [ValidateSet("rolling", "rolling_and_dated")][string]$BackupMode = "rolling"
)

$ErrorActionPreference = "Stop"
$ScriptVersion = "2026.10.26-v4-github-pages-actions-production-rolling-plus-optional-dated-backup"
$ProductionBranch = "gh-pages"
$ExpectedDomain = "notebook.recruit.kro.kr"
$WorkflowFile = "pages-production.yml"
$SecretName = "VITE_CLERK_PUBLISHABLE_KEY"
$RollingBackupBranch = "gh-pages-4"
$DatedBackupPrefix = "backup-gh-pages-"+(Get-Date -Format "yyyyMMdd")+"-"
$DatedBackupBranch = ""


function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host $Title
    Write-Host "============================================================"
}

function Invoke-Native([string]$Command, [string[]]$Arguments, [switch]$Capture) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        if ($Capture) {
            $output = & $Command @Arguments 2>&1
        } else {
            & $Command @Arguments
            $output = $null
        }
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }

    if ($exitCode -ne 0) {
        if ($Capture -and $output) { $output | ForEach-Object { Write-Host $_ } }
        throw "$Command failed with exit code $exitCode"
    }

    return $output
}

function Get-NextDatedBackupBranch([string]$Prefix) {
    # A date-scoped, ascending sequence: backup-gh-pages-YYYYMMDD-1, -2, ...
    # Ref collisions are prevented again by an empty --force-with-lease.
    for ($sequence = 1; $sequence -le 9999; $sequence++) {
        $candidate = "$Prefix$sequence"
        if (-not (Get-RemoteSha $candidate -AllowMissing)) { return $candidate }
    }
    throw "날짜별 운영 백업 브랜치가 9999개를 초과하여 더 생성할 수 없습니다."
}

function Get-RemoteSha([string]$Branch, [switch]$AllowMissing) {
    $output = Invoke-Native "git" @("ls-remote", "--heads", "origin", "refs/heads/$Branch") -Capture
    $line = (($output | Out-String).Trim())
    if (-not $line) {
        if ($AllowMissing) { return $null }
        throw "origin/$Branch 브랜치를 찾지 못했습니다."
    }
    return ($line -split "\s+")[0]
}

Write-Section "GitHub Pages Vite Production 승격"
Write-Host "스크립트 버전 : $ScriptVersion"
Write-Host "운영 도메인    : https://$ExpectedDomain/"
Write-Host "운영 브랜치    : $ProductionBranch"
Write-Host "Backup mode    : $BackupMode (rolling=gh-pages-4 always; optional=backup-gh-pages-YYYYMMDD-#)"

Write-Section "[1/8] Git/GitHub CLI 사전 점검"
Invoke-Native "git" @("rev-parse", "--is-inside-work-tree") -Capture | Out-Null
Invoke-Native "gh" @("auth", "status") | Out-Null
$repo = (Invoke-Native "gh" @("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner") -Capture | Out-String).Trim()
if (-not $repo) { throw "GitHub repository를 확인하지 못했습니다." }
Write-Host "[+] Repository: $repo"
Invoke-Native "git" @("fetch", "origin", "--prune") | Out-Null

Write-Section "[2/8] Staging source / 운영 / 백업 SHA 확인"
if (-not $SourceBranch) {
    foreach ($candidate in @("gh-pages-3", "gh-pages3")) {
        if (Get-RemoteSha $candidate -AllowMissing) {
            $SourceBranch = $candidate
            break
        }
    }
}
if (-not $SourceBranch) { throw "gh-pages-3 또는 gh-pages3 Staging source 브랜치를 찾지 못했습니다." }

$sourceSha = Get-RemoteSha $SourceBranch
$productionSha = Get-RemoteSha $ProductionBranch
if ($sourceSha -eq $productionSha) {
    throw "origin/$ProductionBranch 가 이미 Staging 승격 커밋입니다. 재실행하면 배포 이전 백업이 사라질 수 있으므로 중단합니다. Pages 상태와 Production API 상태를 각각 확인하십시오."
}
# The rolling backup is mandatory regardless of the operator Y/N choice.
$rollingBackupSha = Get-RemoteSha $RollingBackupBranch -AllowMissing
$withDatedBackup = ($BackupMode -eq "rolling_and_dated")
if ($withDatedBackup) {
    $DatedBackupBranch = Get-NextDatedBackupBranch $DatedBackupPrefix
    $datedBackupSha = Get-RemoteSha $DatedBackupBranch -AllowMissing
    if ($datedBackupSha) { throw "Dated backup branch already exists. Refusing overwrite." }
}
Write-Host "Source SHA     : $SourceBranch ($($sourceSha.Substring(0,12)))"
Write-Host "Production SHA : $ProductionBranch ($($productionSha.Substring(0,12)))"
if ($rollingBackupSha) {
    Write-Host "Rolling backup : $RollingBackupBranch ($($rollingBackupSha.Substring(0,12)) -> $($productionSha.Substring(0,12)))"
} else {
    Write-Host "Rolling backup : $RollingBackupBranch (new ref)"
}
if ($withDatedBackup) {
    Write-Host "Extra snapshot : $DatedBackupBranch (new, immutable)"
} else {
    Write-Host "Extra snapshot : none (operator N)"
}
if (-not $AllowCreateBackupFromCurrentProduction) {
    throw "운영 백업 생성 또는 갱신에는 -AllowCreateBackupFromCurrentProduction 명시적 승인이 필요합니다."
}

$workflowCheck = Invoke-Native "git" @("show", "origin/$SourceBranch`:.github/workflows/$WorkflowFile") -Capture
if (-not (($workflowCheck -join "`n").Contains("npm run build:production:pages"))) {
    throw "origin/$SourceBranch에 최신 $WorkflowFile 이 없습니다. 최신 전체 패키지를 Staging 브랜치에 먼저 배포하세요."
}
Write-Host "[+] Staging source에 Production Pages workflow 확인 완료"

Write-Section "[3/8] Production Clerk publishable key 확인"
$secretNames = Invoke-Native "gh" @("secret", "list", "--repo", $repo, "--json", "name", "--jq", ".[].name") -Capture
$hasSecret = ($secretNames | ForEach-Object { "$($_)".Trim() }) -contains $SecretName

if (-not $hasSecret) {
    if (-not $ClerkPublishableKey) {
        $ClerkPublishableKey = Read-Host "Clerk Production Publishable Key (pk_live_...)"
    }
    if (-not $ClerkPublishableKey.StartsWith("pk_live_")) {
        throw "Production Clerk Publishable Key는 pk_live_ 로 시작해야 합니다."
    }
    $ClerkPublishableKey | & gh secret set $SecretName --repo $repo
    if ($LASTEXITCODE -ne 0) { throw "$SecretName GitHub Actions secret 등록에 실패했습니다." }
    Write-Host "[+] $SecretName 등록 완료"
} else {
    Write-Host "[+] $SecretName secret가 이미 등록되어 있습니다."
}

Write-Section "[4/8] 실행 확인"
Write-Host "다음 작업을 수행합니다."
Write-Host "  1) Always update origin/$RollingBackupBranch to current origin/$ProductionBranch ($($productionSha.Substring(0,12)))"
if ($withDatedBackup) {
    Write-Host "  2) Additionally create origin/$DatedBackupBranch at the same production SHA (never overwrite)"
} else {
    Write-Host "  2) No additional dated backup (rolling branch still updated)"
}
Write-Host "     gh-pages-2 / gh-pages2 must not be changed"
Write-Host "  3) Set GitHub Pages build_type=workflow"
Write-Host "  4) Promote origin/$SourceBranch to origin/$ProductionBranch"
Write-Host "  5) Validate $WorkflowFile for Production build/deploy"

if (-not $Yes) {
    $answer = Read-Host "계속하려면 START를 정확히 입력하세요"
    if ($answer -cne "START") { throw "사용자가 작업을 취소했습니다." }
}

Write-Section "[5/8] 운영 백업 보존/생성"
# A rolling backup is mandatory for BOTH Y and N, with an additional dated
# immutable snapshot for Y only. Recheck all refs before any write.
$currentBeforeBackup = Get-RemoteSha $ProductionBranch
$currentSourceBeforeBackup = Get-RemoteSha $SourceBranch
if ($currentBeforeBackup -ne $productionSha -or $currentSourceBeforeBackup -ne $sourceSha) {
    throw "Staging or Production SHA changed after preflight. No promotion."
}
foreach ($branch in @($RollingBackupBranch, $DatedBackupBranch)) {
    if (-not $branch) { continue }
    if ($branch -eq "gh-pages-2" -or $branch -eq "gh-pages2" -or
        $branch -eq $ProductionBranch -or $branch -eq $SourceBranch) {
        throw "Protected source, production or historic Firebase branch cannot be a backup target: $branch"
    }
}
$currentRollingSha = Get-RemoteSha $RollingBackupBranch -AllowMissing
if ($currentRollingSha -ne $rollingBackupSha) {
    throw "Rolling backup changed since preflight. Refusing overwrite."
}
if ($withDatedBackup) {
    $currentDatedSha = Get-RemoteSha $DatedBackupBranch -AllowMissing
    if ($currentDatedSha) { throw "Dated backup branch already exists. Refusing overwrite." }
    # Create the immutable snapshot first, so a dated-ref collision cannot
    # overwrite the existing rolling backup. An empty lease requires no ref.
    Invoke-Native "git" @(
        "push", "origin",
        "--force-with-lease=refs/heads/${DatedBackupBranch}:",
        "${productionSha}:refs/heads/$DatedBackupBranch"
    )
    $createdDatedSha = Get-RemoteSha $DatedBackupBranch
    if ($createdDatedSha -ne $productionSha) { throw "Dated backup SHA verification failed. No promotion." }
    Write-Host "[+] Dated snapshot origin/$DatedBackupBranch = $($createdDatedSha.Substring(0,12))"
}
# Always update gh-pages-4. Compare-and-swap against its observed SHA,
# including an explicit empty lease when creating it for the first time.
$expectedRollingSha = if ($currentRollingSha) { $currentRollingSha } else { "" }
Invoke-Native "git" @(
    "push", "origin",
    "--force-with-lease=refs/heads/${RollingBackupBranch}:$expectedRollingSha",
    "${productionSha}:refs/heads/$RollingBackupBranch"
)
$verifiedRollingSha = Get-RemoteSha $RollingBackupBranch
if ($verifiedRollingSha -ne $productionSha) { throw "Rolling backup SHA verification failed. No promotion." }
if ($withDatedBackup -and (Get-RemoteSha $DatedBackupBranch) -ne $productionSha) {
    throw "Dated backup changed before promotion. No promotion."
}
Write-Host "[+] Rolling backup origin/$RollingBackupBranch = $($verifiedRollingSha.Substring(0,12)); gh-pages-2 preserved"

Write-Section "[6/8] GitHub Pages를 Actions workflow 방식으로 전환"
Invoke-Native "gh" @(
    "api", "--method", "PUT", "repos/$repo/pages",
    "-f", "build_type=workflow",
    "-f", "cname=$ExpectedDomain",
    "-F", "https_enforced=true"
) | Out-Null
$pagesBuildType = (Invoke-Native "gh" @("api", "repos/$repo/pages", "--jq", ".build_type") -Capture | Out-String).Trim()
if ($pagesBuildType -ne "workflow") { throw "GitHub Pages build_type=workflow 전환에 실패했습니다." }
Write-Host "[+] build_type=workflow"

Write-Section "[7/8] Staging source를 gh-pages로 승격"
# Re-read both refs immediately before the destructive ref update.
$currentProductionSha = Get-RemoteSha $ProductionBranch
$currentSourceSha = Get-RemoteSha $SourceBranch
if ($currentProductionSha -ne $productionSha) {
    throw "실행 도중 origin/$ProductionBranch가 변경되었습니다. 승격을 중단합니다."
}
if ($currentSourceSha -ne $sourceSha) {
    throw "실행 도중 origin/$SourceBranch가 변경되었습니다. 승격을 중단합니다."
}

Invoke-Native "git" @(
    "push", "origin",
    "--force-with-lease=refs/heads/$ProductionBranch`:$productionSha",
    "$sourceSha`:refs/heads/$ProductionBranch"
)

$newProductionSha = Get-RemoteSha $ProductionBranch
if ($newProductionSha -ne $sourceSha) { throw "gh-pages 승격 SHA 검증에 실패했습니다." }
Write-Host "[+] origin/$ProductionBranch = $($newProductionSha.Substring(0,12))"

Write-Section "[8/8] GitHub Pages workflow 확인"
$runId = ""
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $candidate = (Invoke-Native "gh" @(
            "run", "list", "--repo", $repo,
            "--workflow", $WorkflowFile,
            "--branch", $ProductionBranch,
            "--commit", $sourceSha,
            "--limit", "1",
            "--json", "databaseId",
            "--jq", ".[0].databaseId"
        ) -Capture | Out-String).Trim()
        if ($candidate) { $runId = $candidate; break }
    } catch {
        # The workflow can take a few seconds to become visible after the ref update.
    }
}
if (-not $runId) { throw "gh-pages push로 시작된 workflow run을 찾지 못했습니다." }
Write-Host "[+] Workflow Run ID: $runId"

if (-not $SkipWorkflowWatch) {
    Invoke-Native "gh" @("run", "watch", $runId, "--repo", $repo, "--exit-status")
}

$finalRollingSha = Get-RemoteSha $RollingBackupBranch
$finalProductionSha = Get-RemoteSha $ProductionBranch
$finalSourceSha = Get-RemoteSha $SourceBranch
if ($finalProductionSha -ne $finalSourceSha) { throw "Final Production/Source SHA mismatch." }
if ($finalRollingSha -ne $verifiedRollingSha) { throw "Rolling backup ref changed during deployment." }
if ($withDatedBackup) {
    $finalDatedSha = Get-RemoteSha $DatedBackupBranch
    if ($finalDatedSha -ne $productionSha) { throw "Dated backup ref changed during deployment." }
}

Write-Host ""
Write-Host "COMPLETE:"
Write-Host "  rolling     origin/$RollingBackupBranch = $($finalRollingSha.Substring(0,12))"
if ($withDatedBackup) {
    Write-Host "  dated       origin/$DatedBackupBranch = $($finalDatedSha.Substring(0,12))"
}
Write-Host "  production  origin/$ProductionBranch = $($finalProductionSha.Substring(0,12))"
Write-Host "  source      origin/$SourceBranch = $($finalSourceSha.Substring(0,12))"
Write-Host "  site        https://$ExpectedDomain/"
Write-Host ""
Write-Host "운영 index.html은 /assets/*.js를 참조해야 하며 /src/user-main.jsx를 직접 참조하면 안 됩니다."
