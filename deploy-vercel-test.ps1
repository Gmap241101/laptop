param(
    [string]$CommitMessage = ""
)

chcp 65001 | Out-Null

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ExpectedProjectPath = "E:\project\rental-system\test_new"
$ExpectedBranch = "gh-pages-3"

$CurrentProjectPath = (
    [System.IO.Path]::GetFullPath($PSScriptRoot)
).TrimEnd('\')

$NormalizedExpectedPath = (
    [System.IO.Path]::GetFullPath($ExpectedProjectPath)
).TrimEnd('\')

if (
    -not [string]::Equals(
        $CurrentProjectPath,
        $NormalizedExpectedPath,
        [System.StringComparison]::OrdinalIgnoreCase
    )
) {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Vercel 테스트 배포 중단" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "현재 스크립트 위치: $CurrentProjectPath" -ForegroundColor Yellow
    Write-Host "허용된 테스트 폴더: $NormalizedExpectedPath" -ForegroundColor Green
    exit 1
}

Set-Location $PSScriptRoot

Write-Host "========================================"
Write-Host "Vercel 테스트 배포 시작"
Write-Host "작업 폴더: $CurrentProjectPath"
Write-Host "대상 브랜치: $ExpectedBranch"
Write-Host "========================================"

git rev-parse --is-inside-work-tree *> $null

if ($LASTEXITCODE -ne 0) {
    Write-Host "현재 폴더가 Git 저장소가 아닙니다." -ForegroundColor Red
    exit 1
}

$CurrentBranch = (git branch --show-current).Trim()

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($CurrentBranch)) {
    Write-Host "현재 Git 브랜치를 확인할 수 없습니다." -ForegroundColor Red
    exit 1
}

if ($CurrentBranch -ne $ExpectedBranch) {
    Write-Host "잘못된 브랜치입니다." -ForegroundColor Red
    Write-Host "현재 브랜치: $CurrentBranch" -ForegroundColor Yellow
    Write-Host "허용 브랜치: $ExpectedBranch" -ForegroundColor Green
    exit 1
}

git remote get-url origin *> $null

if ($LASTEXITCODE -ne 0) {
    Write-Host "Git 원격 저장소 origin을 확인할 수 없습니다." -ForegroundColor Red
    exit 1
}

Write-Host "기존 dist 삭제 중..."

Remove-Item `
    -Path "dist" `
    -Recurse `
    -Force `
    -ErrorAction SilentlyContinue

Write-Host "프로덕션 빌드 검증 중..."

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "빌드 오류가 발생하여 커밋과 배포를 중단합니다." -ForegroundColor Red
    exit 1
}

Write-Host "Git 변경사항 추가 중..."

git add -A

if ($LASTEXITCODE -ne 0) {
    Write-Host "Git 변경사항 추가에 실패했습니다." -ForegroundColor Red
    exit 1
}

git diff --cached --quiet

if ($LASTEXITCODE -eq 1) {
    if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
        $Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $CommitMessage = "Vercel 테스트 배포_$Timestamp"
    }

    Write-Host "Git 커밋 생성 중..."
    Write-Host "커밋 메시지: $CommitMessage"

    git commit -m $CommitMessage

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Git 커밋 생성에 실패했습니다." -ForegroundColor Red
        exit 1
    }
} elseif ($LASTEXITCODE -eq 0) {
    Write-Host "새로 커밋할 변경사항이 없습니다."
    Write-Host "원격 저장소에 올라가지 않은 기존 커밋이 있으면 그대로 푸시합니다."
} else {
    Write-Host "Git 변경사항 확인에 실패했습니다." -ForegroundColor Red
    exit 1
}

Write-Host "$ExpectedBranch 브랜치를 GitHub에 푸시 중..."

git push origin $ExpectedBranch

if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub 푸시에 실패했습니다." -ForegroundColor Red
    Write-Host "원격 브랜치가 앞서 있으면 다음 명령으로 확인하세요." -ForegroundColor Yellow
    Write-Host "git pull --rebase origin $ExpectedBranch" -ForegroundColor Cyan
    Write-Host "충돌 확인 없이 force push를 사용하지 마세요." -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "Vercel 테스트 배포 요청 완료" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "GitHub의 $ExpectedBranch 브랜치로 푸시했습니다."
Write-Host "Vercel 프로젝트의 Production Branch가 $ExpectedBranch이면 자동 배포가 시작됩니다."
Write-Host "Vercel 대시보드의 Deployments에서 완료 여부를 확인하세요."
