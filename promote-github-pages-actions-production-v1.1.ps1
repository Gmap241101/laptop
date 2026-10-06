param(
    [string]$SourceBranch = "",
    [string]$ClerkPublishableKey = "",
    [switch]$Yes,
    [switch]$SkipWorkflowWatch,
    [switch]$AllowCreateBackupFromCurrentProduction,
    [switch]$SkipGhAutoInstall
)

$ErrorActionPreference = "Stop"
$ScriptVersion = "2026.10.06-v1.1-github-pages-actions-production-gh-bootstrap"
$ProductionBranch = "gh-pages"
$BackupBranch = "gh-pages-2"
$ExpectedDomain = "notebook.recruit.kro.kr"
$WorkflowFile = "pages-production.yml"
$SecretName = "VITE_CLERK_PUBLISHABLE_KEY"
$script:GhCommand = $null

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

function Find-GhCommand {
    $command = Get-Command gh -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        return $command.Source
    }

    $candidates = @()
    if ($env:ProgramFiles) {
        $candidates += (Join-Path $env:ProgramFiles "GitHub CLI\gh.exe")
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} "GitHub CLI\gh.exe")
    }
    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA "Programs\GitHub CLI\gh.exe")
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }

    return $null
}

function Ensure-GhCommand {
    $resolved = Find-GhCommand
    if ($resolved) {
        $script:GhCommand = $resolved
        Write-Host "[+] GitHub CLI: $resolved"
        return
    }

    Write-Host "[!] GitHub CLI(gh)가 설치되어 있지 않습니다."

    if ($SkipGhAutoInstall) {
        throw "GitHub CLI가 필요합니다. 'winget install --id GitHub.cli --exact --source winget' 실행 후 다시 시도하세요."
    }

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "GitHub CLI와 winget을 찾지 못했습니다. GitHub CLI를 설치한 뒤 다시 실행하세요."
    }

    $install = $Yes
    if (-not $Yes) {
        $answer = Read-Host "winget으로 GitHub CLI를 지금 설치할까요? (Y/N)"
        $install = ($answer -match '^(Y|y|YES|Yes|yes)$')
    }

    if (-not $install) {
        throw "GitHub CLI 설치가 취소되었습니다. 설치 후 스크립트를 다시 실행하세요."
    }

    Write-Host "[+] GitHub CLI 설치를 시작합니다..."
    Invoke-Native $winget.Source @(
        "install",
        "--id", "GitHub.cli",
        "--exact",
        "--source", "winget",
        "--accept-package-agreements",
        "--accept-source-agreements"
    ) | Out-Null

    # winget 설치 직후 현재 PowerShell 세션의 PATH가 갱신되지 않을 수 있으므로
    # common installation paths를 다시 직접 탐색한다.
    $resolved = Find-GhCommand
    if (-not $resolved) {
        throw "GitHub CLI 설치는 끝났지만 현재 PowerShell 세션에서 gh.exe를 찾지 못했습니다. PowerShell을 새로 열고 이 스크립트를 다시 실행하세요."
    }

    $script:GhCommand = $resolved
    Write-Host "[+] GitHub CLI 설치 완료: $resolved"
}

function Invoke-Gh([string[]]$Arguments, [switch]$Capture) {
    if (-not $script:GhCommand) { throw "GitHub CLI 경로가 초기화되지 않았습니다." }
    return Invoke-Native $script:GhCommand $Arguments -Capture:$Capture
}

function Ensure-GhAuthentication {
    $authenticated = $true
    try {
        Invoke-Gh @("auth", "status") | Out-Null
    } catch {
        $authenticated = $false
    }

    if ($authenticated) {
        Write-Host "[+] GitHub CLI 인증 확인 완료"
        return
    }

    Write-Host "[!] GitHub CLI는 설치되어 있지만 GitHub 로그인이 필요합니다."
    Write-Host "    브라우저 인증 창을 열어 로그인을 진행합니다."
    Invoke-Gh @("auth", "login", "--web", "--git-protocol", "https") | Out-Null
    Invoke-Gh @("auth", "status") | Out-Null
    Write-Host "[+] GitHub CLI 로그인 완료"
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
Write-Host "백업 브랜치    : $BackupBranch"

Write-Section "[1/8] Git/GitHub CLI 사전 점검"
Invoke-Native "git" @("rev-parse", "--is-inside-work-tree") -Capture | Out-Null
Ensure-GhCommand
Ensure-GhAuthentication
$repo = (Invoke-Gh @("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner") -Capture | Out-String).Trim()
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
$backupSha = Get-RemoteSha $BackupBranch -AllowMissing

Write-Host "승격 원본 : $SourceBranch  ($($sourceSha.Substring(0,12)))"
Write-Host "현재 운영 : $ProductionBranch ($($productionSha.Substring(0,12)))"
if ($backupSha) {
    Write-Host "기존 백업 : $BackupBranch  ($($backupSha.Substring(0,12))) - 보존"
} else {
    Write-Host "기존 백업 : $BackupBranch  (-)"
    if (-not $AllowCreateBackupFromCurrentProduction) {
        throw "origin/$BackupBranch가 없습니다. 현재 gh-pages를 새 백업으로 사용해도 되는 경우에만 -AllowCreateBackupFromCurrentProduction을 명시하세요."
    }
}

$workflowCheck = Invoke-Native "git" @("show", "origin/$SourceBranch`:.github/workflows/$WorkflowFile") -Capture
if (-not (($workflowCheck -join "`n").Contains("npm run build:production:pages"))) {
    throw "origin/$SourceBranch에 최신 $WorkflowFile 이 없습니다. 최신 전체 패키지를 Staging 브랜치에 먼저 배포하세요."
}
Write-Host "[+] Staging source에 Production Pages workflow 확인 완료"

Write-Section "[3/8] Production Clerk publishable key 확인"
$secretNames = Invoke-Gh @("secret", "list", "--repo", $repo, "--json", "name", "--jq", ".[].name") -Capture
$hasSecret = ($secretNames | ForEach-Object { "$($_)".Trim() }) -contains $SecretName

if (-not $hasSecret) {
    if (-not $ClerkPublishableKey) {
        $ClerkPublishableKey = Read-Host "Clerk Production Publishable Key (pk_live_...)"
    }
    if (-not $ClerkPublishableKey.StartsWith("pk_live_")) {
        throw "Production Clerk Publishable Key는 pk_live_ 로 시작해야 합니다."
    }
    $ClerkPublishableKey | & $script:GhCommand secret set $SecretName --repo $repo
    if ($LASTEXITCODE -ne 0) { throw "$SecretName GitHub Actions secret 등록에 실패했습니다." }
    Write-Host "[+] $SecretName 등록 완료"
} else {
    Write-Host "[+] $SecretName secret가 이미 등록되어 있습니다."
}

Write-Section "[4/8] 실행 확인"
Write-Host "다음 작업을 수행합니다."
if ($backupSha) {
    Write-Host "  1) 기존 origin/$BackupBranch ($($backupSha.Substring(0,12)))는 변경하지 않고 보존"
} else {
    Write-Host "  1) 현재 origin/$ProductionBranch ($($productionSha.Substring(0,12)))를 origin/$BackupBranch에 최초 백업"
}
Write-Host "  2) GitHub Pages build_type을 workflow로 전환"
Write-Host "  3) origin/$SourceBranch ($($sourceSha.Substring(0,12)))를 origin/$ProductionBranch로 승격"
Write-Host "  4) push로 시작된 $WorkflowFile 의 Vite Production build/deploy 확인"

if (-not $Yes) {
    $answer = Read-Host "계속하려면 START를 정확히 입력하세요"
    if ($answer -cne "START") { throw "사용자가 작업을 취소했습니다." }
}

Write-Section "[5/8] 운영 백업 보존/생성"
if (-not $backupSha) {
    Invoke-Native "git" @("push", "origin", "$productionSha`:refs/heads/$BackupBranch")
    $backupSha = Get-RemoteSha $BackupBranch
    if ($backupSha -ne $productionSha) { throw "운영 백업 SHA 검증에 실패했습니다." }
    Write-Host "[+] origin/$BackupBranch = $($backupSha.Substring(0,12))"
} else {
    Write-Host "[+] 기존 origin/$BackupBranch는 덮어쓰지 않았습니다."
}

Write-Section "[6/8] GitHub Pages를 Actions workflow 방식으로 전환"
Invoke-Gh @(
    "api", "--method", "PUT", "repos/$repo/pages",
    "-f", "build_type=workflow",
    "-f", "cname=$ExpectedDomain",
    "-F", "https_enforced=true"
) | Out-Null
$pagesBuildType = (Invoke-Gh @("api", "repos/$repo/pages", "--jq", ".build_type") -Capture | Out-String).Trim()
if ($pagesBuildType -ne "workflow") { throw "GitHub Pages build_type=workflow 전환에 실패했습니다." }
Write-Host "[+] build_type=workflow"

Write-Section "[7/8] Staging source를 gh-pages로 승격"
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
        $candidate = (Invoke-Gh @(
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
        # Workflow run can take a few seconds to become visible.
    }
}
if (-not $runId) { throw "gh-pages push로 시작된 workflow run을 찾지 못했습니다." }
Write-Host "[+] Workflow Run ID: $runId"

if (-not $SkipWorkflowWatch) {
    Invoke-Gh @("run", "watch", $runId, "--repo", $repo, "--exit-status")
}

$finalBackupSha = Get-RemoteSha $BackupBranch
$finalProductionSha = Get-RemoteSha $ProductionBranch
$finalSourceSha = Get-RemoteSha $SourceBranch
if ($finalProductionSha -ne $finalSourceSha) { throw "최종 Production/Source SHA가 일치하지 않습니다." }
if ($finalBackupSha -ne $backupSha) { throw "백업 브랜치 SHA가 작업 도중 변경되었습니다." }

Write-Host ""
Write-Host "완료:"
Write-Host "  backup     origin/$BackupBranch = $($finalBackupSha.Substring(0,12))"
Write-Host "  production origin/$ProductionBranch = $($finalProductionSha.Substring(0,12))"
Write-Host "  source     origin/$SourceBranch = $($finalSourceSha.Substring(0,12))"
Write-Host "  site       https://$ExpectedDomain/"
Write-Host ""
Write-Host "운영 index.html은 /assets/*.js를 참조해야 하며 /src/user-main.jsx를 직접 참조하면 안 됩니다."
