chcp 65001 | Out-Null
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$targetBranch = "gh-page-2"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$commitMessage = "테스트 파일 수정_$timestamp"

# Vercel까지 즉시 갱신할지 여부
# true  = GitHub gh-page-2 push 후 Vercel 배포까지 실행
# false = GitHub gh-page-2 push까지만 실행
$runVercelDeploy = $true

# true  = Vercel 고정 테스트 주소를 갱신합니다. 예: https://laptop-rental-test.vercel.app
# false = Vercel Preview 주소를 새로 만듭니다.
$vercelProductionDeploy = $true

Write-Host "========================================"
Write-Host "테스트 배포 시작: $commitMessage"
Write-Host "대상 브랜치: $targetBranch"
Write-Host "========================================"

$currentBranch = (git branch --show-current).Trim()

if ($currentBranch -ne $targetBranch) {
    Write-Host "현재 브랜치가 $targetBranch 가 아닙니다." -ForegroundColor Red
    Write-Host "현재 브랜치: $currentBranch" -ForegroundColor Yellow
    Write-Host "E:\laptop-rental-test 폴더에서 gh-page-2 브랜치인지 확인해 주세요." -ForegroundColor Yellow
    exit 1
}

Write-Host "캐시 삭제 중..."
Remove-Item -Recurse -Force "node_modules/.cache" -ErrorAction SilentlyContinue

Write-Host "기존 dist 삭제 중..."
Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue

Write-Host "Git 변경사항 추가 중..."
git add -- . ':(exclude)dist' ':(exclude)node_modules' ':(exclude).vercel'

$changes = git status --porcelain

if ($changes) {
    Write-Host "Git 커밋 생성 중..."
    git commit -m $commitMessage

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Git 커밋 중 오류가 발생했습니다." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "커밋할 변경사항이 없습니다."
}

Write-Host "프로젝트 빌드 확인 중..."
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "빌드 실패로 인해 GitHub push 및 Vercel 배포를 중단합니다." -ForegroundColor Red
    exit 1
}

Write-Host "GitHub 테스트 브랜치 동기화 중..."
git push -u origin $targetBranch

if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub push 중 오류가 발생했습니다." -ForegroundColor Red
    exit 1
}

if ($runVercelDeploy) {
    Write-Host "Vercel 테스트 배포 중..."

    $vercelArgs = @("vercel")

    if ($vercelProductionDeploy) {
        $vercelArgs += "--prod"
    }

    if ($env:VERCEL_TOKEN) {
        $vercelArgs += @("--token", $env:VERCEL_TOKEN)
    } else {
        Write-Host "VERCEL_TOKEN 환경변수가 없습니다." -ForegroundColor Yellow
        Write-Host "현재 PC의 Vercel 로그인 세션으로 배포를 시도합니다." -ForegroundColor Yellow
        Write-Host "로그인 오류가 발생하면 아래처럼 토큰을 임시 등록한 뒤 다시 실행하세요." -ForegroundColor Yellow
        Write-Host '$env:VERCEL_TOKEN="여기에_토큰값"' -ForegroundColor Yellow
    }

    npx @vercelArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Vercel 배포 중 오류가 발생했습니다." -ForegroundColor Red
        exit 1
    }
}

Write-Host "========================================"
Write-Host "테스트 배포 완료: $commitMessage"
Write-Host "GitHub 브랜치: $targetBranch"
Write-Host "========================================"