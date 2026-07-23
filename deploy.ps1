param(
    [string]$CommitMessage = ""
)

chcp 65001 | Out-Null
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ==============================
# 프로젝트별 배포 설정
# ==============================
$ExpectedProjectPath = "E:\project\rental-system\test_new"
$ExpectedSourceBranch = "gh-pages-3"
$PublishBranch = "gh-pages"
$RemoteName = "origin"
$ExpectedCname = "notebook.recruit.kro.kr"
$ExpectedRemoteUrlFragment = "Gmap241101/laptop.git"
$ScriptVersion = "2026.07.23-v11-unified-static-404"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    $CommitMessage = "배포_$timestamp"
}

$backupBranch = "backup-gh-pages-$timestamp"
$productionBackupCreated = $false
$createProductionBackupForThisRun = $false
$projectRoot = $PSScriptRoot

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
    Write-Host "통합 배포 시작"
    Write-Host "스크립트 버전: $ScriptVersion"
    Write-Host "작업 폴더 : $projectRoot"
    Write-Host "소스 브랜치: $ExpectedSourceBranch"
    Write-Host "운영 브랜치: $PublishBranch"
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
        Stop-Deployment "허용된 프로젝트 폴더가 아닙니다.`n현재: $currentProjectPath`n허용: $normalizedExpectedPath"
    }

    foreach ($commandName in @("git", "npm")) {
        if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
            Stop-Deployment "필수 명령 '$commandName'을 찾을 수 없습니다."
        }
    }

    if (-not (Test-Path ".\package.json" -PathType Leaf)) {
        Stop-Deployment "package.json이 없습니다. 프로젝트 루트에서 실행해야 합니다."
    }

    $insideWorkTree = (& git rev-parse --is-inside-work-tree 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $insideWorkTree -ne "true") {
        Stop-Deployment "현재 폴더가 Git 저장소가 아닙니다."
    }

    $currentBranch = (& git branch --show-current | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentBranch)) {
        Stop-Deployment "현재 Git 브랜치를 확인할 수 없습니다."
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
        Stop-Deployment "병합 충돌 파일이 남아 있어 배포할 수 없습니다."
    }

    $trackedDistFiles = @(& git ls-files -- "dist")
    if ($LASTEXITCODE -ne 0) {
        Stop-Deployment "dist 추적 여부 확인에 실패했습니다."
    }

    if ($trackedDistFiles.Count -gt 0) {
        Stop-Deployment "dist 폴더가 Git 추적 대상입니다. dist를 .gitignore에 추가하고 Git 추적에서 제거한 뒤 다시 실행하십시오."
    }

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

    # GitHub Pages의 /admin 직접 접속용 실제 정적 경로 생성
    Write-Step "GitHub Pages 관리자 직접 경로 생성"

    $adminOutputDirectory = ".\dist\admin"
    $adminOutputFile = Join-Path $adminOutputDirectory "index.html"

    Remove-Item -Recurse -Force $adminOutputDirectory -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $adminOutputDirectory -Force | Out-Null

    $adminHtml = Get-Content ".\dist\index.html" -Raw
    $headCloseIndex = $adminHtml.IndexOf("</head>", [System.StringComparison]::OrdinalIgnoreCase)

    if ($headCloseIndex -lt 0) {
        Stop-Deployment "dist\index.html에서 </head> 태그를 찾을 수 없어 관리자 직접 경로를 생성할 수 없습니다."
    }

    $adminPathNormalizer = @'
<script data-static-admin-entry>
(function () {
  var path = window.location.pathname;
  if (path === '/admin/' || path === '/admin/index.html') {
    window.history.replaceState(
      null,
      '',
      '/admin' + window.location.search + window.location.hash
    );
  }
})();
</script>
'@

    $adminHtml = $adminHtml.Insert($headCloseIndex, "$adminPathNormalizer`r`n")
    Set-Content -Path $adminOutputFile -Value $adminHtml -Encoding UTF8

    if (-not (Test-Path $adminOutputFile -PathType Leaf)) {
        Stop-Deployment "dist\admin\index.html 생성에 실패했습니다."
    }

    $adminOutputContent = Get-Content $adminOutputFile -Raw
    if ($adminOutputContent -notmatch 'data-static-admin-entry') {
        Stop-Deployment "dist\admin\index.html에 관리자 경로 보정 코드가 없습니다."
    }

    # 독립적인 사용자 지정 404 페이지 검증
    Write-Step "독립 커스텀 404 페이지 검증"

    if (-not (Test-Path ".\public\404.html" -PathType Leaf)) {
        Stop-Deployment "public\404.html이 없습니다. 독립 커스텀 404 페이지를 먼저 추가하십시오."
    }

    if (-not (Test-Path ".\dist\404.html" -PathType Leaf)) {
        Stop-Deployment "dist\404.html이 없습니다. Vite가 public\404.html을 빌드 결과로 복사하지 못했습니다."
    }

    $public404Hash = (Get-FileHash ".\public\404.html" -Algorithm SHA256).Hash
    $dist404Hash = (Get-FileHash ".\dist\404.html" -Algorithm SHA256).Hash
    if ($public404Hash -ne $dist404Hash) {
        Stop-Deployment "dist\404.html이 public\404.html과 일치하지 않습니다."
    }

    $dist404Content = Get-Content ".\dist\404.html" -Raw
    if ($dist404Content -notmatch 'data-page=["'']custom-404["'']') {
        Stop-Deployment "dist\404.html에서 커스텀 404 식별자를 찾을 수 없습니다."
    }

    $indexHash = (Get-FileHash ".\dist\index.html" -Algorithm SHA256).Hash
    if ($indexHash -eq $dist404Hash) {
        Stop-Deployment "dist\404.html이 React index.html과 동일합니다. 독립 커스텀 404 페이지가 적용되지 않았습니다."
    }

    $trackedStateAfterBuild = Get-TrackedFileState
    $buildChangedTrackedFiles = @(Compare-TrackedFileState -Before $trackedStateBeforeBuild -After $trackedStateAfterBuild)

    if ($buildChangedTrackedFiles.Count -gt 0) {
        Write-Host ($buildChangedTrackedFiles -join [Environment]::NewLine) -ForegroundColor Yellow
        Stop-Deployment "빌드 과정에서 Git 추적 파일이 변경되었습니다. 변경 내용을 확인한 뒤 다시 실행하십시오."
    }

    # gh-pages-3 소스 브랜치 커밋 및 푸시
    Invoke-NativeCommand "Git 변경사항 추가" { git add --all }

    & git diff --cached --quiet
    $cachedDiffExitCode = $LASTEXITCODE

    if ($cachedDiffExitCode -eq 1) {
        Invoke-NativeCommand "소스 변경사항 커밋" { git commit -m $CommitMessage }
    }
    elseif ($cachedDiffExitCode -eq 0) {
        Write-Host ""
        Write-Host "[안내] 새로 커밋할 소스 변경사항이 없습니다." -ForegroundColor DarkYellow
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

    # 운영 gh-pages 발행 여부 선택
    Write-Host ""
    $publishProduction = Read-YesNo "이어서 운영 '$PublishBranch' 브랜치에도 발행하시겠습니까?"

    if (-not $publishProduction) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "통합 배포 종료" -ForegroundColor Green
        Write-Host "소스 브랜치 : $RemoteName/$ExpectedSourceBranch"
        Write-Host "운영 브랜치 : 발행하지 않음 (사용자 선택)"
        Write-Host "========================================" -ForegroundColor Green
        exit 0
    }

    # 운영 배포에 필요한 CNAME과 로컬 gh-pages 실행 파일은 Y 선택 후 검증
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
        Stop-Deployment "로컬 gh-pages 실행 파일을 찾을 수 없습니다: $ghPagesCommand`n프로젝트에서 npm install을 실행한 뒤 다시 시도하십시오."
    }

    Write-Host ""
    Write-Host "주의: 원격 '$PublishBranch' 브랜치가 현재 빌드 결과로 교체됩니다." -ForegroundColor Yellow
    $confirmation = Read-Host "계속하려면 DEPLOY를 정확히 입력하십시오"

    if ($confirmation -cne "DEPLOY") {
        Write-Host "운영 배포를 취소했습니다. '$ExpectedSourceBranch' 푸시는 유지됩니다." -ForegroundColor Yellow
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
            Write-Host "원격 '$PublishBranch' 브랜치가 없어 백업을 생략합니다." -ForegroundColor DarkYellow
        }
        else {
            Stop-Deployment "원격 '$PublishBranch' 브랜치 확인에 실패했습니다. 종료 코드: $lsRemoteExitCode"
        }
    }
    else {
        Write-Host "[선택] 기존 운영 브랜치를 별도 백업하지 않습니다." -ForegroundColor DarkYellow
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

    foreach ($requiredFile in @("index.html", "admin/index.html", "404.html", "CNAME")) {
        if ($remoteFiles -notcontains $requiredFile) {
            Stop-Deployment "원격 '$PublishBranch' 브랜치에 '$requiredFile'이 없습니다."
        }
    }

    $remoteCname = (& git show "$publishRemoteShortRef`:CNAME" | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $remoteCname -ne $ExpectedCname) {
        Stop-Deployment "원격 CNAME 검증에 실패했습니다. 현재: '$remoteCname', 예상: '$ExpectedCname'"
    }

    $remoteAdminEntry = (& git show "$publishRemoteShortRef`:admin/index.html" | Out-String)
    if ($LASTEXITCODE -ne 0 -or $remoteAdminEntry -notmatch 'data-static-admin-entry') {
        Stop-Deployment "원격 admin/index.html에서 관리자 경로 보정 코드를 확인할 수 없습니다."
    }

    $remote404 = (& git show "$publishRemoteShortRef`:404.html" | Out-String)
    if ($LASTEXITCODE -ne 0 -or $remote404 -notmatch 'data-page=["'']custom-404["'']') {
        Stop-Deployment "원격 404.html에서 독립 커스텀 404 페이지 식별자를 확인할 수 없습니다."
    }

    $remoteCommit = (& git rev-parse $publishRemoteShortRef | Out-String).Trim()

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "통합 배포 완료" -ForegroundColor Green
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
    Write-Host "완료 메시지가 나오기 전까지 해당 단계는 정상 배포로 간주하지 마십시오." -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
}
