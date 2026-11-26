param(
    [string]$InstallDirectory,
    [string]$DataDirectory,
    [string]$OutputDirectory,
    [switch]$NoDiscovery,
    [switch]$AsObject
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
# Used both by the in-app button and the portable support tool. Read only the
# task stores, never browser profiles, credentials, raw requests or video files.
function Read-Field($Value, [string]$Name) {
    if ($null -eq $Value) { return $null }
    $property = $Value.PSObject.Properties[$Name]
    if ($null -ne $property) { return $property.Value }
    return $null
}
function Safe-Text($Value, [int]$Limit = 2000) {
    $text = [string]$Value
    $text = [regex]::Replace($text, '(?is)(authorization|cookie|set-cookie)["'']?\s*[:=][^\r\n]*', '$1=[已隐藏]')
    $text = [regex]::Replace($text, '(?i)(["'']?(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|secret|password|sessionid|ttwid|msToken)["'']?\s*[:=]\s*)(?:"[^"]*"|''[^'']*''|[^\s,;}&]+)', '$1[已隐藏]')
    $text = [regex]::Replace($text, '(?i)\bBearer\s+[^\s"'',;]+', 'Bearer [已隐藏]')
    $text = [regex]::Replace($text, '(?i)\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '[凭证已隐藏]')
    $text = [regex]::Replace($text, '(?i)https?://[^\s"''<>]+', '[链接已隐藏]')
    $text = [regex]::Replace($text, '(?i)\b[A-Z]:[\\/][^\r\n"''<>]*', '[本地路径已隐藏]')
    if ($text.Length -gt $Limit) { return $text.Substring(0, $Limit) + '…' }
    return $text
}
function Safe-Id($Value) {
    $text = [string]$Value
    if ($text -match '^[a-zA-Z0-9_.:-]{1,100}$') { return $text }
    return ''
}
function Safe-Date($Value) {
    if ($Value -is [DateTime]) { return $Value.ToUniversalTime().ToString('o') }
    return Safe-Text $Value 64
}
$roots = New-Object 'System.Collections.Generic.List[string]'
$installations = New-Object 'System.Collections.Generic.List[object]'
function Add-DataRoot([string]$Directory) {
    if ([string]::IsNullOrWhiteSpace($Directory)) { return }
    $full = [IO.Path]::GetFullPath($Directory).TrimEnd([char[]]'\/')
    if (!(Test-Path -LiteralPath (Join-Path $full 'one_cut') -PathType Container)) { return }
    if (!$roots.Contains($full)) { $roots.Add($full) }
}
function Add-InstallRoot([string]$Directory) {
    if ([string]::IsNullOrWhiteSpace($Directory)) { return }
    $exe = Join-Path $Directory 'QianchuanAuto.exe'
    if (Test-Path -LiteralPath $exe -PathType Leaf) {
        $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
        $installations.Add([pscustomobject]@{ applicationVersion=$version.FileVersion; productVersion=$version.ProductVersion })
    }
    Add-DataRoot (Join-Path $Directory 'data')
    $parent = Split-Path -Parent $Directory
    if ($parent -and (Test-Path -LiteralPath (Join-Path $parent 'python/python.exe') -PathType Leaf)) {
        Add-DataRoot (Join-Path $parent 'data')
    }
}
if ($DataDirectory) { Add-DataRoot $DataDirectory }
else {
    Add-InstallRoot $InstallDirectory
    if (!$NoDiscovery) {
        try {
            foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name LIKE 'QianchuanAuto%.exe'" -ErrorAction Stop)) {
                if ($process.ExecutablePath) { Add-InstallRoot (Split-Path -Parent $process.ExecutablePath) }
            }
        } catch { }
    }
}
if ($roots.Count -eq 0) { throw '没有找到任务记录。请先打开需要排查的软件，再双击本工具。' }
if (!$AsObject) {
    if (!$OutputDirectory) { $OutputDirectory = [Environment]::GetFolderPath('Desktop') }
    if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { throw '桌面目录不可用，请在软件中重新导出。' }
    [void][IO.Directory]::CreateDirectory($OutputDirectory)
}
$tasks = New-Object 'System.Collections.Generic.List[object]'
$resolutionEvents = New-Object 'System.Collections.Generic.List[object]'
$issues = New-Object 'System.Collections.Generic.List[object]'
$statusNames = @('Waiting','Resolving','Downloading','Downloaded','Uploading','WaitingConfirmation','Succeeded','WaitingRetry','Failed','Paused','Cancelled')
$legacyStatuses = @('Waiting','Resolving','Ready','Downloading','Paused','Completed','UploadPending','Uploading','UploadCompleted','UploadFailed','Failed','Cancelled')
$stages = @('Download','Upload','Confirmation')
function Add-Task($Record, [string]$Origin, [string]$Kind, [string]$Storage = '') {
    $row = [ordered]@{ source=$Origin; kind=$Kind }
    if ($Storage) { $row['stateSource'] = $Storage }
    foreach ($field in @('LocalTaskId','Id','PlatformVideoId','PlatformMaterialId','ErrorCode','LastSessionFailureCode','FileFingerprintMd5','UploadFileFingerprintMd5')) {
        $value = Read-Field $Record $field
        if ($null -ne $value) { $row[$field] = Safe-Id $value }
    }
    foreach ($field in @('Title','Status','RetryStage','ResolveStage','UploadStage','ErrorMessage','LastSessionFailureMessage')) {
        $value = Read-Field $Record $field
        if ($null -ne $value) { $row[$field] = Safe-Text $value }
    }
    $status = 0
    if ([int]::TryParse([string](Read-Field $Record 'Status'), [ref]$status)) {
        $names = if ($Kind -eq 'background') { $statusNames } else { $legacyStatuses }
        if ($status -ge 0 -and $status -lt $names.Count) { $row['Status'] = $names[$status] }
    }
    $stage = 0
    if ([int]::TryParse([string](Read-Field $Record 'RetryStage'), [ref]$stage) -and $stage -ge 0 -and $stage -lt $stages.Count) {
        $row['RetryStage'] = $stages[$stage]
    }
    foreach ($field in @('Sequence','DownloadAttempts','UploadAttempts','SessionRecoveryAttempts','DownloadPercent','UploadPercent','DownloadedBytes','TotalBytes')) {
        $number = [long]0
        if ([long]::TryParse([string](Read-Field $Record $field), [ref]$number)) { $row[$field] = $number }
    }
    foreach ($field in @('UploadResultUncertain','DownloadVideoAdapted')) {
        $value = Read-Field $Record $field
        if ($value -is [bool]) { $row[$field] = $value }
    }
    foreach ($field in @('UpdatedAt','DownloadedAt','UploadedAt','ConfirmedAt','BoundAt','PlanBindingSubmittedAtUtc','NextAttemptAt')) {
        $value = Read-Field $Record $field
        if ($null -ne $value) { $row[$field] = Safe-Date $value }
    }
    $snapshot = Read-Field $Record 'Snapshot'
    if ($snapshot) {
        $row['BatchId'] = Safe-Id (Read-Field $snapshot 'BatchId')
        $row['AdvertiserId'] = Safe-Id (Read-Field $snapshot 'AdvertiserId')
        $row['TargetPlanId'] = Safe-Id (Read-Field $snapshot 'TargetPlanId')
        $row['CreatedAt'] = Safe-Date (Read-Field $snapshot 'CreatedAt')
    }
    $tasks.Add([pscustomobject]$row)
}
# Match the application's durable loader: batch snapshot plus per-task records,
# newest UpdatedAt wins, task-file wins a tie, and .bak is a read-failure fallback.
function Read-Store([string]$Path, [string]$Origin, [string]$Label) {
    $found = $false
    foreach ($candidate in @($Path, ($Path + '.bak'))) {
        if (!(Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $found = $true
        try {
            $file = Get-Item -LiteralPath $candidate
            if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $file.Length -gt 20MB) { throw 'Unsupported task record' }
            $value = Get-Content -LiteralPath $candidate -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($null -eq $value) { throw 'Empty record' }
            $backup = $candidate.EndsWith('.bak')
            if ($backup) { $issues.Add([pscustomobject]@{source=$Origin;record=$Label;message='当前记录无法读取，使用软件保留的备份'}) }
            return [pscustomobject]@{value=$value;backup=$backup}
        } catch { }
    }
    if ($found) { $issues.Add([pscustomobject]@{source=$Origin;record=$Label;message='任务记录未能读取，可能正在更新，请稍后再导出'}) }
    return $null
}
function Task-Ticks($Record) {
    $value = Read-Field $Record 'UpdatedAt'
    if ($value -is [DateTime]) { return $value.ToUniversalTime().Ticks }
    $date = [DateTimeOffset]::MinValue
    if ([DateTimeOffset]::TryParse([string]$value,[ref]$date)) { return $date.UtcTicks }
    if ([string]$value -match '^/Date\((-?\d+)(?:[+-]\d{4})?\)/$') {
        return [DateTime]::new(1970,1,1,0,0,0,[DateTimeKind]::Utc).AddMilliseconds([double]$Matches[1]).Ticks
    }
    return [long]0
}
function Merge-Task($Merged, $Record, [string]$BatchId, $DeletedTasks, [string]$Storage) {
    $id = Safe-Id (Read-Field $Record 'LocalTaskId')
    $snapshot = Read-Field $Record 'Snapshot'
    if (!$id -or !$snapshot -or (Read-Field $snapshot 'BatchId') -cne $BatchId -or $DeletedTasks.ContainsKey($BatchId + ':' + $id)) { return }
    if (!$Merged.ContainsKey($id) -or (Task-Ticks $Record) -ge (Task-Ticks $Merged[$id].record)) {
        $Merged[$id] = [pscustomobject]@{record=$Record;storage=$Storage}
    }
}
$summaries = New-Object 'System.Collections.Generic.List[object]'
$rootNumber = 0
foreach ($root in $roots) {
    $rootNumber++
    $origin = 'software-' + $rootNumber
    # Explicit field allowlist: preserve correlation IDs and CDN origin only.
    # Never include arbitrary messages, URL paths, signed queries or credentials.
    foreach ($suffix in @('.previous', '')) {
        $logPath = Join-Path $root ('one_cut/resolution-diagnostics.jsonl' + $suffix)
        if (!(Test-Path -LiteralPath $logPath -PathType Leaf)) { continue }
        try {
            $logFile = Get-Item -LiteralPath $logPath
            if (($logFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $logFile.Length -gt 2MB) {
                throw 'Unsupported diagnostic log'
            }
            foreach ($line in @(Get-Content -LiteralPath $logPath -Encoding UTF8 -Tail 2000)) {
                try {
                    $event = $line | ConvertFrom-Json
                    $stamp = [DateTimeOffset]::MinValue
                    if (![DateTimeOffset]::TryParse([string](Read-Field $event 'timestampUtc'), [ref]$stamp)) { continue }
                    $row = [ordered]@{ source=$origin; timestampUtc=$stamp.UtcDateTime.ToString('o') }
                    foreach ($key in @('taskId','requestId','stage','code','exceptionType','cdnReason')) {
                        $row[$key] = Safe-Id (Read-Field $event $key)
                    }
                    $status = 0
                    if ([int]::TryParse([string](Read-Field $event 'httpStatus'), [ref]$status) -and $status -ge 0 -and $status -le 599) {
                        $row['httpStatus'] = $status
                    }
                    $cdnHost = [string](Read-Field $event 'cdnHost')
                    if ($cdnHost.Length -le 253 -and $cdnHost -cmatch '^[a-zA-Z0-9.:-]+$') {
                        $row['cdnHost'] = $cdnHost
                        $scheme = [string](Read-Field $event 'cdnScheme')
                        if ($scheme -cmatch '^[a-z][a-z0-9+.-]{0,19}$') { $row['cdnScheme'] = $scheme }
                        $port = 0
                        if ([int]::TryParse([string](Read-Field $event 'cdnPort'), [ref]$port) -and $port -ge 0 -and $port -le 65535) {
                            $row['cdnPort'] = $port
                        }
                    }
                    $resolutionEvents.Add([pscustomobject]$row)
                } catch { $issues.Add([pscustomobject]@{source=$origin;message='一条解析诊断记录未能读取'}) }
            }
        } catch { $issues.Add([pscustomobject]@{source=$origin;message='解析诊断日志未能读取'}) }
    }
    $batchRoot = Join-Path $root 'one_cut/background/v1/batches'
    $deletions = Read-Store (Join-Path $root 'one_cut/background/v1/deleted-records.json') $origin 'deleted-records'
    $deletedBatches = @{}; $deletedTasks = @{}
    if ($deletions) {
        foreach ($id in @(Read-Field $deletions.value 'BatchIds')) { if ($id) { $deletedBatches[[string]$id] = $true } }
        foreach ($id in @(Read-Field $deletions.value 'TaskKeys')) { if ($id) { $deletedTasks[[string]$id] = $true } }
    }
    $snapshotRecords = 0; $taskFileRecords = 0; $exportedRecords = 0
    if (Test-Path -LiteralPath $batchRoot) {
        $batches = @(Get-ChildItem -LiteralPath $batchRoot -Directory | Where-Object { !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and !$_.Name.StartsWith('.staging-') -and !$deletedBatches.ContainsKey($_.Name) } | Sort-Object LastWriteTimeUtc -Descending)
        if ($batches.Count -gt 20) { $issues.Add([pscustomobject]@{source=$origin;message='仅导出最近 20 批任务'}) }
        foreach ($batch in @($batches | Select-Object -First 20)) {
            $merged = @{}
            $snapshot = Read-Store (Join-Path $batch.FullName 'committed-snapshot.json') $origin ('snapshot:' + (Safe-Id $batch.Name))
            if ($snapshot) {
                foreach ($record in @(Read-Field $snapshot.value 'Tasks')) {
                    if (!$record) { continue }
                    $snapshotRecords++
                    $storage = if ($snapshot.backup) { 'batch-snapshot-backup' } else { 'batch-snapshot' }
                    Merge-Task $merged $record $batch.Name $deletedTasks $storage
                }
            }
            $folder = Join-Path $batch.FullName 'tasks'
            if ((Test-Path -LiteralPath $folder) -and !((Get-Item -LiteralPath $folder).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                $files = @(Get-ChildItem -LiteralPath $folder -Filter '*.json' -File | Where-Object { !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) })
                foreach ($file in $files) {
                    $saved = Read-Store $file.FullName $origin ('task:' + (Safe-Id $file.BaseName))
                    if ($saved) {
                        $taskFileRecords++
                        $storage = if ($saved.backup) { 'task-file-backup' } else { 'task-file' }
                        Merge-Task $merged $saved.value $batch.Name $deletedTasks $storage
                    }
                }
            }
            if ($merged.Count -gt 500) { $issues.Add([pscustomobject]@{source=$origin;batch=Safe-Id $batch.Name;message='该批次仅导出最近 500 条任务'}) }
            foreach ($entry in @($merged.Values | Sort-Object { Task-Ticks $_.record } -Descending | Select-Object -First 500)) {
                Add-Task $entry.record $origin 'background' $entry.storage
                $exportedRecords++
            }
        }
    }
    $summaries.Add([pscustomobject]@{source=$origin;snapshotRecords=$snapshotRecords;taskFileRecords=$taskFileRecords;mergedBackgroundTasks=$exportedRecords})
    $legacyFile = Join-Path $root 'one_cut/tasks.json'
    if (Test-Path -LiteralPath $legacyFile) {
        try {
            if ((Get-Item -LiteralPath $legacyFile).Length -gt 8MB) { throw '历史任务文件过大' }
            $legacy = Get-Content -LiteralPath $legacyFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($null -ne (Read-Field $legacy 'tasks')) { $legacy = Read-Field $legacy 'tasks' }
            $legacyRows = @($legacy)
            if ($legacyRows.Count -gt 500) { $issues.Add([pscustomobject]@{source=$origin;message='旧版任务仅导出最后 500 条'}) }
            foreach ($record in @($legacyRows | Select-Object -Last 500)) { if ($record) { Add-Task $record $origin 'foreground' } }
        } catch { $issues.Add([pscustomobject]@{source=$origin;message='旧版任务记录未能读取'}) }
    }
}
$version = ''
if ($InstallDirectory -and (Test-Path -LiteralPath (Join-Path $InstallDirectory 'QianchuanAuto.exe'))) {
    $version = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $InstallDirectory 'QianchuanAuto.exe')).FileVersion
}
$report = [ordered]@{
    schemaVersion=2; collectorVersion='1.2'; kind='one-cut-task-diagnostics'; exportedAtUtc=[DateTime]::UtcNow.ToString('o')
    applicationVersion=$version; softwareCount=$roots.Count; taskCount=$tasks.Count
    note='包含任务状态、失败原因、请求关联编号及 CDN 域名；不含登录凭证、原始请求、视频文件或完整下载链接。'
    tasks=@($tasks.ToArray()); readIssues=@($issues.ToArray()); recordSources=@($summaries.ToArray()); detectedApplications=@($installations.ToArray())
    resolutionEvents=@($resolutionEvents.ToArray())
}
if ($AsObject) { return [pscustomobject]$report }
$output = Join-Path $OutputDirectory ('一刀不剪任务日志-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6) + '.json')
$bytes = [Text.UTF8Encoding]::new($false).GetBytes(($report | ConvertTo-Json -Depth 10))
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
Write-Output $output
