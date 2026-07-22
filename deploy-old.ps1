chcp 65001 | Out-Null
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$commitMessage = "파일 수정_$timestamp"

Write-Host "========================================"
Write-Host "배포 시작: $commitMessage"
Write-Host "========================================"

Write-Host "캐시 삭제 중..."
Remove-Item -Recurse -Force "node_modules/.cache" -ErrorAction SilentlyContinue

Write-Host "dist 삭제 중..."
Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue

Write-Host "Git 변경사항 추가 중..."
git add .

$changes = git status --porcelain

if ($changes) {
    Write-Host "Git 커밋 생성 중..."
    git commit -m $commitMessage
} else {
    Write-Host "커밋할 변경사항이 없습니다."
}

Write-Host "프로젝트 빌드 중..."
npm run build

Write-Host "GitHub Pages 배포 중..."
npx gh-pages -d dist -m $commitMessage

Write-Host "========================================"
Write-Host "배포 완료: $commitMessage"
Write-Host "========================================"