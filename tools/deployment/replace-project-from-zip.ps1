[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,

    [Parameter(Mandatory = $true)]
    [string]$TargetPath,

    [switch]$NoBackup
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Get-NormalizedFullPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    return [System.IO.Path]::GetFullPath($Path)
}

function Resolve-SafeRelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    $trimmed = $RelativePath.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        throw '빈 상대 경로는 사용할 수 없습니다.'
    }

    $normalizedRelative = $trimmed.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    if ([System.IO.Path]::IsPathRooted($normalizedRelative)) {
        throw "절대 경로는 허용되지 않습니다: $RelativePath"
    }

    $segments = $normalizedRelative.Split([System.IO.Path]::DirectorySeparatorChar)
    if ($segments -contains '..') {
        throw "상위 폴더 이동 경로는 허용되지 않습니다: $RelativePath"
    }

    $baseFullPath = (Get-NormalizedFullPath -Path $BasePath).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    $resolvedPath = Get-NormalizedFullPath -Path (Join-Path $baseFullPath $normalizedRelative)
    $requiredPrefix = $baseFullPath + [System.IO.Path]::DirectorySeparatorChar

    if (
        -not $resolvedPath.Equals($baseFullPath, [System.StringComparison]::OrdinalIgnoreCase) -and
        -not $resolvedPath.StartsWith($requiredPrefix, [System.StringComparison]::OrdinalIgnoreCase)
    ) {
        throw "대상 폴더 밖의 경로는 허용되지 않습니다: $RelativePath"
    }

    return $resolvedPath
}

function Read-PathList {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return @()
    }

    return @(
        Get-Content -LiteralPath $Path -Encoding UTF8 |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and -not $_.StartsWith('#') }
    )
}

$resolvedZipPath = (Resolve-Path -LiteralPath $ZipPath).Path
$resolvedTargetPath = Get-NormalizedFullPath -Path $TargetPath

if (-not (Test-Path -LiteralPath $resolvedTargetPath)) {
    New-Item -ItemType Directory -Path $resolvedTargetPath -Force | Out-Null
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
    'rental-system-package-' + [System.Guid]::NewGuid().ToString('N')
)
$extractRoot = Join-Path $tempRoot 'extracted'
$backupStage = Join-Path $tempRoot 'backup'

New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null

try {
    Write-Host "[1/6] 패키지 압축 해제: $resolvedZipPath"
    Expand-Archive -LiteralPath $resolvedZipPath -DestinationPath $extractRoot -Force

    $packageRoot = $extractRoot
    $metadataRoot = Join-Path $packageRoot 'package-meta'

    if (-not (Test-Path -LiteralPath $metadataRoot -PathType Container)) {
        $topLevelDirectories = @(
            Get-ChildItem -LiteralPath $extractRoot -Force -Directory
        )

        if ($topLevelDirectories.Count -eq 1) {
            $candidateRoot = $topLevelDirectories[0].FullName
            $candidateMetadata = Join-Path $candidateRoot 'package-meta'

            if (Test-Path -LiteralPath $candidateMetadata -PathType Container) {
                $packageRoot = $candidateRoot
                $metadataRoot = $candidateMetadata
            }
        }
    }

    $manifestPath = Join-Path $metadataRoot 'PACKAGE_FILES.txt'
    $hashPath = Join-Path $metadataRoot 'PACKAGE_SHA256SUMS.txt'
    $removedPath = Join-Path $metadataRoot 'REMOVED_FILES.txt'

    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw 'package-meta/PACKAGE_FILES.txt가 없어 패키지를 검증할 수 없습니다.'
    }

    if (-not (Test-Path -LiteralPath $hashPath -PathType Leaf)) {
        throw 'package-meta/PACKAGE_SHA256SUMS.txt가 없어 패키지를 검증할 수 없습니다.'
    }

    $packageFiles = Read-PathList -Path $manifestPath
    $removedFiles = Read-PathList -Path $removedPath

    if ($packageFiles.Count -eq 0) {
        throw '패키지 파일 목록이 비어 있습니다.'
    }

    $expectedHashes = @{}
    foreach ($line in (Get-Content -LiteralPath $hashPath -Encoding UTF8)) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) {
            continue
        }

        $parts = $line -split "`t", 2
        if ($parts.Count -ne 2) {
            throw "잘못된 SHA-256 목록 형식입니다: $line"
        }

        $expectedHashes[$parts[1].Trim()] = $parts[0].Trim().ToLowerInvariant()
    }

    Write-Host '[2/6] 패키지 내부 SHA-256 검증'
    foreach ($relativePath in $packageFiles) {
        $sourcePath = Resolve-SafeRelativePath -BasePath $packageRoot -RelativePath $relativePath

        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "패키지 파일이 누락되었습니다: $relativePath"
        }

        if (-not $expectedHashes.ContainsKey($relativePath)) {
            throw "SHA-256 값이 누락되었습니다: $relativePath"
        }

        $actualHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $expectedHashes[$relativePath]) {
            throw "패키지 파일 SHA-256 불일치: $relativePath"
        }
    }

    $backupZipPath = $null
    if (-not $NoBackup) {
        Write-Host '[3/6] 교체 대상 기존 파일 백업'
        New-Item -ItemType Directory -Path $backupStage -Force | Out-Null

        $affectedFiles = @($packageFiles + $removedFiles | Sort-Object -Unique)
        $backupFileCount = 0

        foreach ($relativePath in $affectedFiles) {
            $existingPath = Resolve-SafeRelativePath -BasePath $resolvedTargetPath -RelativePath $relativePath

            if (Test-Path -LiteralPath $existingPath -PathType Leaf) {
                $backupDestination = Resolve-SafeRelativePath -BasePath $backupStage -RelativePath $relativePath
                $backupParent = Split-Path -Parent $backupDestination

                if (-not (Test-Path -LiteralPath $backupParent)) {
                    New-Item -ItemType Directory -Path $backupParent -Force | Out-Null
                }

                Copy-Item -LiteralPath $existingPath -Destination $backupDestination -Force
                $backupFileCount += 1
            }
        }

        if ($backupFileCount -gt 0) {
            $backupRoot = Join-Path (Split-Path -Parent $resolvedTargetPath) '_package_backups'
            New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

            $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
            $targetName = Split-Path -Leaf $resolvedTargetPath
            $backupZipPath = Join-Path $backupRoot ("${targetName}_before_${timestamp}.zip")

            $backupItems = @(Get-ChildItem -LiteralPath $backupStage -Force)
            Compress-Archive -Path $backupItems.FullName -DestinationPath $backupZipPath -CompressionLevel Optimal -Force
            Write-Host "    백업 완료: $backupZipPath"
        }
        else {
            Write-Host '    백업할 기존 파일이 없습니다.'
        }
    }
    else {
        Write-Host '[3/6] 기존 파일 백업 생략 (-NoBackup)'
    }

    Write-Host '[4/6] 삭제 대상 정리'
    foreach ($relativePath in $removedFiles) {
        $targetToRemove = Resolve-SafeRelativePath -BasePath $resolvedTargetPath -RelativePath $relativePath

        if (Test-Path -LiteralPath $targetToRemove) {
            Remove-Item -LiteralPath $targetToRemove -Recurse -Force
            Write-Host "    삭제: $relativePath"
        }
    }

    Write-Host '[5/6] 새 패키지 파일 복사'
    foreach ($relativePath in $packageFiles) {
        $sourcePath = Resolve-SafeRelativePath -BasePath $packageRoot -RelativePath $relativePath
        $destinationPath = Resolve-SafeRelativePath -BasePath $resolvedTargetPath -RelativePath $relativePath
        $destinationParent = Split-Path -Parent $destinationPath

        if (-not (Test-Path -LiteralPath $destinationParent)) {
            New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
        }

        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    }

    Write-Host '[6/6] 교체 결과 SHA-256 검증'
    foreach ($relativePath in $packageFiles) {
        $destinationPath = Resolve-SafeRelativePath -BasePath $resolvedTargetPath -RelativePath $relativePath
        $actualHash = (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash.ToLowerInvariant()

        if ($actualHash -ne $expectedHashes[$relativePath]) {
            throw "교체 후 SHA-256 불일치: $relativePath"
        }
    }

    Write-Host ''
    Write-Host '프로젝트 패키지 교체가 완료되었습니다.' -ForegroundColor Green
    Write-Host "대상 폴더: $resolvedTargetPath"

    if ($backupZipPath) {
        Write-Host "백업 ZIP: $backupZipPath"
    }

    Write-Host '보존 항목: .git, node_modules, .env 계열 및 패키지 목록에 없는 로컬 파일'
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
