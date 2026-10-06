[CmdletBinding()]
param(
    [string]$Remote = "origin",
    [string]$ProductionBranch = "gh-pages",
    [string]$BackupBranch = "gh-pages-2",
    [string]$SourceBranch = "",
    [switch]$Yes
)

$ScriptVersion = "2026.10.06-v1.1-gh-pages-promotion-native-stderr-hotfix"

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Title)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkGray
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkGray
}

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ("[+] " + $Message) -ForegroundColor Green
}

function Write-WarnLine {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ("[!] " + $Message) -ForegroundColor Yellow
}

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowFailure
    )

    # Windows PowerShell 5.1 can convert native stderr into ErrorRecord objects.
    # With the script-wide ErrorActionPreference=Stop, normal Git progress such as
    # "remote:" emitted on stderr can otherwise terminate the script even when
    # git exits successfully. Temporarily make native stderr non-terminating and
    # decide success strictly from Git's process exit code.
    $previousErrorActionPreference = $ErrorActionPreference
    $nativePreferenceVariable = Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue
    $previousNativePreference = $null

    try {
        $ErrorActionPreference = "Continue"
        if ($null -ne $nativePreferenceVariable) {
            $previousNativePreference = $global:PSNativeCommandUseErrorActionPreference
            $global:PSNativeCommandUseErrorActionPreference = $false
        }

        $output = & git @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        if ($null -ne $nativePreferenceVariable) {
            $global:PSNativeCommandUseErrorActionPreference = $previousNativePreference
        }
        $ErrorActionPreference = $previousErrorActionPreference
    }

    $text = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine

    if (($exitCode -ne 0) -and (-not $AllowFailure)) {
        throw "git $($Arguments -join ' ') failed (exit=$exitCode)`n$text"
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Output   = $text.Trim()
    }
}

function Get-RemoteBranchSha {
    param(
        [Parameter(Mandatory = $true)][string]$RemoteName,
        [Parameter(Mandatory = $true)][string]$BranchName
    )

    $result = Invoke-Git -Arguments @("ls-remote", "--heads", $RemoteName, "refs/heads/$BranchName")
    if ([string]::IsNullOrWhiteSpace($result.Output)) {
        return $null
    }

    $firstLine = ($result.Output -split "`r?`n")[0]
    return ($firstLine -split "\s+")[0].Trim()
}

function Get-ShortSha {
    param([string]$Sha)
    if ([string]::IsNullOrWhiteSpace($Sha)) { return "-" }
    if ($Sha.Length -le 12) { return $Sha }
    return $Sha.Substring(0, 12)
}

Write-Section "GitHub Pages 운영 승격"
Write-Host "스크립트 버전: $ScriptVersion"
Write-Host "작업: 현재 운영 브랜치를 백업한 뒤 Staging 브랜치를 운영 브랜치로 승격합니다."
Write-Host "이 스크립트는 checkout/reset을 하지 않으며 원격 브랜치 ref만 갱신합니다."

# -----------------------------------------------------------------------------
# 1. Preflight
# -----------------------------------------------------------------------------
Write-Section "[1/8] 사전 점검"

$gitCheck = Get-Command git -ErrorAction SilentlyContinue
if ($null -eq $gitCheck) {
    throw "git 실행 파일을 찾을 수 없습니다. Git이 설치되어 있고 PATH에 등록되어 있는지 확인하세요."
}

$repoCheck = Invoke-Git -Arguments @("rev-parse", "--is-inside-work-tree") -AllowFailure
if (($repoCheck.ExitCode -ne 0) -or ($repoCheck.Output.Trim() -ne "true")) {
    throw "현재 위치가 Git 저장소가 아닙니다. 프로젝트 저장소 루트에서 실행하세요."
}

$repoRoot = (Invoke-Git -Arguments @("rev-parse", "--show-toplevel")).Output.Trim()
Set-Location $repoRoot
Write-Step "Repository: $repoRoot"

$remoteCheck = Invoke-Git -Arguments @("remote", "get-url", $Remote) -AllowFailure
if ($remoteCheck.ExitCode -ne 0) {
    throw "Git remote '$Remote'을 찾을 수 없습니다."
}
Write-Step "Remote: $Remote -> $($remoteCheck.Output)"

# -----------------------------------------------------------------------------
# 2. Resolve source branch
# -----------------------------------------------------------------------------
Write-Section "[2/8] 원격 브랜치 확인"

if ([string]::IsNullOrWhiteSpace($SourceBranch)) {
    # 사용자가 지정한 최종 승격 브랜치명 gh-pages3을 우선 확인하고,
    # 기존 프로젝트에서 사용해 온 gh-pages-3도 자동 호환합니다.
    $sourceCandidates = @("gh-pages3", "gh-pages-3")
    foreach ($candidate in $sourceCandidates) {
        $candidateSha = Get-RemoteBranchSha -RemoteName $Remote -BranchName $candidate
        if (-not [string]::IsNullOrWhiteSpace($candidateSha)) {
            $SourceBranch = $candidate
            break
        }
    }

    if ([string]::IsNullOrWhiteSpace($SourceBranch)) {
        throw "승격할 원격 브랜치를 찾지 못했습니다. gh-pages3 또는 gh-pages-3가 존재하는지 확인하거나 -SourceBranch로 직접 지정하세요."
    }
}

$productionSha = Get-RemoteBranchSha -RemoteName $Remote -BranchName $ProductionBranch
if ([string]::IsNullOrWhiteSpace($productionSha)) {
    throw "운영 브랜치 '$ProductionBranch'가 원격 '$Remote'에 없습니다."
}

$sourceSha = Get-RemoteBranchSha -RemoteName $Remote -BranchName $SourceBranch
if ([string]::IsNullOrWhiteSpace($sourceSha)) {
    throw "승격 원본 브랜치 '$SourceBranch'가 원격 '$Remote'에 없습니다."
}

$backupShaBefore = Get-RemoteBranchSha -RemoteName $Remote -BranchName $BackupBranch

Write-Host ("운영 브랜치 : {0}  ({1})" -f $ProductionBranch, (Get-ShortSha $productionSha))
Write-Host ("백업 브랜치 : {0}  ({1})" -f $BackupBranch, (Get-ShortSha $backupShaBefore))
Write-Host ("승격 원본    : {0}  ({1})" -f $SourceBranch, (Get-ShortSha $sourceSha))

# -----------------------------------------------------------------------------
# 3. Fetch exact objects
# -----------------------------------------------------------------------------
Write-Section "[3/8] 원격 정보 동기화"
Invoke-Git -Arguments @("fetch", $Remote, "--prune") | Out-Null
Write-Step "git fetch $Remote --prune 완료"

$productionRemoteRef = "refs/remotes/$Remote/$ProductionBranch"
$sourceRemoteRef = "refs/remotes/$Remote/$SourceBranch"

$localProductionSha = (Invoke-Git -Arguments @("rev-parse", "--verify", "$productionRemoteRef^{commit}")).Output.Trim()
$localSourceSha = (Invoke-Git -Arguments @("rev-parse", "--verify", "$sourceRemoteRef^{commit}")).Output.Trim()

if ($localProductionSha -ne $productionSha) {
    throw "운영 브랜치가 확인 중 변경되었습니다. 다시 실행하세요.`n처음 확인: $productionSha`nFetch 이후: $localProductionSha"
}
if ($localSourceSha -ne $sourceSha) {
    throw "승격 원본 브랜치가 확인 중 변경되었습니다. 다시 실행하세요.`n처음 확인: $sourceSha`nFetch 이후: $localSourceSha"
}

# -----------------------------------------------------------------------------
# 4. Confirmation
# -----------------------------------------------------------------------------
Write-Section "[4/8] 실행 확인"
Write-WarnLine "다음 작업은 원격 브랜치를 변경합니다."
Write-Host "  1) $Remote/$ProductionBranch ($((Get-ShortSha $productionSha))) -> $Remote/$BackupBranch 백업"
Write-Host "  2) $Remote/$SourceBranch ($((Get-ShortSha $sourceSha))) -> $Remote/$ProductionBranch 강제 승격"
Write-Host ""
Write-Host "백업 브랜치는 실행 시점의 기존 운영 브랜치와 정확히 같은 commit으로 갱신됩니다."
Write-Host "운영 승격에는 force-with-lease를 사용하므로, 실행 도중 운영 브랜치가 다른 곳에서 바뀌면 자동 중단됩니다."

if (-not $Yes) {
    $answer = Read-Host "계속하려면 START를 정확히 입력하세요"
    if ($answer -cne "START") {
        Write-WarnLine "사용자 취소. 원격 브랜치는 변경하지 않았습니다."
        exit 0
    }
}
else {
    Write-Step "-Yes 옵션으로 확인 단계를 자동 승인했습니다."
}

# -----------------------------------------------------------------------------
# 5. Backup production -> backup branch
# -----------------------------------------------------------------------------
Write-Section "[5/8] 운영 브랜치 백업"

$backupPushArgs = @("push")
if (-not [string]::IsNullOrWhiteSpace($backupShaBefore)) {
    $backupPushArgs += "--force-with-lease=refs/heads/$BackupBranch`:$backupShaBefore"
}
$backupPushArgs += @($Remote, "$productionRemoteRef`:refs/heads/$BackupBranch")

$backupPush = Invoke-Git -Arguments $backupPushArgs
if (-not [string]::IsNullOrWhiteSpace($backupPush.Output)) {
    Write-Host $backupPush.Output
}

$backupShaAfter = Get-RemoteBranchSha -RemoteName $Remote -BranchName $BackupBranch
if ($backupShaAfter -ne $productionSha) {
    throw "백업 검증에 실패했습니다.`n예상: $productionSha`n실제: $backupShaAfter"
}
Write-Step "$Remote/$BackupBranch = 기존 $Remote/$ProductionBranch ($(Get-ShortSha $backupShaAfter)) 백업 완료"

# -----------------------------------------------------------------------------
# 6. Recheck remote state before production overwrite
# -----------------------------------------------------------------------------
Write-Section "[6/8] 승격 직전 안전 재검증"

$currentProductionSha = Get-RemoteBranchSha -RemoteName $Remote -BranchName $ProductionBranch
$currentSourceSha = Get-RemoteBranchSha -RemoteName $Remote -BranchName $SourceBranch

if ($currentProductionSha -ne $productionSha) {
    throw "백업 후 운영 브랜치가 다른 작업에 의해 변경되었습니다. 운영 승격을 중단합니다.`n백업된 commit: $productionSha`n현재 운영 commit: $currentProductionSha"
}
if ($currentSourceSha -ne $sourceSha) {
    throw "백업 후 승격 원본 브랜치가 변경되었습니다. 운영 승격을 중단합니다.`n확인한 commit: $sourceSha`n현재 원본 commit: $currentSourceSha"
}

Write-Step "운영/원본 브랜치가 사전 확인 이후 변경되지 않았습니다."

# -----------------------------------------------------------------------------
# 7. Promote source -> production
# -----------------------------------------------------------------------------
Write-Section "[7/8] Staging -> Production 승격"

$promotionArgs = @(
    "push",
    "--force-with-lease=refs/heads/$ProductionBranch`:$productionSha",
    $Remote,
    "$sourceRemoteRef`:refs/heads/$ProductionBranch"
)

$promotion = Invoke-Git -Arguments $promotionArgs
if (-not [string]::IsNullOrWhiteSpace($promotion.Output)) {
    Write-Host $promotion.Output
}

# -----------------------------------------------------------------------------
# 8. Final verification
# -----------------------------------------------------------------------------
Write-Section "[8/8] 최종 검증"

$finalProductionSha = Get-RemoteBranchSha -RemoteName $Remote -BranchName $ProductionBranch
$finalBackupSha = Get-RemoteBranchSha -RemoteName $Remote -BranchName $BackupBranch
$finalSourceSha = Get-RemoteBranchSha -RemoteName $Remote -BranchName $SourceBranch

if ($finalProductionSha -ne $sourceSha) {
    throw "운영 승격 최종 검증에 실패했습니다.`n예상 운영 commit: $sourceSha`n실제 운영 commit: $finalProductionSha"
}
if ($finalBackupSha -ne $productionSha) {
    throw "백업 브랜치 최종 검증에 실패했습니다.`n예상 백업 commit: $productionSha`n실제 백업 commit: $finalBackupSha"
}
if ($finalSourceSha -ne $sourceSha) {
    throw "승격 원본 브랜치가 작업 중 변경되었습니다. 운영에는 처음 확인한 commit이 승격되어 있습니다.`n승격 commit: $sourceSha`n현재 원본 commit: $finalSourceSha"
}

Invoke-Git -Arguments @("fetch", $Remote, "--prune") | Out-Null

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "운영 승격 완료" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ("백업   : {0}/{1} = {2}" -f $Remote, $BackupBranch, $finalBackupSha)
Write-Host ("운영   : {0}/{1} = {2}" -f $Remote, $ProductionBranch, $finalProductionSha)
Write-Host ("원본   : {0}/{1} = {2}" -f $Remote, $SourceBranch, $finalSourceSha)
Write-Host ""
Write-Host "결과:"
Write-Host "  - 기존 $ProductionBranch -> $BackupBranch 백업 완료"
Write-Host "  - $SourceBranch -> $ProductionBranch 승격 완료"
Write-Host ""
Write-Host "필요 시 수동 롤백 예시:" -ForegroundColor Yellow
Write-Host ("  git fetch {0} --prune" -f $Remote)
Write-Host ("  git push --force-with-lease=refs/heads/{2}:{3} {0} refs/remotes/{0}/{1}:refs/heads/{2}" -f $Remote, $BackupBranch, $ProductionBranch, $finalProductionSha)
Write-Host ""
Write-Host "GitHub Pages / Vercel 등 배포 대상이 $ProductionBranch 변경을 감지해 실제 운영 배포를 완료했는지는 별도로 확인하세요."
