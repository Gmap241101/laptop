# 노트북 대여 시스템 통합 배포 스크립트 - 전체 이력 감사 통합본
# 고정 작업 경로: E:\project\rental-system\test_new
#
# 기본 실행:
#   .\deploy.ps1
#
# 경로를 직접 지정하는 실행 예:
#   .\deploy.ps1 -PackagePath "D:\Users\user\Downloads\package.zip" `
#       -GitHubTokenFilePath "D:\secure\github-token.txt"
#
# 재부팅 후에도 별도 토큰 파일 위치를 자동 사용하려면 사용자 환경변수
# DEPLOY_GITHUB_TOKEN_FILE에 토큰 파일의 전체 경로를 등록할 수 있습니다.
# Firebase는 저장된 firebase login 세션을 우선 확인하고, 필요할 때만 브라우저 로그인을 실행합니다.
# 표준 배포 패키지는 package-meta/PACKAGE_FILES.txt, PACKAGE_SHA256SUMS.txt,
# REMOVED_FILES.txt를 사용합니다. 기존 package-meta 없는 패키지도 경고 후 호환 적용할 수 있습니다.
# 적용 전 프로젝트 전체 소스는 E:\project\rental-system\_package_backups\test_new_before_날짜.zip으로 백업합니다.

param(
    [string]$CommitMessage = "",
    [string]$PackagePath = "",
    [string]$GitHubTokenFilePath = "",
    [string]$FirebaseTokenFilePath = "",
    [string]$DownloadsPath = ""
)

chcp 65001 | Out-Null
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# =============================================
# 프로젝트별 고정 설정
# =============================================
$ExpectedProjectPath = "E:\project\rental-system\test_new"
$ExpectedSourceBranch = "gh-pages-3"
$PublishBranch = "gh-pages"
$RemoteName = "origin"
$ExpectedCname = "notebook.recruit.kro.kr"
$ExpectedRemoteUrlFragment = "Gmap241101/laptop.git"
$FirebaseProjectId = "laptop-system-mk"
$PreferredDownloadsPath = "D:\Users\user\Downloads"
$ScriptVersion = "2026.07.30-v13.5-native-git-output-fix"

$ProjectParentPath = Split-Path -Parent $ExpectedProjectPath
$PackageBackupRoot = Join-Path $ProjectParentPath "_package_backups"
$PackageTempRoot = Join-Path $ProjectParentPath ".deployment_temp"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    $CommitMessage = "배포_$timestamp"
}

$backupBranch = "backup-gh-pages-$timestamp"
$productionBackupCreated = $false
$createProductionBackupForThisRun = $false
$projectRoot = $PSScriptRoot
$selectedPackagePath = ""
$selectedPackageRelativePath = ""
$selectedFirebaseMode = "none"
$packageApplied = $false
$packageBackupPath = ""
$firebaseDeployed = $false
$gitAskPassPath = ""
$originalGitAskPass = $env:GIT_ASKPASS
$originalGitTerminalPrompt = $env:GIT_TERMINAL_PROMPT
$originalDeployGitHubToken = $env:DEPLOY_GITHUB_TOKEN
$originalFirebaseToken = $env:FIREBASE_TOKEN

$publishRemoteShortRef = "$RemoteName/$PublishBranch"
$publishRemoteTrackingRef = "refs/remotes/$RemoteName/$PublishBranch"
$publishFetchRefspec = "+refs/heads/$($PublishBranch):$publishRemoteTrackingRef"

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host ""
    Write-Host "[진행] $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host "[안내] $Message" -ForegroundColor DarkYellow
}

function Stop-Deployment {
    param([Parameter(Mandatory = $true)][string]$Message)

    throw $Message
}

function Read-YesNo {
    param([Parameter(Mandatory = $true)][string]$Prompt)

    while ($true) {
        $answer = (Read-Host "$Prompt (Y/N)").Trim().ToUpperInvariant()

        if ($answer -eq "Y") {
            return $true
        }

        if ($answer -eq "N") {
            return $false
        }

        Write-Host "Y 또는 N만 입력하십시오." -ForegroundColor Yellow
    }
}

function Read-MenuChoice {
    param(
        [Parameter(Mandatory = $true)][string]$Prompt,
        [Parameter(Mandatory = $true)][string[]]$AllowedValues
    )

    while ($true) {
        $answer = (Read-Host $Prompt).Trim()
        if ($AllowedValues -contains $answer) {
            return $answer
        }

        Write-Host "허용된 번호만 입력하십시오: $($AllowedValues -join ', ')" -ForegroundColor Yellow
    }
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Description,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Step $Description

    $previousErrorActionPreference = $ErrorActionPreference
    $hasNativeErrorPreference = Test-Path -LiteralPath "variable:PSNativeCommandUseErrorActionPreference"
    $previousNativeErrorPreference = $null
    $commandOutput = @()
    $exitCode = 0

    if ($hasNativeErrorPreference) {
        $previousNativeErrorPreference = $PSNativeCommandUseErrorActionPreference
    }

    try {
        # Git은 정상 종료(0) 시에도 진행 메시지를 stderr로 출력할 수 있습니다.
        # 해당 메시지가 $ErrorActionPreference='Stop' 때문에 예외로 승격되지 않도록
        # 네이티브 명령 실행 구간에서만 stderr를 일반 출력으로 병합합니다.
        $ErrorActionPreference = "Continue"
        if ($hasNativeErrorPreference) {
            $PSNativeCommandUseErrorActionPreference = $false
        }

        $commandOutput = @(& $Command 2>&1)
        $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        if ($hasNativeErrorPreference) {
            $PSNativeCommandUseErrorActionPreference = $previousNativeErrorPreference
        }
    }

    foreach ($outputItem in $commandOutput) {
        $outputText = if ($outputItem -is [System.Management.Automation.ErrorRecord]) {
            $outputItem.Exception.Message
        }
        else {
            [string]$outputItem
        }

        if (-not [string]::IsNullOrWhiteSpace($outputText)) {
            Write-Host $outputText
        }
    }

    if ($exitCode -ne 0) {
        Stop-Deployment "$Description 실패. 종료 코드: $exitCode"
    }
}

function Invoke-NativeProbe {
    param([Parameter(Mandatory = $true)][scriptblock]$Command)

    $previousErrorActionPreference = $ErrorActionPreference
    $hasNativeErrorPreference = Test-Path -LiteralPath "variable:PSNativeCommandUseErrorActionPreference"
    $previousNativeErrorPreference = $null
    $probeOutput = @()
    $exitCode = 0

    if ($hasNativeErrorPreference) {
        $previousNativeErrorPreference = $PSNativeCommandUseErrorActionPreference
    }

    try {
        $ErrorActionPreference = "Continue"
        if ($hasNativeErrorPreference) {
            $PSNativeCommandUseErrorActionPreference = $false
        }

        $probeOutput = @(& $Command 2>&1)
        $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        if ($hasNativeErrorPreference) {
            $PSNativeCommandUseErrorActionPreference = $previousNativeErrorPreference
        }
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = @($probeOutput)
    }
}

function Get-RelativePathSafe {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$TargetPath
    )

    $baseFullPath = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\') + '\'
    $targetFullPath = [System.IO.Path]::GetFullPath($TargetPath)
    $baseUri = New-Object System.Uri($baseFullPath)
    $targetUri = New-Object System.Uri($targetFullPath)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)

    return [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace('/', '\')
}

function Test-IsPathInsideProject {
    param([Parameter(Mandatory = $true)][string]$Path)

    $projectFullPath = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\') + '\'
    $targetFullPath = [System.IO.Path]::GetFullPath($Path)

    return $targetFullPath.StartsWith(
        $projectFullPath,
        [System.StringComparison]::OrdinalIgnoreCase
    )
}

function Assert-SecretPathOutsideProject {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (Test-IsPathInsideProject -Path $Path) {
        Stop-Deployment "$Label 파일은 Git 프로젝트 폴더 밖에 보관해야 합니다.`n현재: $Path`n프로젝트: $projectRoot"
    }
}

function Get-TokenFromFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-Deployment "토큰 파일을 찾을 수 없습니다: $Path"
    }

    $tokenValue = ""
    foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $line = $rawLine.Trim()

        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
            continue
        }

        if ($line -match '^[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.+)$') {
            $line = $Matches[1].Trim()
        }

        $line = $line.Trim('"').Trim("'")
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $tokenValue = $line
            break
        }
    }

    if ([string]::IsNullOrWhiteSpace($tokenValue)) {
        Stop-Deployment "토큰 파일에서 유효한 값을 읽지 못했습니다: $Path"
    }

    if ($tokenValue -match '\s') {
        Stop-Deployment "토큰 값에 공백 또는 줄바꿈이 포함되어 있습니다: $Path"
    }

    return $tokenValue
}

function Enable-GitHubTokenAuthentication {
    param([Parameter(Mandatory = $true)][string]$TokenFilePath)

    $TokenFilePath = $TokenFilePath.Trim().Trim('"')
    Assert-SecretPathOutsideProject -Path $TokenFilePath -Label "GitHub 토큰"
    $token = Get-TokenFromFile -Path $TokenFilePath
    $script:gitAskPassPath = Join-Path $env:TEMP "rental-system-git-askpass-$timestamp.cmd"

    $askPassContent = @'
@echo off
set "ASKPASS_PROMPT=%~1"
echo %ASKPASS_PROMPT% | findstr /I "Username" >nul
if %ERRORLEVEL% EQU 0 (
  echo x-access-token
) else (
  echo %DEPLOY_GITHUB_TOKEN%
)
'@

    Set-Content -LiteralPath $script:gitAskPassPath -Value $askPassContent -Encoding ASCII
    $env:DEPLOY_GITHUB_TOKEN = $token
    $env:GIT_ASKPASS = $script:gitAskPassPath
    $env:GIT_TERMINAL_PROMPT = "0"

    Write-Host "GitHub 토큰 파일 인증을 적용했습니다: $TokenFilePath" -ForegroundColor Green
}

function Test-GitRemoteReadAccess {
    $probe = Invoke-NativeProbe {
        git ls-remote $RemoteName
    }

    return ($probe.ExitCode -eq 0)
}

function Test-SourceBranchPushSafety {
    Write-Step "원격 소스 브랜치 동기화 상태 확인"

    $remoteBranchProbe = Invoke-NativeProbe {
        git ls-remote --exit-code --heads $RemoteName $ExpectedSourceBranch
    }
    $remoteBranchExitCode = $remoteBranchProbe.ExitCode

    if ($remoteBranchExitCode -eq 0) {
        $sourceRemoteTrackingRef = "refs/remotes/$RemoteName/$ExpectedSourceBranch"
        $sourceFetchRefspec = "+refs/heads/$($ExpectedSourceBranch):$sourceRemoteTrackingRef"

        Invoke-NativeCommand "원격 '$ExpectedSourceBranch' 브랜치 가져오기" {
            git fetch --no-tags $RemoteName $sourceFetchRefspec
        }

        $ancestorProbe = Invoke-NativeProbe {
            git merge-base --is-ancestor "$RemoteName/$ExpectedSourceBranch" HEAD
        }
        $ancestorExitCode = $ancestorProbe.ExitCode

        if ($ancestorExitCode -eq 1) {
            Stop-Deployment @"
원격 '$RemoteName/$ExpectedSourceBranch'의 최신 커밋이 현재 로컬 브랜치에 포함되어 있지 않습니다.
패키지 적용 전에 원격 변경사항을 병합하거나 재배치한 뒤 다시 실행하십시오.
자동 pull/rebase는 작업 파일을 변경할 수 있어 수행하지 않습니다.
"@
        }

        if ($ancestorExitCode -ne 0) {
            Stop-Deployment "원격 소스 브랜치와 현재 HEAD의 선후 관계를 확인하지 못했습니다. 종료 코드: $ancestorExitCode"
        }
    }
    elseif ($remoteBranchExitCode -ne 2) {
        Stop-Deployment "원격 '$ExpectedSourceBranch' 브랜치 존재 여부를 확인하지 못했습니다. 종료 코드: $remoteBranchExitCode"
    }

    Invoke-NativeCommand "원격 '$ExpectedSourceBranch' 브랜치 쓰기 권한 사전 확인" {
        git push --dry-run $RemoteName "HEAD:refs/heads/$ExpectedSourceBranch"
    }

    Write-Host "원격 소스 브랜치의 읽기·쓰기·fast-forward 조건이 정상입니다." -ForegroundColor Green
}

function Initialize-GitAuthentication {
    param([string]$ConfiguredTokenFilePath)

    if ([string]::IsNullOrWhiteSpace($ConfiguredTokenFilePath) -and
        -not [string]::IsNullOrWhiteSpace($env:DEPLOY_GITHUB_TOKEN_FILE)) {
        $ConfiguredTokenFilePath = $env:DEPLOY_GITHUB_TOKEN_FILE
    }

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredTokenFilePath)) {
        Enable-GitHubTokenAuthentication -TokenFilePath $ConfiguredTokenFilePath
    }

    Write-Step "GitHub 원격 인증 확인"
    if (Test-GitRemoteReadAccess) {
        Write-Host "GitHub 원격 저장소 읽기 인증이 정상입니다." -ForegroundColor Green
        Test-SourceBranchPushSafety
        return
    }

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredTokenFilePath)) {
        Stop-Deployment "지정한 GitHub 토큰으로 원격 저장소에 접근하지 못했습니다. 토큰 권한과 만료 여부를 확인하십시오."
    }

    Write-Host "현재 Git Credential Manager 인증으로 원격 저장소에 접근하지 못했습니다." -ForegroundColor Yellow
    $manualTokenPath = (Read-Host "별도 보관한 GitHub 토큰 파일 경로를 입력하십시오. 취소하려면 Enter").Trim().Trim('"')

    if ([string]::IsNullOrWhiteSpace($manualTokenPath)) {
        Stop-Deployment "GitHub 인증을 확인하지 못해 배포를 중단합니다."
    }

    Enable-GitHubTokenAuthentication -TokenFilePath $manualTokenPath

    if (-not (Test-GitRemoteReadAccess)) {
        Stop-Deployment "GitHub 토큰 파일을 적용했지만 원격 저장소에 접근하지 못했습니다."
    }

    Write-Host "GitHub 토큰 파일을 통한 읽기 인증이 정상입니다." -ForegroundColor Green
    Test-SourceBranchPushSafety
}

function Test-RepositorySafety {
    param([string]$StageLabel = "저장소 안전성 확인")

    Write-Step $StageLabel

    $insideWorkTree = (& git rev-parse --is-inside-work-tree 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $insideWorkTree -ne "true") {
        Stop-Deployment "현재 폴더가 Git 저장소가 아닙니다."
    }

    $currentBranch = (& git branch --show-current | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentBranch)) {
        Stop-Deployment "현재 Git 브랜치를 확인할 수 없습니다. 분리된 HEAD 상태인지 확인하십시오."
    }

    if ($currentBranch -ne $ExpectedSourceBranch) {
        Stop-Deployment "현재 브랜치가 '$currentBranch'입니다. '$ExpectedSourceBranch' 브랜치에서만 실행할 수 있습니다."
    }

    $remoteUrl = (& git remote get-url $RemoteName 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remoteUrl)) {
        Stop-Deployment "Git 원격 저장소 '$RemoteName'을 찾을 수 없습니다."
    }

    if ($remoteUrl -notlike "*$ExpectedRemoteUrlFragment*") {
        Stop-Deployment "원격 저장소가 예상 프로젝트와 다릅니다.`n현재: '$remoteUrl'`n예상 포함값: '$ExpectedRemoteUrlFragment'"
    }

    $unmergedFiles = @(& git diff --name-only --diff-filter=U)
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "Git 충돌 파일 확인에 실패했습니다."
    }

    if ($unmergedFiles.Count -gt 0) {
        Write-Host ($unmergedFiles -join [Environment]::NewLine) -ForegroundColor Yellow
        Stop-Deployment "병합 충돌 파일이 남아 있어 패키지 적용 또는 배포를 수행할 수 없습니다."
    }

    $trackedDistFiles = @(& git ls-files -- "dist")
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "dist 추적 여부 확인에 실패했습니다."
    }

    if ($trackedDistFiles.Count -gt 0) {
        Stop-Deployment "dist 폴더가 Git 추적 대상입니다. dist를 .gitignore에 추가하고 Git 추적에서 제거한 뒤 다시 실행하십시오."
    }

    return [PSCustomObject]@{
        CurrentBranch = $currentBranch
        RemoteUrl = $remoteUrl
    }
}

function Get-DeploymentPackageSearchDirectories {
    param([string]$ConfiguredDownloadsPath)

    $rawCandidates = @(
        $ProjectParentPath,
        $projectRoot
    )

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredDownloadsPath)) {
        $rawCandidates += $ConfiguredDownloadsPath.Trim().Trim('"')
    }

    if (-not [string]::IsNullOrWhiteSpace($env:DEPLOY_DOWNLOADS_PATH)) {
        $rawCandidates += $env:DEPLOY_DOWNLOADS_PATH.Trim().Trim('"')
    }

    # 이 프로젝트에서 실제 사용하는 다운로드 폴더를 항상 독립 후보로 검색합니다.
    $rawCandidates += $PreferredDownloadsPath

    # Windows Known Folder의 Downloads 경로도 별도 후보로 추가합니다.
    try {
        $shell = New-Object -ComObject Shell.Application
        $shellDownloads = $shell.Namespace('shell:Downloads')
        if ($null -ne $shellDownloads -and
            $null -ne $shellDownloads.Self -and
            -not [string]::IsNullOrWhiteSpace($shellDownloads.Self.Path)) {
            $rawCandidates += $shellDownloads.Self.Path
        }
    }
    catch {
        # COM 조회 실패는 치명적 오류가 아니므로 나머지 후보를 계속 검색합니다.
    }

    if (-not [string]::IsNullOrWhiteSpace($HOME)) {
        $rawCandidates += (Join-Path $HOME "Downloads")
    }

    # USERPROFILE은 잘못된 드라이브를 가리킬 수 있으므로 마지막 보조 후보로만 추가합니다.
    if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
        $rawCandidates += (Join-Path $env:USERPROFILE "Downloads")
    }

    $resolvedDirectories = @()
    foreach ($candidate in $rawCandidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }

        $expandedCandidate = [Environment]::ExpandEnvironmentVariables($candidate.Trim().Trim('"'))
        if (-not (Test-Path -LiteralPath $expandedCandidate -PathType Container)) {
            continue
        }

        $resolvedCandidate = (Resolve-Path -LiteralPath $expandedCandidate).Path
        if ($resolvedDirectories -notcontains $resolvedCandidate) {
            $resolvedDirectories += $resolvedCandidate
        }
    }

    return @($resolvedDirectories)
}

function Get-LatestDeploymentPackage {
    $candidateDirectories = @(
        Get-DeploymentPackageSearchDirectories -ConfiguredDownloadsPath $DownloadsPath
    )

    if ($candidateDirectories.Count -eq 0) {
        Stop-Deployment "배포 패키지를 검색할 수 있는 폴더가 없습니다. -DownloadsPath로 실제 다운로드 폴더를 지정하십시오."
    }

    Write-Info "최신 배포 패키지 검색 경로"
    foreach ($directory in $candidateDirectories) {
        Write-Host "  - $directory" -ForegroundColor DarkYellow
    }

    $allZipFiles = @()
    $candidates = @()

    foreach ($directory in $candidateDirectories) {
        $directoryZipFiles = @(
            Get-ChildItem -LiteralPath $directory -File -Filter "*.zip" -ErrorAction SilentlyContinue
        )
        $allZipFiles += $directoryZipFiles

        $candidates += @(
            $directoryZipFiles |
                Where-Object {
                    $_.Name -match '(?i)deployment[_-]package\.zip$'
                }
        )
    }

    $uniqueCandidates = @(
        $candidates |
            Sort-Object FullName -Unique
    )

    if ($uniqueCandidates.Count -eq 0) {
        Write-Host "검색 경로에서 발견된 ZIP 파일:" -ForegroundColor Yellow
        $zipNames = @(
            $allZipFiles |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 20
        )

        if ($zipNames.Count -eq 0) {
            Write-Host "  (ZIP 파일 없음)" -ForegroundColor DarkYellow
        }
        else {
            foreach ($zipFile in $zipNames) {
                Write-Host "  - $($zipFile.FullName)" -ForegroundColor DarkYellow
            }
        }

        return $null
    }

    return $uniqueCandidates |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

function Select-DeploymentPackage {
    param([string]$ConfiguredPackagePath)

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredPackagePath)) {
        $resolvedPath = $ConfiguredPackagePath.Trim().Trim('"')
        if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
            Stop-Deployment "지정한 배포 패키지를 찾을 수 없습니다: $resolvedPath"
        }

        return (Resolve-Path -LiteralPath $resolvedPath).Path
    }

    Write-Host ""
    Write-Host "배포 패키지 적용 방식을 선택하십시오." -ForegroundColor Yellow
    Write-Host "  1: 기존 경로와 다운로드 폴더에서 최신 배포 패키지 자동 선택"
    Write-Host "  2: 배포 패키지 ZIP 경로 직접 입력"
    Write-Host "  0: 압축 패키지를 적용하지 않고 현재 소스로 배포"

    $choice = Read-MenuChoice -Prompt "선택" -AllowedValues @("0", "1", "2")

    if ($choice -eq "0") {
        return ""
    }

    if ($choice -eq "2") {
        $manualPath = (Read-Host "배포 패키지 ZIP 전체 경로").Trim().Trim('"')
        if (-not (Test-Path -LiteralPath $manualPath -PathType Leaf)) {
            Stop-Deployment "입력한 배포 패키지를 찾을 수 없습니다: $manualPath"
        }

        return (Resolve-Path -LiteralPath $manualPath).Path
    }

    $latestPackage = Get-LatestDeploymentPackage
    if ($null -eq $latestPackage) {
        Stop-Deployment "최신 배포 패키지를 자동으로 찾지 못했습니다. ZIP 경로 직접 입력 방식으로 다시 실행하십시오."
    }

    Write-Host "자동 선택된 패키지:" -ForegroundColor Green
    Write-Host "  파일: $($latestPackage.FullName)"
    Write-Host "  수정: $($latestPackage.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host "  크기: $([Math]::Round($latestPackage.Length / 1MB, 2)) MB"

    if (-not (Read-YesNo "이 패키지를 적용하시겠습니까?")) {
        Stop-Deployment "사용자가 패키지 적용을 취소했습니다."
    }

    return $latestPackage.FullName
}

function Test-ZipPackageSafety {
    param([Parameter(Mandatory = $true)][string]$ZipPath)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)

    try {
        $fileCount = 0

        foreach ($entry in $archive.Entries) {
            $entryName = $entry.FullName.Replace('\', '/')

            if ([string]::IsNullOrWhiteSpace($entryName)) {
                continue
            }

            if ($entryName.StartsWith('/') -or
                $entryName.StartsWith('../') -or
                $entryName.EndsWith('/..') -or
                $entryName.Contains('/../') -or
                $entryName.Contains(':') -or
                $entryName -match '^[A-Za-z]:') {
                Stop-Deployment "안전하지 않은 ZIP 경로가 포함되어 있습니다: $entryName"
            }

            if (-not $entryName.EndsWith('/')) {
                $fileCount += 1
            }
        }

        if ($fileCount -eq 0) {
            Stop-Deployment "배포 패키지 ZIP에 파일이 없습니다."
        }
    }
    finally {
        $archive.Dispose()
    }
}

function ConvertTo-NormalizedPackageRelativePath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $trimmed = $RelativePath.Trim().Trim('"')
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        Stop-Deployment "패키지 메타데이터에 빈 상대 경로가 포함되어 있습니다."
    }

    $candidate = $trimmed.Replace('/', '\')

    if ([System.IO.Path]::IsPathRooted($candidate) -or
        $candidate -match '^[A-Za-z]:' -or
        $candidate.StartsWith('\') -or
        $candidate.Contains(':')) {
        Stop-Deployment "패키지에는 절대 경로·드라이브 경로·대체 데이터 스트림 경로를 사용할 수 없습니다: $RelativePath"
    }

    $normalized = $candidate.TrimEnd('\')

    if ([string]::IsNullOrWhiteSpace($normalized)) {
        Stop-Deployment "패키지 메타데이터에 유효하지 않은 상대 경로가 포함되어 있습니다: $RelativePath"
    }

    $segments = @($normalized -split '\\')
    if ($segments -contains '..' -or $segments -contains '.') {
        Stop-Deployment "패키지에는 상위·현재 폴더 이동 경로를 사용할 수 없습니다: $RelativePath"
    }

    if ($normalized.IndexOf([char]0) -ge 0) {
        Stop-Deployment "패키지 경로에 NUL 문자가 포함되어 있습니다."
    }

    return $normalized
}

function Resolve-SafePackagePath {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    $normalizedRelative = ConvertTo-NormalizedPackageRelativePath -RelativePath $RelativePath
    $baseFullPath = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\')
    $resolvedPath = [System.IO.Path]::GetFullPath((Join-Path $baseFullPath $normalizedRelative))
    $requiredPrefix = $baseFullPath + '\'

    if (-not $resolvedPath.StartsWith(
            $requiredPrefix,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
        Stop-Deployment "패키지 기준 폴더 밖의 경로는 허용되지 않습니다: $RelativePath"
    }

    return $resolvedPath
}

function Read-PackagePathList {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label,
        [switch]$AllowMissing
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        if ($AllowMissing) {
            return @()
        }

        Stop-Deployment "$Label 파일이 없습니다: $Path"
    }

    $result = @()
    $seen = @{}

    foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $line = $rawLine.Trim()

        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
            continue
        }

        $normalized = ConvertTo-NormalizedPackageRelativePath -RelativePath $line
        $key = $normalized.ToLowerInvariant()

        if ($seen.ContainsKey($key)) {
            Stop-Deployment "$Label 파일에 중복 경로가 있습니다: $normalized"
        }

        $seen[$key] = $true
        $result += $normalized
    }

    return @($result)
}

function Read-PackageHashList {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-Deployment "package-meta\PACKAGE_SHA256SUMS.txt가 없습니다."
    }

    $hashes = @{}

    foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $line = $rawLine.Trim()

        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
            continue
        }

        $hashMatch = [System.Text.RegularExpressions.Regex]::Match(
            $line,
            '^(?<Hash>[0-9a-fA-F]{64})\s+\*?(?<Path>.+?)\s*$'
        )

        if (-not $hashMatch.Success) {
            Stop-Deployment "잘못된 PACKAGE_SHA256SUMS.txt 형식입니다: $line"
        }

        $relativePath = ConvertTo-NormalizedPackageRelativePath `
            -RelativePath $hashMatch.Groups['Path'].Value
        $key = $relativePath.ToLowerInvariant()

        if ($hashes.ContainsKey($key)) {
            Stop-Deployment "PACKAGE_SHA256SUMS.txt에 중복 경로가 있습니다: $relativePath"
        }

        $hashes[$key] = [PSCustomObject]@{
            RelativePath = $relativePath
            Hash = $hashMatch.Groups['Hash'].Value.ToLowerInvariant()
        }
    }

    return $hashes
}

function Test-ProtectedPackagePath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $normalized = ConvertTo-NormalizedPackageRelativePath -RelativePath $RelativePath
    $segments = @($normalized -split '\\')
    $fileName = [System.IO.Path]::GetFileName($normalized)
    $protectedSegments = @(
        '.git',
        'node_modules',
        'dist',
        '.firebase',
        '.vercel',
        '.secrets',
        'secrets',
        'package-meta'
    )

    foreach ($segment in $segments) {
        if ($protectedSegments -contains $segment) {
            return $true
        }
    }

    if ($fileName -eq '.env' -or
        $fileName -like '.env.*') {
        return $true
    }

    return $false
}

function Test-IsIntegratedDeployScriptPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $normalized = ConvertTo-NormalizedPackageRelativePath -RelativePath $RelativePath
    return $normalized.Equals(
        'deploy.ps1',
        [System.StringComparison]::OrdinalIgnoreCase
    )
}

function Get-PackageMetadataContext {
    param([Parameter(Mandatory = $true)][string]$ExtractRoot)

    $packageRoot = $ExtractRoot
    $metadataRoot = Join-Path $packageRoot 'package-meta'

    if (-not (Test-Path -LiteralPath $metadataRoot -PathType Container)) {
        $topFiles = @(
            Get-ChildItem -LiteralPath $ExtractRoot -File -Force -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -ne '__MACOSX' }
        )
        $topDirectories = @(
            Get-ChildItem -LiteralPath $ExtractRoot -Directory -Force -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -ne '__MACOSX' }
        )

        if ($topFiles.Count -eq 0 -and $topDirectories.Count -eq 1) {
            $candidateRoot = $topDirectories[0].FullName
            $candidateMetadata = Join-Path $candidateRoot 'package-meta'

            if (Test-Path -LiteralPath $candidateMetadata -PathType Container) {
                $packageRoot = $candidateRoot
                $metadataRoot = $candidateMetadata
            }
        }
    }

    if (Test-Path -LiteralPath $metadataRoot -PathType Container) {
        $manifestPath = Join-Path $metadataRoot 'PACKAGE_FILES.txt'
        $hashPath = Join-Path $metadataRoot 'PACKAGE_SHA256SUMS.txt'
        $removedPath = Join-Path $metadataRoot 'REMOVED_FILES.txt'

        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
            Stop-Deployment "필수 package-meta 파일이 없습니다: $manifestPath"
        }

        if (-not (Test-Path -LiteralPath $hashPath -PathType Leaf)) {
            Stop-Deployment "필수 package-meta 파일이 없습니다: $hashPath"
        }

        $removedManifestPresent = Test-Path -LiteralPath $removedPath -PathType Leaf
        if (-not $removedManifestPresent) {
            Write-Info "package-meta\REMOVED_FILES.txt가 없습니다. 기존 교체 도구와의 호환을 위해 삭제 목록을 빈 목록으로 처리합니다."
        }

        return [PSCustomObject]@{
            Format = 'metadata'
            PackageRoot = $packageRoot
            MetadataRoot = $metadataRoot
            ManifestPath = $manifestPath
            HashPath = $hashPath
            RemovedPath = $removedPath
            RemovedManifestPresent = $removedManifestPresent
        }
    }

    # package-meta 도입 전에 생성된 기존 배포 패키지 호환 모드.
    # 단일 상위 폴더가 실제 프로젝트 래퍼로 확인되는 경우에만 한 단계 내려간다.
    $legacyTopFiles = @(
        Get-ChildItem -LiteralPath $ExtractRoot -File -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne '__MACOSX' }
    )
    $legacyTopDirectories = @(
        Get-ChildItem -LiteralPath $ExtractRoot -Directory -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne '__MACOSX' }
    )

    if ($legacyTopFiles.Count -eq 0 -and $legacyTopDirectories.Count -eq 1) {
        $legacyCandidateRoot = $legacyTopDirectories[0].FullName
        $legacyMarkerCount = 0

        foreach ($markerFile in @('package.json', 'firebase.json', 'index.html', 'DEPLOYMENT_NOTES.txt')) {
            if (Test-Path -LiteralPath (Join-Path $legacyCandidateRoot $markerFile) -PathType Leaf) {
                $legacyMarkerCount += 2
            }
        }

        foreach ($markerDirectory in @('src', 'rules', 'public', 'tools', 'docs')) {
            if (Test-Path -LiteralPath (Join-Path $legacyCandidateRoot $markerDirectory) -PathType Container) {
                $legacyMarkerCount += 1
            }
        }

        if ($legacyMarkerCount -ge 2) {
            $packageRoot = $legacyCandidateRoot
        }
    }

    # ZIP 루트의 모든 일반 파일을 적용 대상으로 사용하고 삭제 목록은 사용할 수 없다.
    Write-Host "기존 형식 배포 패키지가 감지되었습니다." -ForegroundColor Yellow
    Write-Host "  package-meta가 없어 REMOVED_FILES.txt 누적 삭제는 수행할 수 없습니다." -ForegroundColor Yellow
    Write-Host "  패키지 내부 파일은 실행 시 계산한 SHA-256으로 복사 전·후 검증합니다." -ForegroundColor Yellow

    $legacyConfirmation = Read-Host "이 기존 형식 패키지를 적용하려면 LEGACY를 정확히 입력하십시오"
    if ($legacyConfirmation -cne 'LEGACY') {
        Stop-Deployment "기존 형식 패키지 적용을 취소했습니다."
    }

    return [PSCustomObject]@{
        Format = 'legacy'
        PackageRoot = $packageRoot
        MetadataRoot = ''
        ManifestPath = ''
        HashPath = ''
        RemovedPath = ''
        RemovedManifestPresent = $false
    }
}

function Test-PackageMetadataAndHashes {
    param([Parameter(Mandatory = $true)][PSCustomObject]$Context)

    if ($Context.Format -eq 'legacy') {
        Write-Step "기존 형식 패키지 파일 목록 및 SHA-256 생성"

        $packageFiles = @()
        $expectedHashes = @{}

        foreach ($sourceFile in @(
                Get-ChildItem `
                    -LiteralPath $Context.PackageRoot `
                    -File `
                    -Recurse `
                    -Force `
                    -ErrorAction Stop
            )) {
            $relativePath = Get-RelativePathSafe `
                -BasePath $Context.PackageRoot `
                -TargetPath $sourceFile.FullName
            $relativePath = ConvertTo-NormalizedPackageRelativePath -RelativePath $relativePath

            $segments = @($relativePath -split '\\')
            if ($segments -contains '__MACOSX') {
                continue
            }

            if (Test-ProtectedPackagePath -RelativePath $relativePath) {
                Stop-Deployment "기존 형식 패키지에 보호 경로가 포함되어 있습니다: $relativePath"
            }

            $key = $relativePath.ToLowerInvariant()
            if ($expectedHashes.ContainsKey($key)) {
                Stop-Deployment "기존 형식 패키지에 대소문자만 다른 중복 경로가 있습니다: $relativePath"
            }

            $packageFiles += $relativePath
            $expectedHashes[$key] = [PSCustomObject]@{
                RelativePath = $relativePath
                Hash = (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            }
        }

        $packageFiles = @($packageFiles | Sort-Object -Unique)
        if ($packageFiles.Count -eq 0) {
            Stop-Deployment "기존 형식 패키지에 적용할 파일이 없습니다."
        }

        Write-Host "기존 형식 패키지 검증 완료" -ForegroundColor Green
        Write-Host "  적용 파일: $($packageFiles.Count)개"
        Write-Host "  삭제 목록: 사용할 수 없음"

        return [PSCustomObject]@{
            Format = 'legacy'
            PackageFiles = @($packageFiles)
            RemovedFiles = @()
            ExpectedHashes = $expectedHashes
        }
    }

    $packageFiles = @(
        Read-PackagePathList `
            -Path $Context.ManifestPath `
            -Label 'PACKAGE_FILES.txt'
    )
    $removedFiles = @(
        Read-PackagePathList `
            -Path $Context.RemovedPath `
            -Label 'REMOVED_FILES.txt' `
            -AllowMissing
    )
    $expectedHashes = Read-PackageHashList -Path $Context.HashPath

    if ($packageFiles.Count -eq 0) {
        Stop-Deployment "PACKAGE_FILES.txt가 비어 있습니다."
    }

    $packageFileKeys = @{}

    Write-Step "package-meta 목록 및 패키지 내부 SHA-256 검증"

    foreach ($relativePath in $packageFiles) {
        if (Test-ProtectedPackagePath -RelativePath $relativePath) {
            Stop-Deployment "PACKAGE_FILES.txt에 보호 경로가 포함되어 있습니다: $relativePath"
        }

        $sourcePath = Resolve-SafePackagePath `
            -BasePath $Context.PackageRoot `
            -RelativePath $relativePath

        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            Stop-Deployment "PACKAGE_FILES.txt에 기록된 파일이 ZIP에 없습니다: $relativePath"
        }

        $key = $relativePath.ToLowerInvariant()
        $packageFileKeys[$key] = $true

        if (-not $expectedHashes.ContainsKey($key)) {
            Stop-Deployment "PACKAGE_SHA256SUMS.txt에 해시가 없습니다: $relativePath"
        }

        $actualHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
        $expectedHash = $expectedHashes[$key].Hash

        if ($actualHash -ne $expectedHash) {
            Stop-Deployment "패키지 내부 SHA-256이 일치하지 않습니다: $relativePath"
        }
    }

    foreach ($hashKey in @($expectedHashes.Keys)) {
        if (-not $packageFileKeys.ContainsKey($hashKey)) {
            Stop-Deployment "PACKAGE_SHA256SUMS.txt에 PACKAGE_FILES.txt에 없는 경로가 있습니다: $($expectedHashes[$hashKey].RelativePath)"
        }
    }

    foreach ($relativePath in $removedFiles) {
        if ((Test-ProtectedPackagePath -RelativePath $relativePath) -or
            (Test-IsIntegratedDeployScriptPath -RelativePath $relativePath)) {
            Stop-Deployment "REMOVED_FILES.txt에 보호 경로가 포함되어 있습니다: $relativePath"
        }
    }

    Write-Host "package-meta 검증 완료" -ForegroundColor Green
    Write-Host "  적용 파일: $($packageFiles.Count)개"
    Write-Host "  누적 삭제 대상: $($removedFiles.Count)개"
    Write-Host "  해시 항목: $($expectedHashes.Count)개"

    return [PSCustomObject]@{
        Format = 'metadata'
        PackageFiles = @($packageFiles)
        RemovedFiles = @($removedFiles)
        ExpectedHashes = $expectedHashes
    }
}

function Get-ExistingAffectedProjectFiles {
    param([Parameter(Mandatory = $true)][string[]]$AffectedPaths)

    $filesByKey = @{}

    foreach ($relativePath in $AffectedPaths) {
        $existingPath = Resolve-SafePackagePath `
            -BasePath $projectRoot `
            -RelativePath $relativePath

        if (Test-Path -LiteralPath $existingPath -PathType Leaf) {
            $normalizedRelative = Get-RelativePathSafe `
                -BasePath $projectRoot `
                -TargetPath $existingPath
            $filesByKey[$normalizedRelative.ToLowerInvariant()] = $normalizedRelative
            continue
        }

        if (Test-Path -LiteralPath $existingPath -PathType Container) {
            foreach ($existingFile in Get-ChildItem `
                    -LiteralPath $existingPath `
                    -File `
                    -Recurse `
                    -Force `
                    -ErrorAction Stop) {
                $normalizedRelative = Get-RelativePathSafe `
                    -BasePath $projectRoot `
                    -TargetPath $existingFile.FullName
                $filesByKey[$normalizedRelative.ToLowerInvariant()] = $normalizedRelative
            }
        }
    }

    return @($filesByKey.Values | Sort-Object)
}

function Restore-PackageBackup {
    param(
        [Parameter(Mandatory = $true)][string[]]$AffectedPaths,
        [Parameter(Mandatory = $true)][string]$BackupStageRoot,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$BackedUpFiles
    )

    Write-Host "패키지 적용 실패로 자동 복원을 시작합니다." -ForegroundColor Yellow

    $removalOrder = @(
        $AffectedPaths |
            Sort-Object -Property @{ Expression = { $_.Length }; Descending = $true }
    )

    foreach ($relativePath in $removalOrder) {
        $targetPath = Resolve-SafePackagePath `
            -BasePath $projectRoot `
            -RelativePath $relativePath

        if (Test-Path -LiteralPath $targetPath) {
            Remove-Item -LiteralPath $targetPath -Recurse -Force -ErrorAction Stop
        }
    }

    foreach ($relativePath in $BackedUpFiles) {
        $backupFile = Resolve-SafePackagePath `
            -BasePath $BackupStageRoot `
            -RelativePath $relativePath

        if (-not (Test-Path -LiteralPath $backupFile -PathType Leaf)) {
            Stop-Deployment "자동 복원용 백업 파일이 없습니다: $relativePath"
        }

        $restoreDestination = Resolve-SafePackagePath `
            -BasePath $projectRoot `
            -RelativePath $relativePath
        $restoreParent = Split-Path -Parent $restoreDestination

        if (-not (Test-Path -LiteralPath $restoreParent -PathType Container)) {
            New-Item -ItemType Directory -Path $restoreParent -Force | Out-Null
        }

        Copy-Item `
            -LiteralPath $backupFile `
            -Destination $restoreDestination `
            -Force
    }

    Write-Host "패키지 적용 전 상태 자동 복원 완료" -ForegroundColor Green
}

function Test-RemovedPathShouldRemainAbsent {
    param(
        [Parameter(Mandatory = $true)][string]$RemovedPath,
        [Parameter(Mandatory = $true)][string[]]$PackageFiles
    )

    $normalizedRemoved = ConvertTo-NormalizedPackageRelativePath -RelativePath $RemovedPath
    $prefix = $normalizedRemoved.TrimEnd('\') + '\'

    foreach ($packageFile in $PackageFiles) {
        if ($packageFile.Equals(
                $normalizedRemoved,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -or
            $packageFile.StartsWith(
                $prefix,
                [System.StringComparison]::OrdinalIgnoreCase
            )) {
            return $false
        }
    }

    return $true
}

function Get-FullProjectBackupFileList {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectPath,
        [string]$SelectedPackagePath = ""
    )

    $projectFullPath = [System.IO.Path]::GetFullPath($ProjectPath).TrimEnd('\', '/')
    $selectedPackageFullPath = ""

    if (-not [string]::IsNullOrWhiteSpace($SelectedPackagePath)) {
        $selectedPackageFullPath = [System.IO.Path]::GetFullPath($SelectedPackagePath)
    }

    $excludedTopLevelDirectories = @(
        '.git',
        'node_modules',
        'dist',
        '.firebase',
        '.vercel',
        '.secrets',
        'secrets'
    )

    $resultByKey = @{}

    foreach ($file in @(Get-ChildItem -LiteralPath $projectFullPath -File -Recurse -Force -ErrorAction Stop)) {
        $fileFullPath = [System.IO.Path]::GetFullPath($file.FullName)

        if (-not [string]::IsNullOrWhiteSpace($selectedPackageFullPath) -and
            $fileFullPath.Equals(
                $selectedPackageFullPath,
                [System.StringComparison]::OrdinalIgnoreCase
            )) {
            continue
        }

        $relativePath = Get-RelativePathSafe -BasePath $projectFullPath -TargetPath $fileFullPath
        $normalizedRelativePath = $relativePath.Replace('/', '\')
        $segments = @($normalizedRelativePath.Split('\'))
        $topLevel = if ($segments.Count -gt 0) { $segments[0] } else { '' }
        $leafName = [System.IO.Path]::GetFileName($normalizedRelativePath)

        $containsExcludedSegment = $false
        foreach ($segment in $segments) {
            if ($excludedTopLevelDirectories -contains $segment) {
                $containsExcludedSegment = $true
                break
            }
        }

        if ($containsExcludedSegment) {
            continue
        }

        if ($leafName.Equals('.env', [System.StringComparison]::OrdinalIgnoreCase) -or
            $leafName.StartsWith('.env.', [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }

        $key = $normalizedRelativePath.ToLowerInvariant()
        $resultByKey[$key] = $normalizedRelativePath
    }

    return @($resultByKey.Values | Sort-Object)
}

function Test-FullProjectBackupZip {
    param(
        [Parameter(Mandatory = $true)][string]$BackupZipPath,
        [Parameter(Mandatory = $true)][string[]]$ExpectedFiles,
        [Parameter(Mandatory = $true)][hashtable]$ExpectedHashes,
        [Parameter(Mandatory = $true)][string]$VerificationRoot
    )

    if (Test-Path -LiteralPath $VerificationRoot) {
        Remove-Item -LiteralPath $VerificationRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Path $VerificationRoot -Force | Out-Null
    Expand-Archive -LiteralPath $BackupZipPath -DestinationPath $VerificationRoot -Force

    foreach ($relativePath in $ExpectedFiles) {
        $verifiedFile = Resolve-SafePackagePath `
            -BasePath $VerificationRoot `
            -RelativePath $relativePath

        if (-not (Test-Path -LiteralPath $verifiedFile -PathType Leaf)) {
            Stop-Deployment "전체 프로젝트 백업 ZIP에 파일이 누락되었습니다: $relativePath"
        }

        $key = $relativePath.ToLowerInvariant()
        $actualHash = (Get-FileHash -LiteralPath $verifiedFile -Algorithm SHA256).Hash.ToLowerInvariant()
        if (-not $ExpectedHashes.ContainsKey($key) -or
            $actualHash -ne $ExpectedHashes[$key]) {
            Stop-Deployment "전체 프로젝트 백업 ZIP의 SHA-256이 원본과 일치하지 않습니다: $relativePath"
        }
    }

    $verifiedFiles = @(
        Get-ChildItem -LiteralPath $VerificationRoot -File -Recurse -Force -ErrorAction Stop
    )

    if ($verifiedFiles.Count -ne $ExpectedFiles.Count) {
        Stop-Deployment "전체 프로젝트 백업 ZIP 파일 수가 원본과 다릅니다. 원본: $($ExpectedFiles.Count), ZIP: $($verifiedFiles.Count)"
    }

    Write-Host "전체 프로젝트 백업 ZIP 파일 수·경로·SHA-256 검증 완료" -ForegroundColor Green
}

function Apply-DeploymentPackage {
    param([Parameter(Mandatory = $true)][string]$ZipPath)

    Write-Step "배포 패키지 ZIP 경로 안전성 검사"
    Test-ZipPackageSafety -ZipPath $ZipPath

    $packageHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash
    Write-Host "패키지 ZIP SHA-256: $packageHash" -ForegroundColor DarkGray

    New-Item -ItemType Directory -Path $PackageTempRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $PackageBackupRoot -Force | Out-Null

    $stagePath = Join-Path $PackageTempRoot "package_$timestamp"
    $backupStagePath = Join-Path $PackageTempRoot "backup_$timestamp"
    $backupVerifyPath = Join-Path $PackageTempRoot "verify_$timestamp"
    $targetName = Split-Path -Leaf $projectRoot
    $backupZipPath = Join-Path `
        $PackageBackupRoot `
        ("${targetName}_before_${timestamp}.zip")

    New-Item -ItemType Directory -Path $stagePath -Force | Out-Null
    New-Item -ItemType Directory -Path $backupStagePath -Force | Out-Null

    Write-Step "배포 패키지 임시 폴더에 압축 해제"
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $stagePath -Force

    $context = Get-PackageMetadataContext -ExtractRoot $stagePath
    $validated = Test-PackageMetadataAndHashes -Context $context

    $affectedPaths = @(
        @($validated.PackageFiles + $validated.RemovedFiles) |
            Sort-Object -Unique
    )

    # 오류 발생 시 자동 복원에 사용할 실제 영향 파일 목록입니다.
    $existingAffectedFiles = @(
        Get-ExistingAffectedProjectFiles -AffectedPaths $affectedPaths
    )

    Write-Step "기존 프로젝트 전체 소스 ZIP 백업"

    # 업로드된 기존 백업 ZIP의 실제 구조를 기준으로 한다.
    # 프로젝트 루트의 소스·설정·문서·도구 파일 전체를 상대경로 그대로 백업하며,
    # Git 내부 데이터, 의존성, 빌드 결과, 배포 캐시와 비밀정보만 제외한다.
    $fullBackupFiles = @(
        Get-FullProjectBackupFileList `
            -ProjectPath $projectRoot `
            -SelectedPackagePath $ZipPath
    )

    if ($fullBackupFiles.Count -eq 0) {
        Stop-Deployment "전체 프로젝트 백업 대상 파일이 없습니다. 프로젝트 경로를 확인하십시오."
    }

    $fullBackupHashes = @{}

    foreach ($relativePath in $fullBackupFiles) {
        $sourcePath = Resolve-SafePackagePath `
            -BasePath $projectRoot `
            -RelativePath $relativePath
        $backupDestination = Resolve-SafePackagePath `
            -BasePath $backupStagePath `
            -RelativePath $relativePath
        $backupParent = Split-Path -Parent $backupDestination

        if (-not (Test-Path -LiteralPath $backupParent -PathType Container)) {
            New-Item -ItemType Directory -Path $backupParent -Force | Out-Null
        }

        $fullBackupHashes[$relativePath.ToLowerInvariant()] = `
            (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()

        Copy-Item -LiteralPath $sourcePath -Destination $backupDestination -Force
    }

    if (Test-Path -LiteralPath $backupZipPath -PathType Leaf) {
        Remove-Item -LiteralPath $backupZipPath -Force
    }

    # 기존 replace-project-from-zip.ps1과 동일하게 프로젝트 내용물을 ZIP 루트에 둔다.
    $backupItems = @(Get-ChildItem -LiteralPath $backupStagePath -Force)
    if ($backupItems.Count -eq 0) {
        Stop-Deployment "백업 임시 폴더가 비어 있어 ZIP을 만들 수 없습니다."
    }

    Compress-Archive `
        -Path $backupItems.FullName `
        -DestinationPath $backupZipPath `
        -CompressionLevel Optimal `
        -Force

    if (-not (Test-Path -LiteralPath $backupZipPath -PathType Leaf)) {
        Stop-Deployment "프로젝트 전체 백업 ZIP이 생성되지 않았습니다: $backupZipPath"
    }

    $backupZipItem = Get-Item -LiteralPath $backupZipPath
    if ($backupZipItem.Length -le 0) {
        Stop-Deployment "프로젝트 전체 백업 ZIP이 비어 있습니다: $backupZipPath"
    }

    # 생성된 ZIP을 별도 폴더에 다시 풀어 파일 수·경로·SHA-256을 원본과 대조한다.
    Test-FullProjectBackupZip `
        -BackupZipPath $backupZipPath `
        -ExpectedFiles $fullBackupFiles `
        -ExpectedHashes $fullBackupHashes `
        -VerificationRoot $backupVerifyPath

    $script:packageBackupPath = $backupZipPath
    Write-Host "프로젝트 전체 소스 백업 완료" -ForegroundColor Green
    Write-Host "  백업 파일: $($fullBackupFiles.Count)개"
    Write-Host "  백업 ZIP : $backupZipPath"
    Write-Info "제외 항목: .git, node_modules, dist, .firebase, .vercel, .env 계열, secrets/.secrets, 현재 적용할 패키지 ZIP"

    $mutationStarted = $false

    try {
        Write-Step "REMOVED_FILES.txt 누적 삭제 대상 정리"
        $mutationStarted = $true

        $deletedCount = 0
        $alreadyAbsentCount = 0
        $removalOrder = @(
            $validated.RemovedFiles |
                Sort-Object -Property @{ Expression = { $_.Length }; Descending = $true }
        )

        foreach ($relativePath in $removalOrder) {
            $targetToRemove = Resolve-SafePackagePath `
                -BasePath $projectRoot `
                -RelativePath $relativePath

            if (Test-Path -LiteralPath $targetToRemove) {
                Remove-Item -LiteralPath $targetToRemove -Recurse -Force
                Write-Host "  삭제: $relativePath"
                $deletedCount += 1
            }
            else {
                $alreadyAbsentCount += 1
            }
        }

        Write-Host "삭제 목록 처리 완료" -ForegroundColor Green
        Write-Host "  실제 삭제: $($deletedCount)개"
        Write-Host "  이미 없음: $($alreadyAbsentCount)개"

        Write-Step "PACKAGE_FILES.txt 기준 새 패키지 파일 복사"

        $appliedCount = 0
        $skippedControlScriptCount = 0
        foreach ($relativePath in $validated.PackageFiles) {
            if (Test-IsIntegratedDeployScriptPath -RelativePath $relativePath) {
                Write-Info "패키지의 deploy.ps1은 감사 통합 배포 스크립트 v13.3을 보존하기 위해 적용하지 않습니다."
                $skippedControlScriptCount += 1
                continue
            }

            $sourcePath = Resolve-SafePackagePath `
                -BasePath $context.PackageRoot `
                -RelativePath $relativePath
            $destinationPath = Resolve-SafePackagePath `
                -BasePath $projectRoot `
                -RelativePath $relativePath
            $destinationParent = Split-Path -Parent $destinationPath

            if (Test-Path -LiteralPath $destinationPath -PathType Container) {
                Stop-Deployment "패키지 파일 대상 경로에 폴더가 남아 있어 복사할 수 없습니다: $relativePath"
            }

            if (-not (Test-Path -LiteralPath $destinationParent -PathType Container)) {
                New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
            }

            Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
            $appliedCount += 1
        }

        Write-Step "패키지 적용 후 SHA-256 및 삭제 결과 재검증"

        foreach ($relativePath in $validated.PackageFiles) {
            if (Test-IsIntegratedDeployScriptPath -RelativePath $relativePath) {
                continue
            }

            $destinationPath = Resolve-SafePackagePath `
                -BasePath $projectRoot `
                -RelativePath $relativePath

            if (-not (Test-Path -LiteralPath $destinationPath -PathType Leaf)) {
                Stop-Deployment "패키지 적용 후 파일이 없습니다: $relativePath"
            }

            $key = $relativePath.ToLowerInvariant()
            $actualHash = (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash.ToLowerInvariant()
            $expectedHash = $validated.ExpectedHashes[$key].Hash

            if ($actualHash -ne $expectedHash) {
                Stop-Deployment "패키지 적용 후 SHA-256이 일치하지 않습니다: $relativePath"
            }
        }

        foreach ($relativePath in $validated.RemovedFiles) {
            if (-not (Test-RemovedPathShouldRemainAbsent `
                    -RemovedPath $relativePath `
                    -PackageFiles $validated.PackageFiles)) {
                continue
            }

            $removedTargetPath = Resolve-SafePackagePath `
                -BasePath $projectRoot `
                -RelativePath $relativePath

            if (Test-Path -LiteralPath $removedTargetPath) {
                Stop-Deployment "REMOVED_FILES.txt 대상이 삭제 후에도 남아 있습니다: $relativePath"
            }
        }

        $script:packageApplied = $true

        Write-Host "패키지 적용 완료" -ForegroundColor Green
        Write-Host "  적용 파일: $($appliedCount)개"
        if ($skippedControlScriptCount -gt 0) {
            Write-Host "  통합 스크립트 보존으로 건너뜀: $($skippedControlScriptCount)개 (deploy.ps1)"
        }
        Write-Host "  패키지 형식: $($validated.Format)"
        Write-Host "  누적 삭제 목록: $($validated.RemovedFiles.Count)개"
        Write-Host "  적용 전 전체 백업 ZIP: $backupZipPath"
        if ($validated.Format -eq 'metadata') {
            Write-Host "  package-meta 폴더는 프로젝트에 복사하지 않았습니다."
        }
        else {
            Write-Host "  기존 형식 패키지이므로 package-meta 및 누적 삭제 목록은 없었습니다."
        }
    }
    catch {
        $applyError = $_

        if ($mutationStarted) {
            try {
                Restore-PackageBackup `
                    -AffectedPaths $affectedPaths `
                    -BackupStageRoot $backupStagePath `
                    -BackedUpFiles $existingAffectedFiles
            }
            catch {
                $rollbackError = $_.Exception.Message
                Stop-Deployment "패키지 적용 오류: $($applyError.Exception.Message)`n자동 복원도 실패했습니다: $rollbackError`n전체 백업 ZIP: $backupZipPath"
            }
        }

        Stop-Deployment "패키지 적용 오류로 영향 파일을 자동 복원했습니다: $($applyError.Exception.Message)`n전체 백업 ZIP: $backupZipPath"
    }
}

function Select-FirebaseDeployMode {
    Write-Host ""
    Write-Host "Firebase Firestore 배포 범위를 선택하십시오." -ForegroundColor Yellow
    Write-Host "  1: 보안 규칙만 배포       (firestore:rules)"
    Write-Host "  2: 복합 인덱스만 배포     (firestore:indexes)"
    Write-Host "  3: 규칙과 인덱스 모두 배포 (firestore)"
    Write-Host "  0: Firebase 배포 생략"

    $choice = Read-MenuChoice -Prompt "선택" -AllowedValues @("0", "1", "2", "3")

    switch ($choice) {
        "1" { return "rules" }
        "2" { return "indexes" }
        "3" { return "all" }
        default { return "none" }
    }
}

function Get-FirebaseCliPath {
    $localFirebase = Join-Path $projectRoot "node_modules\.bin\firebase.cmd"
    if (Test-Path -LiteralPath $localFirebase -PathType Leaf) {
        return $localFirebase
    }

    $firebaseCmd = Get-Command "firebase.cmd" -ErrorAction SilentlyContinue
    if ($null -ne $firebaseCmd) {
        return $firebaseCmd.Source
    }

    $firebaseCommand = Get-Command "firebase" -ErrorAction SilentlyContinue
    if ($null -ne $firebaseCommand) {
        return $firebaseCommand.Source
    }

    return ""
}

function Invoke-FirebaseRaw {
    param(
        [Parameter(Mandatory = $true)][string]$FirebaseCliPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    & $FirebaseCliPath @Arguments
    return $LASTEXITCODE
}

function Test-FirebaseAuthentication {
    param([Parameter(Mandatory = $true)][string]$FirebaseCliPath)

    $testOutput = & $FirebaseCliPath projects:list --json 2>$null | Out-String
    $testExitCode = $LASTEXITCODE

    if ($testExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($testOutput)) {
        return $false
    }

    try {
        $json = $testOutput | ConvertFrom-Json
        $serialized = $json | ConvertTo-Json -Depth 10 -Compress
        return ($serialized -like "*$FirebaseProjectId*")
    }
    catch {
        return ($testOutput -like "*$FirebaseProjectId*")
    }
}

function Initialize-FirebaseAuthentication {
    param(
        [Parameter(Mandatory = $true)][string]$FirebaseCliPath,
        [string]$ConfiguredTokenFilePath
    )

    if ([string]::IsNullOrWhiteSpace($ConfiguredTokenFilePath) -and
        -not [string]::IsNullOrWhiteSpace($env:DEPLOY_FIREBASE_TOKEN_FILE)) {
        $ConfiguredTokenFilePath = $env:DEPLOY_FIREBASE_TOKEN_FILE
    }

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredTokenFilePath)) {
        $ConfiguredTokenFilePath = $ConfiguredTokenFilePath.Trim().Trim('"')
        Assert-SecretPathOutsideProject -Path $ConfiguredTokenFilePath -Label "Firebase 토큰"
        $env:FIREBASE_TOKEN = Get-TokenFromFile -Path $ConfiguredTokenFilePath
        Write-Host "Firebase 토큰 파일 인증을 적용했습니다: $ConfiguredTokenFilePath" -ForegroundColor Green
        Write-Info "FIREBASE_TOKEN 방식은 Firebase의 기존(legacy) 인증 방식입니다. 로컬 PC에서는 firebase login 방식이 더 권장됩니다."
    }

    Write-Step "Firebase CLI 인증 및 프로젝트 접근 확인"
    if (Test-FirebaseAuthentication -FirebaseCliPath $FirebaseCliPath) {
        Write-Host "Firebase 인증과 프로젝트 접근이 정상입니다: $FirebaseProjectId" -ForegroundColor Green
        return
    }

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredTokenFilePath)) {
        Stop-Deployment "지정한 Firebase 토큰으로 '$FirebaseProjectId' 프로젝트에 접근하지 못했습니다."
    }

    Write-Host "저장된 Firebase 로그인 세션이 없거나 만료됐습니다." -ForegroundColor Yellow
    Write-Host "브라우저 로그인을 시작합니다." -ForegroundColor Yellow

    # 만료된 FIREBASE_TOKEN 환경변수가 대화형 로그인을 방해하지 않도록 제거합니다.
    $env:FIREBASE_TOKEN = $null
    & $FirebaseCliPath login
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "firebase login에 실패했습니다. 종료 코드: $LASTEXITCODE"
    }

    if (-not (Test-FirebaseAuthentication -FirebaseCliPath $FirebaseCliPath)) {
        Stop-Deployment "Firebase 로그인 후에도 '$FirebaseProjectId' 프로젝트 접근을 확인하지 못했습니다."
    }

    Write-Host "Firebase 로그인 및 프로젝트 접근 확인 완료" -ForegroundColor Green
}

function Test-FirebaseConfiguration {
    param([Parameter(Mandatory = $true)][string]$Mode)

    if ($Mode -eq "none") {
        return
    }

    $firebaseJsonPath = Join-Path $projectRoot "firebase.json"
    if (-not (Test-Path -LiteralPath $firebaseJsonPath -PathType Leaf)) {
        Stop-Deployment "firebase.json이 없습니다: $firebaseJsonPath"
    }

    try {
        $firebaseConfig = Get-Content -LiteralPath $firebaseJsonPath -Raw | ConvertFrom-Json
    }
    catch {
        Stop-Deployment "firebase.json을 읽을 수 없습니다: $($_.Exception.Message)"
    }

    if (-not ($firebaseConfig.PSObject.Properties.Name -contains "firestore")) {
        Stop-Deployment "firebase.json에 firestore 설정이 없습니다."
    }

    $firestoreConfig = $firebaseConfig.firestore
    if ($firestoreConfig -is [System.Array]) {
        if ($firestoreConfig.Count -eq 0) {
            Stop-Deployment "firebase.json의 firestore 설정 배열이 비어 있습니다."
        }
        $firestoreConfig = $firestoreConfig[0]
    }

    if ($Mode -in @("rules", "all")) {
        if (-not ($firestoreConfig.PSObject.Properties.Name -contains "rules")) {
            Stop-Deployment "firebase.json에 Firestore rules 경로가 없습니다."
        }

        $rulesRelativePath = [string]$firestoreConfig.rules
        if ([string]::IsNullOrWhiteSpace($rulesRelativePath)) {
            Stop-Deployment "firebase.json에 Firestore rules 경로가 없습니다."
        }

        $rulesPath = Join-Path $projectRoot $rulesRelativePath
        if (-not (Test-Path -LiteralPath $rulesPath -PathType Leaf)) {
            Stop-Deployment "Firestore 규칙 파일을 찾을 수 없습니다: $rulesPath"
        }
    }

    if ($Mode -in @("indexes", "all")) {
        if (-not ($firestoreConfig.PSObject.Properties.Name -contains "indexes")) {
            Stop-Deployment "firebase.json에 Firestore indexes 경로가 없습니다."
        }

        $indexesRelativePath = [string]$firestoreConfig.indexes
        if ([string]::IsNullOrWhiteSpace($indexesRelativePath)) {
            Stop-Deployment "firebase.json에 Firestore indexes 경로가 없습니다."
        }

        $indexesPath = Join-Path $projectRoot $indexesRelativePath
        if (-not (Test-Path -LiteralPath $indexesPath -PathType Leaf)) {
            Stop-Deployment "Firestore 인덱스 파일을 찾을 수 없습니다: $indexesPath"
        }

        try {
            Get-Content -LiteralPath $indexesPath -Raw | ConvertFrom-Json | Out-Null
        }
        catch {
            Stop-Deployment "Firestore 인덱스 JSON 형식이 올바르지 않습니다: $($_.Exception.Message)"
        }
    }
}

function Deploy-FirebaseResources {
    param(
        [Parameter(Mandatory = $true)][string]$Mode,
        [AllowEmptyString()][string]$FirebaseCliPath = ""
    )

    if ($Mode -eq "none") {
        Write-Info "Firebase 배포를 생략합니다."
        return
    }

    if ([string]::IsNullOrWhiteSpace($FirebaseCliPath)) {
        Stop-Deployment "Firebase 배포가 선택됐지만 Firebase CLI 경로가 비어 있습니다."
    }

    $onlyTarget = ""
    $description = ""

    switch ($Mode) {
        "rules" {
            $onlyTarget = "firestore:rules"
            $description = "Firebase Firestore 보안 규칙 배포"
        }
        "indexes" {
            $onlyTarget = "firestore:indexes"
            $description = "Firebase Firestore 복합 인덱스 배포"
        }
        "all" {
            $onlyTarget = "firestore"
            $description = "Firebase Firestore 규칙과 인덱스 전체 배포"
        }
        default {
            Stop-Deployment "알 수 없는 Firebase 배포 모드입니다: $Mode"
        }
    }

    Write-Step $description
    & $FirebaseCliPath deploy --only $onlyTarget --project $FirebaseProjectId
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "$description 실패. 종료 코드: $LASTEXITCODE"
    }

    $script:firebaseDeployed = $true
    Write-Host "$description 완료" -ForegroundColor Green
}

function Get-TrackedFileState {
    $trackedFiles = @(& git ls-files)

    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "Git 추적 파일 목록 확인에 실패했습니다."
    }

    $state = @{}

    foreach ($relativePath in $trackedFiles) {
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            continue
        }

        if (Test-Path -LiteralPath $relativePath -PathType Leaf) {
            $state[$relativePath] = (Get-FileHash -LiteralPath $relativePath -Algorithm SHA256).Hash
        }
        else {
            $state[$relativePath] = "<MISSING>"
        }
    }

    return $state
}

function Compare-TrackedFileState {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Before,
        [Parameter(Mandatory = $true)][hashtable]$After
    )

    $allPaths = @($Before.Keys + $After.Keys | Sort-Object -Unique)
    $changedPaths = @()

    foreach ($path in $allPaths) {
        $beforeValue = if ($Before.ContainsKey($path)) { $Before[$path] } else { "<NOT_TRACKED>" }
        $afterValue = if ($After.ContainsKey($path)) { $After[$path] } else { "<NOT_TRACKED>" }

        if ($beforeValue -ne $afterValue) {
            $changedPaths += $path
        }
    }

    return $changedPaths
}

try {
    Push-Location $projectRoot

    Write-Host "========================================"
    Write-Host "통합 패키지·GitHub·Firebase 배포 시작"
    Write-Host "스크립트 버전: $ScriptVersion"
    Write-Host "작업 폴더 : $projectRoot"
    Write-Host "소스 브랜치: $ExpectedSourceBranch"
    Write-Host "운영 브랜치: $PublishBranch"
    Write-Host "Firebase 프로젝트: $FirebaseProjectId"
    Write-Host "커밋 메시지: $CommitMessage"
    Write-Host "========================================"

    # 프로젝트 폴더 고정
    $currentProjectPath = ([System.IO.Path]::GetFullPath($projectRoot)).TrimEnd('\')
    $normalizedExpectedPath = ([System.IO.Path]::GetFullPath($ExpectedProjectPath)).TrimEnd('\')

    if (-not [string]::Equals(
        $currentProjectPath,
        $normalizedExpectedPath,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        Stop-Deployment "deploy.ps1을 허용된 프로젝트 폴더에 저장한 뒤 실행해야 합니다.`n현재: $currentProjectPath`n허용: $normalizedExpectedPath"
    }

    foreach ($commandName in @("git", "npm")) {
        if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
            Stop-Deployment "필수 명령 '$commandName'을 찾을 수 없습니다."
        }
    }

    # 패키지로 파일을 변경하기 전에 저장소·브랜치·원격·충돌·dist 추적을 먼저 검증합니다.
    $repositoryState = Test-RepositorySafety -StageLabel "패키지 적용 전 저장소 안전성 확인"
    $currentBranch = $repositoryState.CurrentBranch
    $remoteUrl = $repositoryState.RemoteUrl

    # 실제 파일 변경 전에 작업 범위를 모두 선택
    $selectedPackagePath = Select-DeploymentPackage -ConfiguredPackagePath $PackagePath
    if (-not [string]::IsNullOrWhiteSpace($selectedPackagePath) -and
        (Test-IsPathInsideProject -Path $selectedPackagePath)) {
        $selectedPackageRelativePath = Get-RelativePathSafe -BasePath $projectRoot -TargetPath $selectedPackagePath
        Write-Info "선택한 ZIP이 프로젝트 내부에 있어 Git 커밋 대상에서는 자동 제외합니다: $selectedPackageRelativePath"
    }

    $selectedFirebaseMode = Select-FirebaseDeployMode

    $packageDescription = if ([string]::IsNullOrWhiteSpace($selectedPackagePath)) {
        "적용 안 함"
    }
    else {
        $selectedPackagePath
    }

    $firebaseDescription = switch ($selectedFirebaseMode) {
        "rules" { "보안 규칙만" }
        "indexes" { "복합 인덱스만" }
        "all" { "규칙과 인덱스 모두" }
        default { "배포 안 함" }
    }

    Write-Host ""
    Write-Host "실행 예정 작업" -ForegroundColor Yellow
    Write-Host "  패키지: $packageDescription"
    Write-Host "  GitHub: $ExpectedSourceBranch 빌드·커밋·푸시 후 운영 발행 여부 선택"
    Write-Host "  Firebase: $firebaseDescription"
    Write-Host ""

    $runConfirmation = Read-Host "계속하려면 START를 정확히 입력하십시오"
    if ($runConfirmation -cne "START") {
        Write-Host "사용자가 통합 배포를 취소했습니다." -ForegroundColor Yellow
        exit 0
    }

    # 파일을 변경하기 전에 원격 인증·쓰기 권한과 Firebase 인증을 먼저 확인합니다.
    Initialize-GitAuthentication -ConfiguredTokenFilePath $GitHubTokenFilePath

    $firebaseCliPath = ""
    if ($selectedFirebaseMode -ne "none") {
        $firebaseCliPath = Get-FirebaseCliPath
        if ([string]::IsNullOrWhiteSpace($firebaseCliPath)) {
            Stop-Deployment "Firebase CLI를 찾을 수 없습니다. 먼저 'npm install -g firebase-tools'를 실행하십시오."
        }

        Initialize-FirebaseAuthentication -FirebaseCliPath $firebaseCliPath -ConfiguredTokenFilePath $FirebaseTokenFilePath
    }

    if (-not [string]::IsNullOrWhiteSpace($selectedPackagePath)) {
        Apply-DeploymentPackage -ZipPath $selectedPackagePath
    }
    else {
        Write-Info "압축 패키지 적용을 생략합니다."
    }

    # 패키지가 Git 구조·충돌·dist 추적 상태를 바꾸지 않았는지 다시 확인합니다.
    $repositoryStateAfterPackage = Test-RepositorySafety -StageLabel "패키지 적용 후 저장소 안전성 재확인"
    $currentBranch = $repositoryStateAfterPackage.CurrentBranch
    $remoteUrl = $repositoryStateAfterPackage.RemoteUrl

    if (-not (Test-Path ".\package.json" -PathType Leaf)) {
        Stop-Deployment "package.json이 없습니다. 프로젝트 루트와 패키지 내용을 확인하십시오."
    }

    # node_modules가 없으면 package-lock.json을 기준으로 복원
    if (-not (Test-Path ".\node_modules" -PathType Container)) {
        if (-not (Test-Path ".\package-lock.json" -PathType Leaf)) {
            Stop-Deployment "node_modules와 package-lock.json이 모두 없어 의존성을 자동 복원할 수 없습니다."
        }

        Invoke-NativeCommand "Node.js 의존성 복원 (npm ci)" { npm ci }
    }

    Test-FirebaseConfiguration -Mode $selectedFirebaseMode

    Write-Host "현재 프로젝트·브랜치·원격 저장소 확인 완료" -ForegroundColor Green
    Write-Host "  경로  : $currentProjectPath"
    Write-Host "  브랜치: $currentBranch"
    Write-Host "  원격  : $remoteUrl"

    # 빌드가 기존 추적 파일을 변경하는지 비교하기 위한 사전 상태 저장
    $trackedStateBeforeBuild = Get-TrackedFileState

    Write-Step "빌드 캐시 삭제"
    Remove-Item -Recurse -Force ".\node_modules\.cache" -ErrorAction SilentlyContinue

    Write-Step "기존 dist 삭제"
    Remove-Item -Recurse -Force ".\dist" -ErrorAction SilentlyContinue

    Invoke-NativeCommand "프로덕션 빌드" { npm run build }

    Write-Step "빌드 결과 검증"

    if (-not (Test-Path ".\dist" -PathType Container)) {
        Stop-Deployment "dist 폴더가 생성되지 않았습니다."
    }

    if (-not (Test-Path ".\dist\index.html" -PathType Leaf)) {
        Stop-Deployment "dist\index.html이 없습니다."
    }

    $indexFile = Get-Item ".\dist\index.html"
    if ($indexFile.Length -le 0) {
        Stop-Deployment "dist\index.html이 비어 있습니다."
    }

    if (-not (Test-Path ".\dist\assets" -PathType Container)) {
        Stop-Deployment "dist\assets 폴더가 없습니다."
    }

    $assetFiles = @(Get-ChildItem ".\dist\assets" -File -Recurse -ErrorAction SilentlyContinue)
    if ($assetFiles.Count -eq 0) {
        Stop-Deployment "dist\assets에 배포할 파일이 없습니다."
    }

    # GitHub Pages React SPA 경로 fallback
    Write-Step "GitHub Pages React 경로 fallback 생성"
    Remove-Item ".\dist\admin" -Recurse -Force -ErrorAction SilentlyContinue

    if (Test-Path ".\dist\admin" -PathType Container) {
        Stop-Deployment "dist\admin 폴더를 제거하지 못했습니다."
    }

    Copy-Item ".\dist\index.html" ".\dist\404.html" -Force

    if (-not (Test-Path ".\dist\404.html" -PathType Leaf)) {
        Stop-Deployment "dist\404.html 생성에 실패했습니다."
    }

    $indexHash = (Get-FileHash ".\dist\index.html" -Algorithm SHA256).Hash
    $dist404Hash = (Get-FileHash ".\dist\404.html" -Algorithm SHA256).Hash

    if ($indexHash -ne $dist404Hash) {
        Stop-Deployment "dist\404.html이 dist\index.html과 일치하지 않습니다."
    }

    if (Test-Path ".\public\404.html" -PathType Leaf) {
        Write-Info "public\404.html은 이번 배포에서 사용하지 않습니다. App.jsx의 notFound 화면을 사용합니다."
    }

    $trackedStateAfterBuild = Get-TrackedFileState
    $buildChangedTrackedFiles = @(Compare-TrackedFileState -Before $trackedStateBeforeBuild -After $trackedStateAfterBuild)

    if ($buildChangedTrackedFiles.Count -gt 0) {
        Write-Host ($buildChangedTrackedFiles -join [Environment]::NewLine) -ForegroundColor Yellow
        Stop-Deployment "빌드 과정에서 Git 추적 파일이 변경되었습니다. 변경 내용을 확인한 뒤 다시 실행하십시오."
    }

    # gh-pages-3 소스 브랜치 커밋 및 푸시
    Invoke-NativeCommand "Git 변경사항 추가" { git add --all }

    if (-not [string]::IsNullOrWhiteSpace($selectedPackageRelativePath)) {
        & git reset --quiet -- $selectedPackageRelativePath 2>$null
        if ($LASTEXITCODE -ne 0) {
            Stop-Deployment "프로젝트 내부 ZIP을 Git 스테이징에서 제외하지 못했습니다: $selectedPackageRelativePath"
        }
    }

    & git diff --cached --quiet
    $cachedDiffExitCode = $LASTEXITCODE

    if ($cachedDiffExitCode -eq 1) {
        Invoke-NativeCommand "소스 변경사항 커밋" { git commit -m $CommitMessage }
    }
    elseif ($cachedDiffExitCode -eq 0) {
        Write-Info "새로 커밋할 소스 변경사항이 없습니다."
    }
    else {
        Stop-Deployment "스테이징된 변경사항 확인에 실패했습니다. 종료 코드: $cachedDiffExitCode"
    }

    Invoke-NativeCommand "'$ExpectedSourceBranch' 브랜치를 원격 저장소에 푸시" {
        git push $RemoteName "${ExpectedSourceBranch}:${ExpectedSourceBranch}"
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "1단계 완료: $RemoteName/$ExpectedSourceBranch 푸시 완료" -ForegroundColor Green
    Write-Host "Vercel이 이 브랜치를 배포 대상으로 사용하면 테스트 배포가 시작됩니다."
    Write-Host "========================================" -ForegroundColor Green

    # Firebase는 빌드·소스 보존 성공 후, 운영 gh-pages 발행 전에 수행
    Deploy-FirebaseResources -Mode $selectedFirebaseMode -FirebaseCliPath $firebaseCliPath

    # 운영 gh-pages 발행 여부 선택
    Write-Host ""
    $publishProduction = Read-YesNo "이어서 운영 '$PublishBranch' 브랜치에도 발행하시겠습니까?"

    if (-not $publishProduction) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "통합 배포 종료" -ForegroundColor Green
        Write-Host "소스 브랜치 : $RemoteName/$ExpectedSourceBranch"
        Write-Host "운영 브랜치 : 발행하지 않음 (사용자 선택)"
        Write-Host "Firebase    : $firebaseDescription"
        if ($packageApplied) {
            Write-Host "패키지 백업 : $packageBackupPath"
        }
        Write-Host "========================================" -ForegroundColor Green
        exit 0
    }

    # 운영 배포에 필요한 CNAME과 로컬 gh-pages 실행 파일 검증
    if (-not (Test-Path ".\public\CNAME" -PathType Leaf)) {
        Stop-Deployment "public\CNAME이 없습니다. 사용자 지정 도메인 보호를 위해 운영 배포를 중단합니다."
    }

    $publicCname = (Get-Content ".\public\CNAME" -Raw).Trim()
    if ($publicCname -ne $ExpectedCname) {
        Stop-Deployment "public\CNAME 값이 예상값과 다릅니다. 현재: '$publicCname', 예상: '$ExpectedCname'"
    }

    if (-not (Test-Path ".\dist\CNAME" -PathType Leaf)) {
        Stop-Deployment "dist\CNAME이 없습니다. 사용자 지정 도메인 보호를 위해 운영 배포를 중단합니다."
    }

    $distCname = (Get-Content ".\dist\CNAME" -Raw).Trim()
    if ($distCname -ne $ExpectedCname) {
        Stop-Deployment "dist\CNAME 값이 예상값과 다릅니다. 현재: '$distCname', 예상: '$ExpectedCname'"
    }

    $ghPagesCommand = Join-Path $projectRoot "node_modules\.bin\gh-pages.cmd"
    if (-not (Test-Path $ghPagesCommand -PathType Leaf)) {
        Stop-Deployment "로컬 gh-pages 실행 파일을 찾을 수 없습니다: $ghPagesCommand`n프로젝트에서 npm ci를 실행한 뒤 다시 시도하십시오."
    }

    Write-Host ""
    Write-Host "주의: 원격 '$PublishBranch' 브랜치가 현재 빌드 결과로 교체됩니다." -ForegroundColor Yellow
    $confirmation = Read-Host "계속하려면 DEPLOY를 정확히 입력하십시오"

    if ($confirmation -cne "DEPLOY") {
        Write-Host "운영 배포를 취소했습니다. '$ExpectedSourceBranch' 푸시와 Firebase 배포 결과는 유지됩니다." -ForegroundColor Yellow
        exit 0
    }

    Write-Host ""
    Write-Host "기존 운영 브랜치 백업 여부를 선택하십시오." -ForegroundColor Yellow
    Write-Host "  Y: 현재 ${PublishBranch}를 타임스탬프 백업 브랜치로 보존"
    Write-Host "  N: 백업 브랜치를 만들지 않고 바로 운영 배포"
    $createProductionBackupForThisRun = Read-YesNo "기존 '$PublishBranch' 브랜치를 백업하시겠습니까?"

    if ($createProductionBackupForThisRun) {
        Write-Step "기존 운영 브랜치 확인"
        & git ls-remote --exit-code --heads $RemoteName $PublishBranch | Out-Null
        $lsRemoteExitCode = $LASTEXITCODE

        if ($lsRemoteExitCode -eq 0) {
            Invoke-NativeCommand "기존 '$PublishBranch' 브랜치 가져오기" {
                git fetch --no-tags $RemoteName $publishFetchRefspec
            }

            Invoke-NativeCommand "기존 운영본 로컬 백업 브랜치 생성" {
                git branch --force $backupBranch $publishRemoteShortRef
            }

            Invoke-NativeCommand "기존 운영본 원격 백업" {
                git push $RemoteName "${backupBranch}:${backupBranch}"
            }

            $productionBackupCreated = $true
            Write-Host "기존 운영본 백업 완료: $RemoteName/$backupBranch" -ForegroundColor Green
        }
        elseif ($lsRemoteExitCode -eq 2) {
            Write-Info "원격 '$PublishBranch' 브랜치가 없어 백업을 생략합니다."
        }
        else {
            Stop-Deployment "원격 '$PublishBranch' 브랜치 확인에 실패했습니다. 종료 코드: $lsRemoteExitCode"
        }
    }
    else {
        Write-Info "기존 운영 브랜치를 별도 백업하지 않습니다."
    }

    Invoke-NativeCommand "GitHub Pages 운영 브랜치 배포" {
        Write-Host "gh-pages 대상 저장소: $remoteUrl" -ForegroundColor DarkGray
        & $ghPagesCommand -d "dist" -b $PublishBranch --repo $remoteUrl -m $CommitMessage
    }

    Invoke-NativeCommand "배포 결과 원격 확인" {
        git fetch --no-tags $RemoteName $publishFetchRefspec
    }

    $remoteFiles = @(& git ls-tree -r --name-only $publishRemoteShortRef)
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "원격 '$PublishBranch' 파일 목록 확인에 실패했습니다."
    }

    foreach ($requiredFile in @("index.html", "404.html", "CNAME")) {
        if ($remoteFiles -notcontains $requiredFile) {
            Stop-Deployment "원격 '$PublishBranch' 브랜치에 '$requiredFile'이 없습니다."
        }
    }

    if ($remoteFiles -contains "admin/index.html") {
        Stop-Deployment "원격 '$PublishBranch' 브랜치에 구형 admin/index.html이 남아 있습니다. 이 파일은 /admin의 React fallback을 방해합니다."
    }

    $remoteCname = (& git show "$publishRemoteShortRef`:CNAME" | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $remoteCname -ne $ExpectedCname) {
        Stop-Deployment "원격 CNAME 검증에 실패했습니다. 현재: '$remoteCname', 예상: '$ExpectedCname'"
    }

    $remoteIndexBlob = (& git rev-parse "$publishRemoteShortRef`:index.html" | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remoteIndexBlob)) {
        Stop-Deployment "원격 index.html의 Git 객체 해시를 확인할 수 없습니다."
    }

    $remote404Blob = (& git rev-parse "$publishRemoteShortRef`:404.html" | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remote404Blob)) {
        Stop-Deployment "원격 404.html의 Git 객체 해시를 확인할 수 없습니다."
    }

    if ($remoteIndexBlob -ne $remote404Blob) {
        Stop-Deployment "원격 404.html이 원격 index.html과 일치하지 않습니다. React 경로 fallback이 적용되지 않았습니다."
    }

    $remoteCommit = (& git rev-parse $publishRemoteShortRef | Out-String).Trim()

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "통합 배포 완료" -ForegroundColor Green
    Write-Host "소스 브랜치 : $RemoteName/$ExpectedSourceBranch"
    Write-Host "운영 브랜치 : $RemoteName/$PublishBranch"
    Write-Host "운영 커밋   : $remoteCommit"
    Write-Host "Firebase    : $firebaseDescription"
    Write-Host "사용자 도메인: https://$ExpectedCname"
    Write-Host "관리자 주소  : https://$ExpectedCname/admin"

    if ($productionBackupCreated) {
        Write-Host "운영 백업   : $RemoteName/$backupBranch"
    }
    elseif (-not $createProductionBackupForThisRun) {
        Write-Host "운영 백업   : 생성 안 함 (사용자 선택)"
    }

    if ($packageApplied) {
        Write-Host "패키지 백업 : $packageBackupPath"
    }

    Write-Host "========================================" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "배포 실패" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    if (-not [string]::IsNullOrWhiteSpace($packageBackupPath)) {
        Write-Host "패키지 적용 전 ZIP 백업: $packageBackupPath" -ForegroundColor Yellow
    }

    Write-Host "완료 메시지가 나오기 전까지 해당 단계는 정상 배포로 간주하지 마십시오." -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Red
    exit 1
}
finally {
    if (-not [string]::IsNullOrWhiteSpace($gitAskPassPath) -and
        (Test-Path -LiteralPath $gitAskPassPath -PathType Leaf)) {
        Remove-Item -LiteralPath $gitAskPassPath -Force -ErrorAction SilentlyContinue
    }

    $env:GIT_ASKPASS = $originalGitAskPass
    $env:GIT_TERMINAL_PROMPT = $originalGitTerminalPrompt
    $env:DEPLOY_GITHUB_TOKEN = $originalDeployGitHubToken
    $env:FIREBASE_TOKEN = $originalFirebaseToken

    if (Test-Path -LiteralPath $PackageTempRoot -PathType Container) {
        Get-ChildItem -LiteralPath $PackageTempRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -in @("package_$timestamp", "backup_$timestamp", "verify_$timestamp") } |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }

    Pop-Location -ErrorAction SilentlyContinue
}
