# Shared, read-only checks used by packaging, acceptance, installation and upload.
Set-StrictMode -Version Latest

# Local monitor binaries are private overlays, never public release inputs.
function Assert-PublicReleaseBytes {
    param([byte[]]$Bytes)
    if ([Text.Encoding]::ASCII.GetString($Bytes).Contains('Chuangbao.LocalOnly.SmartMonitor')) {
        throw '检测到仅本机智能监控测试代码，禁止生成公开更新包或上传发布。请使用未启用 LocalMonitor 的公开构建。'
    }
}
function Assert-PublicReleaseExecutable {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        Assert-PublicReleaseBytes ([IO.File]::ReadAllBytes([IO.Path]::GetFullPath($Path)))
    }
}


function Get-ReleaseRelativePath {
    param([string]$Path)
    $value = $Path.Replace('\', '/')
    if ([string]::IsNullOrWhiteSpace($value) -or $value -match '[:\x00-\x1f]' -or
        $value.StartsWith('/') -or $value -match '(^|/)(\.|\.\.|)(/|$)' -or
        @($value.Split('/') | Where-Object { $_.EndsWith(' ') -or $_.EndsWith('.') }).Count -gt 0) {
        throw "不安全的发布路径：$Path"
    }
    return $value
}

function Get-ReleaseChildPath {
    param([string]$Root, [string]$RelativePath)
    $relative = Get-ReleaseRelativePath $RelativePath
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    $path = [IO.Path]::GetFullPath((Join-Path $prefix $relative))
    if (-not $path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw '发布路径越界。' }
    # Never hash/copy through a junction or symbolic link into user data.
    $cursor = $path
    while ($cursor.Length -ge $prefix.TrimEnd('\').Length) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "发布目录不允许重解析点：$cursor"
            }
        }
        $cursor = Split-Path -Parent $cursor
        if ([string]::IsNullOrEmpty($cursor)) { break }
    }
    return $path
}

function Get-ReleaseRequiredPaths {
    return @('QianchuanAuto.exe', 'ChuangbaoUpdater.exe', 'Microsoft.Web.WebView2.Core.dll',
        'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll',
        'Tools/FFmpeg/ffmpeg.exe', 'Tools/FFmpeg/ffprobe.exe',
        'assets/one-cut-web/index.html', 'assets/one-cut-web/app.js', 'assets/one-cut-web/styles.css',
        'assets/one-cut-parser/runtime/python.exe', 'assets/one-cut-parser/runtime/python313.dll',
        'assets/one-cut-parser/project/software_bridge.py', 'assets/one-cut-parser/project/local_launcher.py',
        'assets/release/build.json')
}

function Assert-ReleaseFileRecords {
    param([object[]]$Files)
    $map = @{}
    foreach ($file in $Files) {
        $path = Get-ReleaseRelativePath ([string]$file.path)
        if ($map.ContainsKey($path) -or [string]$file.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or [int64]$file.size -lt 0) {
            throw "无效或重复的发布文件记录：$path"
        }
        if ($path -notmatch '^(assets/|Tools/FFmpeg/)' -and $path -notin @(
            'QianchuanAuto.exe','ChuangbaoUpdater.exe','Microsoft.Web.WebView2.Core.dll',
            'Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','MaterialHistoryActions.dll',
            'Chuangbao.Heixi.dll',
            'ReleaseIntegrity.ps1','Export-ChuangbaoDiagnostics.ps1','Chuangbao-Diagnostics.cmd')) {
            throw "清单包含非程序路径，拒绝覆盖用户数据：$path"
        }
        $map[$path] = $file
    }
    foreach ($required in (Get-ReleaseRequiredPaths)) {
        if (-not $map.ContainsKey($required) -or [int64]$map[$required].size -le 0) { throw "发布清单缺少必需组件：$required" }
    }
    return $map
}

function Get-ReleaseFileDifferences {
    param([string]$Directory, [object[]]$Files)
    foreach ($file in $Files) {
        $path = Get-ReleaseChildPath $Directory ([string]$file.path)
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            [pscustomobject]@{ path=$file.path; reason='missing'; actualSha256=$null }
        } else {
            $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
            if ((Get-Item -LiteralPath $path).Length -ne [int64]$file.size -or $hash -ne $file.sha256) {
                [pscustomobject]@{ path=$file.path; reason='changed'; actualSha256=$hash }
            }
        }
    }
}

function Get-ReleaseInputFingerprint {
    param([string]$SourceRoot)
    $root = [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\', '/')
    $inputs = @(Get-ChildItem -LiteralPath $root -File | Where-Object { $_.Extension -in @('.cs','.ps1','.manifest','.dll','.cmd') })
    $inputs += @(Get-ChildItem -LiteralPath (Join-Path $root 'tools/release-components') -File | Where-Object { $_.Extension -in @('.json','.py','.mjs') })
    $inputs += @(Get-ChildItem -LiteralPath (Join-Path $root 'assets') -File -Recurse |
        Where-Object { $_.FullName -notmatch '[\\/]__pycache__[\\/]|\.pyc$' })
    $records = @(foreach ($file in $inputs) {
        $relative = $file.FullName.Substring($root.Length + 1).Replace('\','/')
        $inputPath = $file.FullName
        if ($relative -in @('assets/selection-center/row-actions.js','assets/selection-center/product-insight.js')) {
            $inputPath = Join-Path (Join-Path (Split-Path -Parent $root) 'QianchuanAuto') $relative
        }
        $item = Get-Item -LiteralPath $inputPath
        '{0}|{1}|{2}' -f $relative, $item.Length, (Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash
    })
    # Ordinal sorting is essential: Windows PowerShell/.NET Framework and
    # PowerShell 7/.NET use different culture-aware collation on the same PC.
    $sortedRecords = [string[]]$records
    [Array]::Sort($sortedRecords, [StringComparer]::Ordinal)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($sortedRecords -join "`n"))).Replace('-','') }
    finally { $algorithm.Dispose() }
    [pscustomobject]@{ fileCount=$records.Count; sha256=$hash }
}

function Read-VerifiedReleasePackage {
    param([string]$PackagePath, [string]$MetadataPath)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $metadata = Get-Content -LiteralPath $MetadataPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $package = Get-Item -LiteralPath $PackagePath
    $hash = (Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash
    if ($metadata.appId -ne 'qianchuan-auto' -or $metadata.channel -ne 'stable' -or
        $metadata.package.fileName -cne $package.Name -or [int64]$metadata.package.size -ne $package.Length -or
        $metadata.package.sha256 -ne $hash) { throw '发布 ZIP 与元数据不一致。' }
    $archive = [IO.Compression.ZipFile]::OpenRead($package.FullName)
    try {
        $entries = @{}
        foreach ($entry in $archive.Entries) {
            if ([string]::IsNullOrEmpty($entry.Name)) { continue }
            $path = Get-ReleaseRelativePath $entry.FullName
            if ($entries.ContainsKey($path)) { throw "ZIP 重复路径：$path" }
            if ($path -match '(?i)(^|/)(local-only|smart-monitor|local-monitor)(/|$)') { throw '公开包包含本机测试资源，拒绝发布。' }
            if ($path -ieq 'QianchuanAuto.exe') {
                $localCheckStream=$entry.Open(); $localCheckMemory=New-Object IO.MemoryStream
                try { $localCheckStream.CopyTo($localCheckMemory); Assert-PublicReleaseBytes $localCheckMemory.ToArray() }
                finally { $localCheckStream.Dispose(); $localCheckMemory.Dispose() }
            }
            $entries[$path] = $entry
        }
        if (-not $entries.ContainsKey('release-manifest.json')) { throw 'ZIP 缺少发布清单。' }
        $reader = New-Object IO.StreamReader($entries['release-manifest.json'].Open(), [Text.Encoding]::UTF8)
        try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        if ($manifest.schemaVersion -ne 1 -or $manifest.appId -ne 'qianchuan-auto' -or
            $manifest.entryPoint -cne 'QianchuanAuto.exe' -or $manifest.version -ne $metadata.version) { throw 'ZIP 清单身份不一致。' }
        $map = Assert-ReleaseFileRecords @($manifest.files)
        if ($entries.Count -ne $map.Count + 1) { throw 'ZIP 存在未声明文件或缺失文件。' }
        foreach ($relative in $map.Keys) {
            if (-not $entries.ContainsKey($relative)) { throw "ZIP 缺少文件：$relative" }
            $entry = $entries[$relative]
            $stream = $entry.Open(); $algorithm = [Security.Cryptography.SHA256]::Create()
            try { $entryHash = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','') }
            finally { $stream.Dispose(); $algorithm.Dispose() }
            if ($entry.Length -ne [int64]$map[$relative].size -or $entryHash -ne $map[$relative].sha256) { throw "ZIP 文件校验失败：$relative" }
        }
        $reader = New-Object IO.StreamReader($entries['assets/release/build.json'].Open(), [Text.Encoding]::UTF8)
        try { $build = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        if ($build.version -ne $metadata.version -or $build.candidateId -cne $metadata.candidate.candidateId -or
            $build.sourceFingerprintSha256 -ne $metadata.candidate.sourceFingerprintSha256) { throw '构建身份与发布记录不一致。' }
        [pscustomobject]@{ metadata=$metadata; manifest=$manifest; build=$build; packageSha256=$hash }
    } finally { $archive.Dispose() }
}

function Assert-ReleaseAcceptance {
    param([object]$Package, [object]$Acceptance, [string]$SourceDirectory)
    if ($Acceptance.schemaVersion -ne 1 -or $Acceptance.version -ne $Package.metadata.version -or
        $Acceptance.packageSha256 -ne $Package.packageSha256 -or
        $Acceptance.candidateId -cne $Package.build.candidateId -or $Acceptance.status -ne 'accepted') {
        throw '验收记录不属于这个发布包，拒绝上传。'
    }
    foreach ($check in @('one-cut-download','one-cut-upload','clean-install','upgrade-install')) {
        if ($check -notin @($Acceptance.checks)) { throw "缺少验收项：$check" }
    }
    $differences = @(Get-ReleaseFileDifferences $Acceptance.installDirectory @($Package.manifest.files))
    if ($differences.Count -gt 0) { throw "验收后的安装文件已变化：$($differences.path -join ', ')" }
    if (-not [string]::IsNullOrEmpty($SourceDirectory)) {
        $fingerprint = Get-ReleaseInputFingerprint $SourceDirectory
        if ($fingerprint.sha256 -ne $Package.build.sourceFingerprintSha256) {
            throw '源码已不同于已验收构建，禁止把已有 ZIP 当成最新修复上传；请生成新构建并重新验收。'
        }
    }
}
