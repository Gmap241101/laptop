chcp 65001 | Out-Null
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ==============================
# 프로젝트별 배포 설정
# ==============================
$ExpectedSourceBranch = "gh-pages-3"
$PublishBranch = "gh-pages"
$RemoteName = "origin"
$ExpectedCname = "notebook.recruit.kro.kr"
$ExpectedRemoteUrlFragment = "Gmap241101/laptop.git"
$RequireConfirmation = $true
$ScriptVersion = "2026.07.22-v7"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$commitMessage = "운영 배포_$timestamp"
$backupBranch = "backup-gh-pages-$timestamp"
$productionBackupCreated = $false
$createProductionBackupForThisRun = $false
$projectRoot = $PSScriptRoot

# 특정 브랜치만 가져와도 origin/gh-pages 원격 추적 참조가 반드시 생성되도록
# 명시적인 fetch refspec을 사용합니다.
$publishRemoteShortRef = "$RemoteName/$PublishBranch"
$publishRemoteTrackingRef = "refs/remotes/$RemoteName/$PublishBranch"
$publishFetchRefspec = "+refs/heads/$($PublishBranch):$publishRemoteTrackingRef"

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ""
    Write-Host "[진행] $Message" -ForegroundColor Cyan
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

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Description,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Step $Description
    & $Command

    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "$Description 실패. 종료 코드: $LASTEXITCODE"
    }
}

try {
    Push-Location $projectRoot

    Write-Host "========================================"
    Write-Host "GitHub Pages 운영 배포 시작"
    Write-Host "스크립트 버전: $ScriptVersion"
    Write-Host "작업 폴더 : $projectRoot"
    Write-Host "소스 브랜치: $ExpectedSourceBranch"
    Write-Host "배포 브랜치: $PublishBranch"
    Write-Host "커밋 메시지: $commitMessage"
    Write-Host "========================================"

    # 필수 프로그램 및 프로젝트 파일 확인
    foreach ($commandName in @("git", "npm")) {
        if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
            Stop-Deployment "필수 명령 '$commandName'을 찾을 수 없습니다."
        }
    }

    if (-not (Test-Path ".\package.json" -PathType Leaf)) {
        Stop-Deployment "package.json이 없습니다. 프로젝트 루트에서 실행해야 합니다."
    }

    if (-not (Test-Path ".\public\CNAME" -PathType Leaf)) {
        Stop-Deployment "public\CNAME이 없습니다. 사용자 지정 도메인 보호를 위해 배포를 중단합니다."
    }

    $publicCname = (Get-Content ".\public\CNAME" -Raw).Trim()
    if ($publicCname -ne $ExpectedCname) {
        Stop-Deployment "public\CNAME 값이 예상값과 다릅니다. 현재: '$publicCname', 예상: '$ExpectedCname'"
    }

    # Git 저장소 및 브랜치 확인
    $insideWorkTree = (& git rev-parse --is-inside-work-tree 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $insideWorkTree -ne "true") {
        Stop-Deployment "현재 폴더가 Git 저장소가 아닙니다."
    }

    $currentBranch = (& git branch --show-current | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentBranch)) {
        Stop-Deployment "현재 Git 브랜치를 확인할 수 없습니다. 분리된 HEAD 상태인지 확인하십시오."
    }

    if ($currentBranch -ne $ExpectedSourceBranch) {
        Stop-Deployment "현재 브랜치가 '$currentBranch'입니다. '$ExpectedSourceBranch' 브랜치에서만 배포할 수 있습니다."
    }

    $remoteUrl = (& git remote get-url $RemoteName 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remoteUrl)) {
        Stop-Deployment "Git 원격 저장소 '$RemoteName'을 찾을 수 없습니다."
    }

    if ($remoteUrl -notlike "*$ExpectedRemoteUrlFragment*") {
        Stop-Deployment "원격 저장소가 예상 프로젝트와 다릅니다. 현재: '$remoteUrl', 예상 포함값: '$ExpectedRemoteUrlFragment'"
    }

    $unmergedFiles = @(& git diff --name-only --diff-filter=U)
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "Git 충돌 파일 확인에 실패했습니다."
    }

    if ($unmergedFiles.Count -gt 0) {
        Write-Host ($unmergedFiles -join [Environment]::NewLine) -ForegroundColor Yellow
        Stop-Deployment "병합 충돌 파일이 남아 있어 배포할 수 없습니다."
    }

    # dist가 Git 추적 대상이면 삭제·재생성 과정에서 소스 브랜치를 오염시킬 수 있으므로 차단
    $trackedDistFiles = @(& git ls-files -- "dist")
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "dist 추적 여부 확인에 실패했습니다."
    }

    if ($trackedDistFiles.Count -gt 0) {
        Stop-Deployment "dist 폴더가 Git 추적 대상입니다. dist를 .gitignore에 추가하고 Git 추적에서 제거한 뒤 다시 실행하십시오."
    }

    Write-Host "현재 브랜치와 원격 저장소 확인 완료" -ForegroundColor Green
    Write-Host "  브랜치: $currentBranch"
    Write-Host "  원격: $remoteUrl"
    Write-Host "  도메인: $ExpectedCname"

    if ($RequireConfirmation) {
        Write-Host ""
        Write-Host "주의: 원격 '$PublishBranch' 브랜치가 새 빌드 결과로 교체됩니다." -ForegroundColor Yellow
        $confirmation = Read-Host "계속하려면 DEPLOY를 정확히 입력하십시오"
        if ($confirmation -cne "DEPLOY") {
            Write-Host "사용자가 배포를 취소했습니다." -ForegroundColor Yellow
            exit 0
        }
    }

    Write-Host ""
    Write-Host "기존 운영 브랜치 백업 여부를 선택하십시오." -ForegroundColor Yellow
    Write-Host "  Y: 현재 gh-pages를 타임스탬프 백업 브랜치로 보존한 뒤 배포"
    Write-Host "  N: 백업 브랜치를 만들지 않고 바로 배포"
    $createProductionBackupForThisRun = Read-YesNo "기존 '$PublishBranch' 브랜치를 백업하시겠습니까?"

    if ($createProductionBackupForThisRun) {
        Write-Host "[선택] 기존 운영 브랜치를 백업한 뒤 배포합니다." -ForegroundColor Green
    }
    else {
        Write-Host "[선택] 기존 운영 브랜치를 별도 백업하지 않고 배포합니다." -ForegroundColor DarkYellow
    }

    # 소스 변경사항 커밋
    Invoke-NativeCommand "Git 변경사항 추가" { git add --all }

    $changes = (& git status --porcelain | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "Git 상태 확인에 실패했습니다."
    }

    if (-not [string]::IsNullOrWhiteSpace($changes)) {
        Invoke-NativeCommand "소스 변경사항 커밋" { git commit -m $commitMessage }
    }
    else {
        Write-Host ""
        Write-Host "[안내] 커밋할 소스 변경사항이 없습니다." -ForegroundColor DarkYellow
    }

    # 빌드 전 캐시 및 기존 결과 제거
    Write-Step "빌드 캐시 삭제"
    Remove-Item -Recurse -Force ".\node_modules\.cache" -ErrorAction SilentlyContinue

    Write-Step "기존 dist 삭제"
    Remove-Item -Recurse -Force ".\dist" -ErrorAction SilentlyContinue

    Invoke-NativeCommand "프로덕션 빌드" { npm run build }

    # 빌드 결과 검증
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

    # GitHub Pages는 Vercel의 rewrite 규칙을 처리하지 않습니다.
    # 존재하지 않는 /admin 등의 SPA 경로 요청에 React 앱을 부팅할 수 있도록
    # 빌드된 index.html을 GitHub Pages의 사용자 지정 404 페이지로 복제합니다.
    Write-Step "GitHub Pages SPA fallback 생성"
    Copy-Item ".\dist\index.html" ".\dist\404.html" -Force

    if (-not (Test-Path ".\dist\404.html" -PathType Leaf)) {
        Stop-Deployment "dist\404.html 생성에 실패했습니다."
    }

    $indexHash = (Get-FileHash ".\dist\index.html" -Algorithm SHA256).Hash
    $notFoundHash = (Get-FileHash ".\dist\404.html" -Algorithm SHA256).Hash
    if ($indexHash -ne $notFoundHash) {
        Stop-Deployment "dist\404.html이 dist\index.html과 일치하지 않습니다."
    }

    if (-not (Test-Path ".\dist\assets" -PathType Container)) {
        Stop-Deployment "dist\assets 폴더가 없습니다."
    }

    $assetFiles = @(Get-ChildItem ".\dist\assets" -File -Recurse -ErrorAction SilentlyContinue)
    if ($assetFiles.Count -eq 0) {
        Stop-Deployment "dist\assets에 배포할 파일이 없습니다."
    }

    if (-not (Test-Path ".\dist\CNAME" -PathType Leaf)) {
        Stop-Deployment "dist\CNAME이 없습니다. 사용자 지정 도메인 보호를 위해 배포를 중단합니다."
    }

    $distCname = (Get-Content ".\dist\CNAME" -Raw).Trim()
    if ($distCname -ne $ExpectedCname) {
        Stop-Deployment "dist\CNAME 값이 예상값과 다릅니다. 현재: '$distCname', 예상: '$ExpectedCname'"
    }

    # 빌드가 추적 중인 소스 파일을 변경한 경우 배포 차단
    & git diff --quiet
    if ($LASTEXITCODE -ne 0) {
        $changedTrackedFiles = (& git diff --name-only | Out-String).Trim()
        Write-Host $changedTrackedFiles -ForegroundColor Yellow
        Stop-Deployment "빌드 과정에서 Git 추적 파일이 변경되었습니다. 변경 내용을 확인한 뒤 다시 배포하십시오."
    }

    $ghPagesCommand = Join-Path $projectRoot "node_modules\.bin\gh-pages.cmd"
    if (-not (Test-Path $ghPagesCommand -PathType Leaf)) {
        Stop-Deployment "로컬 gh-pages 실행 파일을 찾을 수 없습니다: $ghPagesCommand`n프로젝트에서 npm install을 실행한 뒤 다시 시도하십시오."
    }

    # 검증이 끝난 소스를 원격 gh-pages-3에 보존
    Invoke-NativeCommand "소스 브랜치를 원격 저장소에 푸시" {
        git push $RemoteName "${ExpectedSourceBranch}:${ExpectedSourceBranch}"
    }

    # 기존 운영 gh-pages를 타임스탬프 백업 브랜치로 보존
    if ($createProductionBackupForThisRun) {
        Write-Step "기존 운영 브랜치 확인"
        & git ls-remote --exit-code --heads $RemoteName $PublishBranch | Out-Null
        $lsRemoteExitCode = $LASTEXITCODE

        if ($lsRemoteExitCode -eq 0) {
            Invoke-NativeCommand "기존 '$PublishBranch' 브랜치 가져오기" {
                git fetch --no-tags $RemoteName $publishFetchRefspec
            }

            # 단순한 'git fetch origin gh-pages'는 저장소의 fetch 설정에 따라
            # FETCH_HEAD만 갱신하고 origin/gh-pages를 만들지 않을 수 있습니다.
            # 위에서 명시적으로 생성한 원격 추적 참조를 백업 기준으로 사용합니다.
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
            Write-Host "원격 '$PublishBranch' 브랜치가 없어 백업을 생략합니다." -ForegroundColor DarkYellow
        }
        else {
            Stop-Deployment "원격 '$PublishBranch' 브랜치 확인에 실패했습니다. 종료 코드: $lsRemoteExitCode"
        }
    }

    Invoke-NativeCommand "GitHub Pages 운영 브랜치 배포" {
        # gh-pages의 --repo 옵션에는 Git 원격 별칭(origin)이 아니라
        # 실제 저장소 URL을 전달해야 합니다.
        Write-Host "gh-pages 대상 저장소: $remoteUrl" -ForegroundColor DarkGray
        & $ghPagesCommand -d "dist" -b $PublishBranch --repo $remoteUrl -m $commitMessage
    }

    # 원격 배포 결과 재검증
    Invoke-NativeCommand "배포 결과 원격 확인" {
        git fetch --no-tags $RemoteName $publishFetchRefspec
    }

    $remoteFiles = @(& git ls-tree -r --name-only $publishRemoteShortRef)
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "원격 '$PublishBranch' 파일 목록 확인에 실패했습니다."
    }

    if ($remoteFiles -notcontains "index.html") {
        Stop-Deployment "원격 '$PublishBranch' 브랜치에 index.html이 없습니다."
    }

    if ($remoteFiles -notcontains "404.html") {
        Stop-Deployment "원격 '$PublishBranch' 브랜치에 SPA fallback용 404.html이 없습니다."
    }

    if ($remoteFiles -notcontains "CNAME") {
        Stop-Deployment "원격 '$PublishBranch' 브랜치에 CNAME이 없습니다."
    }

    $remoteCname = (& git show "$publishRemoteShortRef`:CNAME" | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $remoteCname -ne $ExpectedCname) {
        Stop-Deployment "원격 CNAME 검증에 실패했습니다. 현재: '$remoteCname', 예상: '$ExpectedCname'"
    }

    $remoteCommit = (& git rev-parse $publishRemoteShortRef | Out-String).Trim()

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "배포 완료" -ForegroundColor Green
    Write-Host "소스 브랜치 : $RemoteName/$ExpectedSourceBranch"
    Write-Host "운영 브랜치 : $RemoteName/$PublishBranch"
    Write-Host "운영 커밋   : $remoteCommit"
    Write-Host "사용자 도메인: https://$ExpectedCname"
    Write-Host "관리자 주소  : https://$ExpectedCname/admin"
    if ($productionBackupCreated) {
        Write-Host "운영 백업   : $RemoteName/$backupBranch"
    }
    elseif (-not $createProductionBackupForThisRun) {
        Write-Host "운영 백업   : 생성 안 함 (사용자 선택)"
    }
    Write-Host "========================================" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "배포 실패" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "운영 브랜치는 완료 메시지가 나오기 전까지 정상 배포로 간주하지 마십시오." -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
}
