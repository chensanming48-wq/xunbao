param(
    [string]$InstallDirectory,
    [string]$DataDirectory,
    [string]$OutputDirectory,
    [string]$LocalAppDataDirectory = [Environment]::GetFolderPath('LocalApplicationData'),
    [string]$NativeSnapshotPath,
    [switch]$NoDiscovery,
    [switch]$SkipSystemEvents
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
# Read-only, fixed-source diagnostic collection. Never collect browser stores,
# credentials, media, arbitrary request bodies, prompts or complete directories.
$modules = [ordered]@{}
$problems = New-Object 'System.Collections.Generic.List[object]'
$dataRoots = New-Object 'System.Collections.Generic.List[string]'
$installs = New-Object 'System.Collections.Generic.List[string]'
$installInfo = @{}
$dataBrands = @{}
# Exact names verified against the brand registry and the Shunbao release source.
# New branded releases can also be recognized from their manifest + app marker.
# Escape the first character of main-brand literals so the OEM build's global
# branding substitutions cannot rewrite this cross-brand identification table.
$knownBrands=ConvertFrom-Json @'
[
 {"brand":"\u521b爆","entryPoint":"\u0051ianchuanAuto.exe","runtimeName":"\u0043huangbao","updater":"\u0043huangbaoUpdater.exe"},
 {"brand":"一刀不剪","entryPoint":"一刀不剪.exe","runtimeName":"Yidaobujian","updater":"YidaobujianUpdater.exe"},
 {"brand":"抖自动","entryPoint":"抖自动.exe","runtimeName":"Doubaodan","updater":"DoubaodanUpdater.exe"},
 {"brand":"瞬爆","entryPoint":"瞬爆.exe","runtimeName":"Shunbao","updater":"ShunbaoUpdater.exe"}
]
'@
$running = @()
function Clean-Text($Value, [int]$Limit = 3000) {
    $s = [string]$Value
    # A credential-bearing line is withheld in its entirety, including suffixes.
    $s = [regex]::Replace($s, '(?im)^.*(?:authorization|set-cookie|cookie|access[_-]?token|refresh[_-]?token|token|api[_-]?key|password|secret|sessionid|ttwid|msToken)["'']?\s*[:=].*$', '[含凭证的内容已隐藏]')
    $s = [regex]::Replace($s, '(?i)\bBearer\s+[^\s"'',;]+', 'Bearer [已隐藏]')
    $s = [regex]::Replace($s, '\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '[凭证已隐藏]')
    $s = [regex]::Replace($s, '(?i)https?://[^\s"''<>]+', '[链接已隐藏]')
    $s = [regex]::Replace($s, '(?i)(?:\b[A-Z]:[\\/]|\\\\)[^\r\n"''<>]*', '[本地路径已隐藏]')
    if ($s.Length -gt $Limit) { $s = $s.Substring(0,$Limit) + '…[截断]' }
    return $s
}
function Issue([string]$Module, [string]$Source, [string]$Message) {
    $problems.Add([pscustomobject]@{module=$Module; source=$Source; message=$Message})
}
function Module([string]$Id, [string]$Name) {
    $modules[$Id] = [ordered]@{name=$Name; status='no_records'; sources=(New-Object 'System.Collections.Generic.List[object]'); evidenceCount=0}
}
Module 'onecut' '一刀不剪'
Module 'accounts' '账户登录与千川同步'
Module 'plans' '自动建计划与素材上传'
$leafFieldsAutoPlan = @('waiting','lockName','owner','ownerKnown','ownerOperation','ownerSlot','ownerSinceUtc','elapsedMilliseconds','timeoutSeconds','cssWidth','cssHeight','nativeWidth','nativeHeight','systemDpi','systemScale','zoomFactor')
Module 'aiVideo' 'AI 视频'
Module 'aiImage' 'AI 图文'
Module 'graphicDownload' '图文下载'
Module 'video' '视频处理与混剪'
Module 'runtime' '启动、运行与素材处理'
Module 'updates' '软件更新'
Module 'crashes' '本软件崩溃事件'
Module 'selection' '选品中心、增强查看与映射'
Module 'roi' 'ROI 计算器'
Module 'license' '软件登录与会员鉴权'
Module 'support' '客服入口'
Module 'home' '首页与统计展示'
Module 'tutorials' '观看教程'
Module 'performance' '现场卡顿与资源占用'
Module 'installation' '安装事务与恢复'

# The same native collector supplies verified shared-core brand identity and
# live evidence to both standalone and in-program entrances. Parse as data only.
$nativeSnapshot=$null
$identityOverrides=@{}
if($NativeSnapshotPath) {
    try {
        $snapshotFile=Get-Item -LiteralPath $NativeSnapshotPath
        if($snapshotFile.Length -gt 4MB -or ($snapshotFile.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Snapshot exceeds limit or is a link'}
        $nativeSnapshot=Get-Content -LiteralPath $NativeSnapshotPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if($nativeSnapshot.kind -ne 'software-native-checks'){throw 'Unknown snapshot'}
        foreach($identity in @($nativeSnapshot.identities | Select-Object -First 8)) {
            if($identity.identityStatus -notin @('signed-brand-verified','unverified','manifest-display-only','legacy-filename')){continue}
            $directory=[IO.Path]::GetFullPath([string]$identity.directory).TrimEnd([char[]]'\/')
            if(Test-Path -LiteralPath $directory -PathType Container){$identityOverrides[$directory]=$identity}
        }
    } catch { $nativeSnapshot=$null;Issue 'runtime' 'native-snapshot' '现场检查输入未能读取，不能判断运行正常' }
}

function Add-Root($Directory, $List) {
    if ([string]::IsNullOrWhiteSpace($Directory)) { return }
    $full = [IO.Path]::GetFullPath($Directory).TrimEnd([char[]]'\/')
    if ((Test-Path -LiteralPath $full -PathType Container) -and !$List.Contains($full)) { $List.Add($full) }
}
function Safe-LocalName([string]$Name) { return $Name -and $Name -notmatch '[\\/:*?"<>|]' -and $Name -ne '.' -and $Name -ne '..' -and $Name.Length -le 120 }
function Test-ApplicationEntry([string]$Path) {
    # Inspect CLR metadata only; never load or execute a customer's executable.
    # NSIS packages, including renamed Shunbao.exe, are native executables and
    # cannot establish an installed application's component inventory.
    try {
        $assembly=[Reflection.AssemblyName]::GetAssemblyName($Path)
        return $null -ne $assembly.Version -and $assembly.Version.Major -eq 10
    } catch { return $false }
}
function Install-Identity([string]$Directory) {
    $directoryKey=[IO.Path]::GetFullPath($Directory).TrimEnd([char[]]'\/')
    if($identityOverrides.ContainsKey($directoryKey)) {
        $identity=$identityOverrides[$directoryKey]
        if((Safe-LocalName $identity.entryPoint) -and ((Test-Path -LiteralPath (Join-Path $Directory $identity.entryPoint) -PathType Leaf) -or (Test-Path -LiteralPath (Join-Path $Directory 'release-manifest.json') -PathType Leaf) -or (Test-Path -LiteralPath (Join-Path $Directory 'brand/brand.bundle.json') -PathType Leaf))) {
            return [pscustomobject]@{brand=(Clean-Text $identity.brand 60);entryPoint=$identity.entryPoint;runtimeName=$(if(Safe-LocalName $identity.runtimeName){$identity.runtimeName}else{''});updater=$(if(Safe-LocalName $identity.updater){$identity.updater}else{''})}
        }
    }
    if(Test-Path -LiteralPath (Join-Path $Directory 'brand/brand.bundle.json') -PathType Leaf) {
        if((Test-Path -LiteralPath (Join-Path $Directory 'QianchuanAuto.exe') -PathType Leaf) -or (Test-Path -LiteralPath (Join-Path $Directory 'release-manifest.json') -PathType Leaf)) {
            return [pscustomobject]@{brand='OEM（身份未核验）';entryPoint='QianchuanAuto.exe';runtimeName='';updater='ChuangbaoUpdater.exe'}
        }
    }
    $manifestPath=Join-Path $Directory 'release-manifest.json'
    try {
        if ((Test-Path -LiteralPath $manifestPath -PathType Leaf) -and (Get-Item -LiteralPath $manifestPath).Length -le 2MB) {
            $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $entry=[string]$manifest.entryPoint
            if ((Safe-LocalName $entry) -and $entry.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase) -and
                (Test-Path -LiteralPath (Join-Path $Directory $entry) -PathType Leaf) -and
                (Test-ApplicationEntry (Join-Path $Directory $entry)) -and
                (Test-Path -LiteralPath (Join-Path $Directory 'assets/one-cut-web/app.js') -PathType Leaf) -and
                ($manifest.appId -eq 'qianchuan-auto' -or ($manifest.brandSlug -and $manifest.brandName))) {
                $known=@($knownBrands|Where-Object {$_.entryPoint -eq $entry}|Select-Object -First 1)
                $updater=[string]$manifest.updater
                if(!(Safe-LocalName $updater) -or !$updater.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)){$updater=if($known.Count){$known[0].updater}else{''}}
                $runtime=if($known.Count){$known[0].runtimeName}else{[IO.Path]::GetFileNameWithoutExtension($updater) -replace 'Updater$',''}
                if(!(Safe-LocalName $runtime)){$runtime=''}
                $brand=if($manifest.brandName){Clean-Text $manifest.brandName 60}elseif($known.Count){$known[0].brand}else{'本软件 OEM'}
                return [pscustomobject]@{brand=$brand;entryPoint=$entry;runtimeName=$runtime;updater=$updater}
            }
        }
    } catch { }
    foreach($brand in $knownBrands){if((Test-Path -LiteralPath (Join-Path $Directory $brand.entryPoint) -PathType Leaf) -and (Test-ApplicationEntry (Join-Path $Directory $brand.entryPoint))){return $brand}}
    return $null
}
function Add-Install([string]$Directory) {
    if (!$Directory) { return }
    $Directory=[IO.Path]::GetFullPath($Directory).TrimEnd([char[]]'\/')
    if($installInfo.ContainsKey($Directory)){return}
    $identity=Install-Identity $Directory
    if(!$identity){return}
    $installInfo[$Directory]=$identity
    Add-Root $Directory $installs
    $data=Join-Path $Directory 'data'
    Add-Root $data $dataRoots
    $dataBrands[[IO.Path]::GetFullPath($data).TrimEnd([char[]]'\/')]=$identity.brand
    $parent = Split-Path -Parent $Directory
    if ($parent -and (Test-Path -LiteralPath (Join-Path $parent 'python/python.exe'))) {
        $data=Join-Path $parent 'data';Add-Root $data $dataRoots
        $dataBrands[[IO.Path]::GetFullPath($data).TrimEnd([char[]]'\/')]=$identity.brand
    }
}
Add-Install $InstallDirectory
if ($DataDirectory) { Add-Root $DataDirectory $dataRoots }
if (!$NoDiscovery) {
    foreach($directory in $identityOverrides.Keys) { Add-Install $directory }
    try {
        $processes = @(Get-CimInstance Win32_Process -Filter "Name LIKE '%.exe'" -ErrorAction Stop)
        $checked=@{}
        foreach ($p in $processes) {
            if (!$p.ExecutablePath) { continue }
            $directory=Split-Path -Parent $p.ExecutablePath
            if(!$checked.ContainsKey($directory)){$checked[$directory]=$true;Add-Install $directory}
        }
        $running=@($processes|Where-Object {
            if(!$_.ExecutablePath){return $false}
            $identity=$installInfo[(Split-Path -Parent $_.ExecutablePath)]
            if(!$identity){return $false}
            return $_.Name -eq $identity.entryPoint -or ($identity.runtimeName -and $_.Name -match ('^'+[regex]::Escape($identity.runtimeName)+'-v[0-9.]+\.exe$'))
        })
    } catch { Issue 'runtime' 'process-discovery' '未能读取运行程序列表' }
    if ($installs.Count -eq 0) {
        # Closed/crashed applications can still be discovered through their shortcuts.
        try {
            $shell = New-Object -ComObject WScript.Shell
            foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'), [Environment]::GetFolderPath('StartMenu'))) {
                if (!$folder -or !(Test-Path -LiteralPath $folder)) { continue }
                foreach ($link in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 120)) {
                    $target = $shell.CreateShortcut($link.FullName).TargetPath
                    if ($target -and $target.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)) { Add-Install (Split-Path -Parent $target) }
                }
            }
        } catch { Issue 'runtime' 'shortcut-discovery' '未能读取软件快捷方式' }
    }
}
if ($installs.Count -eq 0) { Issue 'runtime' 'installation' '未识别安装目录；可先打开要排查的软件再导出。当前仍会采集可用的本软件记录。' }
if ($dataRoots.Count -eq 0) { Issue 'runtime' 'data' '未找到软件数据目录，任务和同步记录可能不完整' }

# Only fields that describe diagnostic state are retained. Unknown fields and
# containers (notably request/settings/materials) are intentionally omitted.
$leafFields = @('id','localTaskId','taskId','batchId','taskNo','submissionNo','traceId','code','errorCode','messageKey','message','error','errorMessage','reason','status','state','statusText','stage','kind','type','action','event','eventName','mode','workflowType','schemaVersion','schema_version','version','createdAt','updatedAt','completedAt','submittedAt','startedAt','finishedAt','timestamp','time','time_epoch','updated_at','created_at','duration','resolution','ratio','modelName','model','progress','progressPercent','retryCount','attempts','attempt','count','success','succeeded','failed','total','platform_confirmed','packet_confirmed','last_identity_attempt_success','last_identity_http_status','last_identity_error','identity_sync_time','last_business_attempt_success','last_business_http_status','last_business_error','has_business_data','business_sync_time','business_period','product_sync_status','session_slot','slot','shop_id','platform_shop_id','advertiserId','planId','productId','materialId','videoId','platformVideoId','platformMaterialId','estimatedCredits','chargedCredits','refundedCredits','refundStatus','billingStatus','reservedCredits','actualCredits','credits','httpStatus','statusCode','exitCode','elapsedMs','elapsed','nextRetryAt','lastAttemptAt','lastSuccessAt','lastError','lastErrorCode','consecutiveFailures','retryAfter','isLoggedIn','loginStatus','syncStatus','syncTime','lastSyncAt','errorCategory','component','operation','fileVersion','productVersion')
$containerFields = @('tasks','records','items','accounts','detail','failure','errors','data','result','results','summary','submission','billing','refund','metrics','diagnostics','error')
$leafFields += @('utc','observedPostCount','observer')
$leafFields += @('phase','pendingReboot','rolledBack','startupHealthy','targetVersion','sourceVersion','failureStage','nativeErrorCode','primaryError','rollbackError','webReady','bridgeReady','errorCategory','businessCode')
$leafFields += @('account_hash','last_attempt_at','last_good_sync_at','next_due_at','next_qianchuan_due_at','retry_count','last_result')
# The persisted Qianchuan state also contains protected identities and profile
# selectors. Keep only explicit state/error fields; never export the raw store.
$leafFields += @('captured_at','validation_error','core_metrics_parse_success','core_metrics_parse_error','rows_count','total_count','body_length','method',
    'login_workflow_state','query_status','last_product_count','product_auto_retry_count','product_auto_last_attempt_at','product_auto_last_good_at','product_auto_next_due_at','product_auto_last_reason',
    'has_ever_logged_in','last_successful_login_at','login_expired_detected','login_state_reason','last_confirmed_login_state','last_confirmed_login_state_at','last_confirmed_login_reason',
    'binding_confirmed','binding_source','binding_confirmed_at','account_selection_required','account_list_complete','account_count','account_list_observed_at',
    'pending_started_at','pending_was_manual_selection','pending_has_explicit_user_click','pending_page_identity_confirmed',
    'last_balance_attempt_success','last_overview_attempt_success','last_volume_plan_attempt_success','last_cost_plan_attempt_success','last_multiply_plan_attempt_success',
    'last_plan_sync_at','last_plan_error','last_balance_http_status','last_overview_http_status','last_balance_error','last_overview_error','last_attempt','last_attempt_used_retry',
    'last_overview_attempt_id','last_overview_current_request_seen','last_overview_body_read_failed','last_overview_request_will_be_sent_seen','last_overview_response_received_seen',
    'last_overview_loading_finished_seen','last_overview_child_session_seen','last_overview_webresource_read_failed','last_overview_network_read_attempted','last_overview_network_read_failed',
    'last_overview_fetch_read_attempted','last_overview_fetch_read_failed','last_overview_body_channel','last_overview_network_read_error','last_overview_fetch_read_error',
    'last_qianchuan_navigation_completed_at','last_qianchuan_navigation_started_at','last_qianchuan_first_child_session_at','last_qianchuan_first_trusted_request_at','last_qianchuan_sync_started_at',
    'last_qianchuan_readiness_retry_stage','last_qianchuan_late_request_requeue_used','last_qianchuan_deferred_requeue_used','current_display_source','has_balance','has_overview',
    'overview_period','overview_statistical_date','overview_statistical_scope','overview_scope_verified','balance_sync_time','overview_sync_time','unified_account_sync_time',
    'auto_plan_existing_inventory_synced_at','auto_plan_existing_inventory_last_attempt_at','auto_plan_existing_inventory_last_error','auto_plan_existing_inventory_last_transport',
    'auto_plan_existing_inventory_last_product_count','auto_plan_existing_inventory_last_plan_count',
    'flow_step','flow_reason','flow_action','flow_time_utc','flow_failed','flow_last_failed_step','flow_last_failed_reason',
    'flow_last_failed_utc','account_suffix','flow_login_utc','flow_plan_paint_utc','flow_login_to_plans_seconds')
$leafFields += @('exceptionType','step','transportStatus','hresult')
$containerFields += @('flow_errors','stack')
function Project($Value, [int]$Depth = 0) {
    if ($null -eq $Value -or $Depth -gt 12) { return $null }
    if ($Value -is [string]) { return (Clean-Text $Value) }
    if ($Value -is [DateTime]) { return $Value.ToUniversalTime().ToString('o') }
    if ($Value -is [ValueType]) { return $Value }
    if ($Value -is [array]) {
        $rows = New-Object 'System.Collections.Generic.List[object]'
        foreach ($v in @($Value | Select-Object -Last 200)) { $item = Project $v ($Depth+1); if ($null -ne $item) { $rows.Add($item) } }
        if ($Value.Count -gt 200) { $rows.Add([pscustomobject]@{diagnosticNote='仅保留该列表最后 200 项'; omittedCount=($Value.Count-200)}) }
        return ,$rows.ToArray()
    }
    $o = [ordered]@{}
    foreach ($p in $Value.PSObject.Properties) {
        $scalar = $null -eq $p.Value -or $p.Value -is [string] -or $p.Value -is [ValueType]
        if (($scalar -and $leafFields -contains $p.Name) -or (!$scalar -and $containerFields -contains $p.Name)) {
            $projected = Project $p.Value ($Depth+1)
            if ($null -ne $projected) { $o[$p.Name] = $projected }
        }
    }
    if ($o.Count -eq 0) { return $null }
    return [pscustomobject]$o
}
function Read-Limited([string]$Path, [int]$Limit, [switch]$Tail) {
    if ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point not collected' }
    $stream = [IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try {
        if (!$Tail -and $stream.Length -gt $Limit) { throw 'File exceeds collection limit' }
        $clipped = $stream.Length -gt $Limit
        if ($clipped) { [void]$stream.Seek(-$Limit,[IO.SeekOrigin]::End) }
        $length = [int][Math]::Min($Limit,$stream.Length)
        $buffer = New-Object byte[] $length
        $offset=0
        while($offset -lt $length) { $read=$stream.Read($buffer,$offset,$length-$offset);if($read -eq 0){break};$offset+=$read }
        $text = [Text.Encoding]::UTF8.GetString($buffer,0,$offset).TrimStart([char]0xFEFF)
        if ($clipped) { $newline = $text.IndexOf("`n"); if ($newline -ge 0) { $text = $text.Substring($newline+1) } else { $text='' } }
        return [pscustomobject]@{text=$text; clipped=$clipped}
    } finally { $stream.Dispose() }
}
function File-Sha256([string]$Path) {
    # Windows PowerShell launched by a portable EXE can inherit a PowerShell 7
    # module path. Use .NET directly instead of relying on Get-FileHash autoload.
    $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $hash=[Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','') }
    finally { $hash.Dispose();$stream.Dispose() }
}
$leafFields += $leafFieldsAutoPlan
# Bounded read-only upload evidence; request bodies, cookies and settings are omitted.
$leafFields += @('FailureType','FailureReason','ResponseSha256','ResponseShape','PlatformCode','AtUtc','Accepted','CompleteLists','ProductCount','MatchedProductCount',
    'ReadOnlyRecoveryPending','RemoteVerificationAttempts','RemoteVerificationResult','LastRemoteVerificationAtUtc','RemoteVerificationDeadlineUtc',
    'RequestTransportNotice','PlanBindingSubmittedAtUtc','UploadResultUncertain','UploadStage','OneCutReadbackTimeoutSeconds','OneCutForcePublicFetch')
$containerFields += @('FirstRemoteFailure','FirstBindingResponse','RemoteEvidence','PlanBindingAcceptedProductIds','ProductIds')

$containerFields += @('viewport','waiting','owner')
# Queue pauses and failed read metadata distinguish a rejected task from an
# authentication failure. Never export raw browser stability logs.
$leafFields += @('AccountId','UploadPaused','ReasonCode','TargetPlanId','RetryStage')
function Capture-ReadFailures([string]$Root, [string]$Label) {
    $readPaths=@('/ad/api/v1/account/finance/get_adv_balance','/ad/api/v1/account/finance/get-adv-balance',
        '/ad/api/data/v1/common/statQuery','/ad/api/pmc/v1/standard/get_summary_info',
        '/ad/api/pmc/v1/uni-promotion/ad/list-required','/ad/api/pmc/v1/uni-promotion/ad/list-optional',
        '/ad/api/pmc/v1/uni-promotion/ad/list-summary','/ad/api/creation/v1/ad/ad-detail-plus',
        '/ad/api/creation/v1/ad/ad-detail-basic','/ad/api/creation/v1/ad/preCheckOperation',
        '/ad/api/creation/v1/material/get-video-play-info','/ad/api/creation/material/video-list',
        '/ad/api/creation/material/auth-key','/ad/api/creation/v1/material/check-text',
        '/ad/api/creation/v1/material/get-ebp-group-video-list','/ad/api/pmc/v1/uni-promotion/material/list-required',
        '/ad/api/pmc/v1/uni-promotion/material/get-ad-material-counts')
    $logs = Join-Path $Root 'logs'
    if (!(Test-Path -LiteralPath $logs -PathType Container)) { return }
    if ((Get-Item -LiteralPath $logs).Attributes -band [IO.FileAttributes]::ReparsePoint) { return }
    foreach ($file in @(Get-ChildItem -LiteralPath $logs -File -Filter 'crash_*.log' |
        Where-Object { $_.Name -match '^crash_[0-9]{8}\.log$' -and !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
        Sort-Object Name -Descending | Select-Object -First 3)) {
        $rows = New-Object 'System.Collections.Generic.List[object]'
        try {
            $inputText = Read-Limited $file.FullName 2MB -Tail
            foreach ($line in ($inputText.text -split '\r?\n')) {
                if ($line -notmatch '^([0-9T:.+Z-]+) read-response-shape ([A-Za-z]+) InvalidOperationException: (\{.*\})\s*$') { continue }
                $at=$Matches[1]; $category=$Matches[2]
                if ($category -notin @('LoginExpired','NeedVerification','RateLimited','AccessDenied','ContractChanged','Network','Timeout','Cancelled','StaleSession','BusinessError','CoolingDown','PageNotReady')) { continue }
                try { $shape=ConvertFrom-Json -InputObject $Matches[3] }
                catch { Issue 'runtime' ($Label+'/'+$file.Name) '一条只读失败元数据无法解析，已跳过'; continue }
                $path=[string]$shape.path
                if ($path -cnotin $readPaths) { $path='unrecognized' }
                $row=[ordered]@{timestamp=$at;errorCategory=$category;path=$path}
                foreach ($key in @('httpStatus','businessCode','characters')) {
                    $number=0L
                    if ($shape.PSObject.Properties[$key] -and [long]::TryParse([string]$shape.$key,[ref]$number)) { $row[$key]=$number }
                }
                if ([string]$shape.bodyType -in @('null','object','array','string','boolean','number','empty','non-json')) { $row.bodyType=[string]$shape.bodyType }
                $rows.Add([pscustomobject]$row)
            }
            if ($rows.Count) {
                $records=@($rows.ToArray() | Select-Object -Last 200)
                $modules.runtime.sources.Add([pscustomobject]@{source=$Label+'/'+$file.Name+'/read-failures';evidence=$records})
                $modules.runtime.evidenceCount += $records.Count
            }
            if ($inputText.clipped -or $rows.Count -gt 200) { Issue 'runtime' ($Label+'/'+$file.Name) '仅采集末尾最多 2 MiB 中最近 200 条只读失败元数据；原始日志未导出' }
        } catch { Issue 'runtime' ($Label+'/'+$file.Name) '只读失败元数据采集未完成；不能据此判断读取正常' }
    }
}
function Capture([string]$Module, [string]$Path, [string]$Label, [string]$Format='json') {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) {
        if ($Format -eq 'json' -and !$Path.EndsWith('.bak') -and (Test-Path -LiteralPath ($Path+'.bak'))) {
            Issue $Module $Label '主记录缺失，改读备份；备份可能落后于当前状态'
            Capture $Module ($Path+'.bak') ($Label+' (备份)') 'json'
        }
        return
    }
    $m = $modules[$Module]
    try {
        if ($Format -eq 'json') {
            $inputText = Read-Limited $Path 8MB
            $value = Project (ConvertFrom-Json -InputObject $inputText.text)
            if ($null -eq $value) { Issue $Module $Label '文件没有可识别的诊断字段，不能据此判断正常'; return }
        } else {
            $inputText = Read-Limited $Path 128KB -Tail
            $lines = @($inputText.text -split '\r?\n' | Where-Object { $_.Trim() } | Select-Object -Last 250)
            $value = @(foreach ($line in $lines) {
                if ($Format -eq 'jsonl') {
                    try { $v = Project (ConvertFrom-Json -InputObject $line); if ($null -ne $v) { $v } }
                    catch { Issue $Module $Label '一条结构化日志无法解析，已跳过' }
                } else { Clean-Text $line 1500 }
            })
            if ($inputText.clipped -or ($inputText.text -split '\r?\n').Count -gt 251) { Issue $Module $Label '仅采集日志末尾最多 128 KiB、250 行' }
        }
        $m.sources.Add([pscustomobject]@{source=$Label; lastWriteUtc=(Get-Item -LiteralPath $Path).LastWriteTimeUtc.ToString('o'); evidence=$value})
        $m.evidenceCount += @($value).Count
    } catch {
        Issue $Module $Label '记录无法读取或解析，可能损坏、被占用或超过 8 MiB；未将其视为无故障'
        if ($Format -eq 'json' -and !$Path.EndsWith('.bak') -and (Test-Path -LiteralPath ($Path+'.bak'))) {
            Issue $Module $Label '已尝试读取备份，备份可能落后于当前状态'
            Capture $Module ($Path+'.bak') ($Label+' (备份)') 'json'
        }
    }
}
function Capture-Pattern([string]$Module,[string]$Directory,[string]$Pattern,[string]$Prefix,[string]$Format='json') {
    if (!(Test-Path -LiteralPath $Directory -PathType Container)) { return }
    if ((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { Issue $Module $Prefix '跳过目录链接'; return }
    try {
        $files = @(Get-ChildItem -LiteralPath $Directory -File -Filter $Pattern | Sort-Object LastWriteTimeUtc -Descending)
        if ($files.Count -gt 30) { Issue $Module $Prefix '该类记录仅采集最近 30 个文件' }
        $i=0
        foreach ($file in @($files | Select-Object -First 30)) { $i++; Capture $Module $file.FullName ($Prefix+'/'+$Pattern.Replace('*',[string]$i)) $Format }
    } catch { Issue $Module $Prefix '无法枚举记录文件' }
}
function Record-Directories([string]$Module,[string]$Directory,[string]$Label,[int]$Limit) {
    try {
        if (!(Test-Path -LiteralPath $Directory -PathType Container)) { return }
        if ((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { Issue $Module $Label '跳过目录链接'; return }
        $dirs=@(Get-ChildItem -LiteralPath $Directory -Directory | Where-Object { !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } | Sort-Object LastWriteTimeUtc -Descending)
        if ($dirs.Count -gt $Limit) { Issue $Module $Label ('该类记录仅采集最近 '+$Limit+' 个目录') }
        return @($dirs | Select-Object -First $Limit)
    } catch { Issue $Module $Label '记录目录无法读取，其他模块将继续采集' }
}
$index=0
foreach ($root in $dataRoots) {
    $index++; $tag='data-'+$index
    if($dataBrands.ContainsKey($root)){$tag=$dataBrands[$root]+' / '+$tag}
    $onecut=$null
    if (Test-Path -LiteralPath (Join-Path $root 'one_cut')) {
        try {
            $engine = Join-Path $PSScriptRoot '../one-cut-web/export-task-diagnostics.ps1'
            $onecut = & $engine -DataDirectory $root -AsObject -NoDiscovery
            # Extra scrub for the shared one-cut report; retain its proven merging.
            foreach ($t in $onecut.tasks) { foreach ($p in @($t.PSObject.Properties)) { if ($p.Value -is [string]) { $p.Value=Clean-Text $p.Value } } }
            $modules.onecut.sources.Add([pscustomobject]@{source=$tag; evidence=$onecut})
            $modules.onecut.evidenceCount += $onecut.taskCount + @($onecut.resolutionEvents).Count
            foreach ($issue in $onecut.readIssues) { Issue 'onecut' $tag (Clean-Text $issue.message) }
        } catch { Issue 'onecut' $tag '一刀不剪任务采集未完成，不能据此判断任务正常' }
    }
    # Supplement the older task-summary exporter with only allowlisted receipt
    # fields. Keep snapshot and task-file sources distinct for recovery diagnosis.
    $receiptBatches = Join-Path $root 'one_cut/background/v1/batches'
    if (Test-Path -LiteralPath $receiptBatches -PathType Container) {
        # Directory timestamps do not advance when existing nested task files
        # change. Include unfinished batches from the merged task report.
        $pendingIds=@($onecut.tasks | Where-Object { $_.kind -eq 'background' -and $_.Status -ne 'Succeeded' -and $_.BatchId -match '^[a-fA-F0-9]{32}$' } |
            Sort-Object UpdatedAt -Descending | Select-Object -ExpandProperty BatchId -Unique)
        if ($pendingIds.Count -gt 20) { Issue 'onecut' ($tag+'/upload-receipts') '未完成批次数较多，仅补充最近 20 批详细回执；任务摘要仍保留' }
        $pendingIds=@($pendingIds | Select-Object -First 20)
        $batchDirs=@(Get-ChildItem -LiteralPath $receiptBatches -Directory |
            Where-Object { $_.Name -match '^[a-fA-F0-9]{32}$' -and !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
            Sort-Object LastWriteTimeUtc -Descending)
        $selected=@($batchDirs | Select-Object -First 5)
        $selected+=@($batchDirs | Where-Object { $pendingIds -contains $_.Name })
        foreach ($batch in @($selected | Sort-Object FullName -Unique)) {
            Capture 'onecut' (Join-Path $batch.FullName 'committed-snapshot.json') ($tag+'/upload-receipts/'+$batch.Name+'/snapshot')
            Capture-Pattern 'onecut' (Join-Path $batch.FullName 'tasks') '*.json' ($tag+'/upload-receipts/'+$batch.Name)
        }
    }
    Capture 'onecut' (Join-Path $root 'one_cut/background/v1/account-upload-queues.json') ($tag+'/upload-queues')
    Capture-ReadFailures $root ($tag+'/read-failures')
    Capture 'onecut' (Join-Path $root 'control_console_options_v1.json') ($tag+'/upload-request-options')
    Capture 'onecut' (Join-Path $root 'one_cut/background/v1/session-recovery-events.jsonl') ($tag+'/session-recovery') 'jsonl'
    Capture 'onecut' (Join-Path $root 'one_cut/upload_operations.log') ($tag+'/upload-operations') 'text'
    foreach ($pattern in @('login_plan_flow_*.json','doudian_account_sync_shop*.json','doudian_sync_status*.json','account_sync_schedule_v1.json','qianchuan_packet_sync_shop*.json','qianchuan_overview_request_rejected_shop*.json','qianchuan_overview_response_rejected_shop*.json','qianchuan_upload_status_shop*.json')) { Capture-Pattern 'accounts' $root $pattern $tag }
    foreach ($pattern in @('qianchuan_auto_plan_tasks_v1.json','auto_plan_request_diagnostic_shop*.json','material_upload_receipts_v3.json','material_upload_history_v1.json')) { Capture-Pattern 'plans' $root $pattern $tag }
    Capture 'plans' (Join-Path $root 'auto_plan_read_diagnostics.jsonl') ($tag+'/auto-plan-read') 'jsonl'
    Capture 'roi' (Join-Path $root 'web_target_roi_network_audit.jsonl') ($tag+'/web-target-roi-network') 'jsonl'
    Capture 'plans' (Join-Path $root 'auto_plan_verification.jsonl') ($tag+'/auto-plan-verification') 'jsonl'
    Capture 'plans' (Join-Path $root 'material_upload_runtime.log') ($tag+'/material-upload') 'text'
    Capture 'graphicDownload' (Join-Path $root 'graphic-download/tasks.json') ($tag+'/graphic-download-tasks')
    Capture 'graphicDownload' (Join-Path $root 'graphic-download/upload-receipts.json') ($tag+'/graphic-download-upload')
    Capture 'video' (Join-Path $root 'remix-results.json') ($tag+'/remix-results')
    foreach($part in @('audio-remix','video-batch','video-watermark')) {
        Capture 'video' (Join-Path $root ($part+'/tasks.json')) ($tag+'/'+$part+'/tasks')
        Capture 'video' (Join-Path $root ($part+'/history.json')) ($tag+'/'+$part+'/history')
    }
    Capture-Pattern 'runtime' (Join-Path $root 'logs') 'crash_*.log' ($tag+'/browser-stability') 'text'
    # Only explicitly diagnostic files; never read the selection captures or
    # browser/login stores, which contain platform data and session identifiers.
    Capture-Pattern 'selection' (Join-Path $root 'diagnostics') 'selection-*.json' ($tag+'/selection')
    Capture-Pattern 'roi' (Join-Path $root 'diagnostics') 'roi-*.json' ($tag+'/roi')
    Capture 'license' (Join-Path $root 'diagnostics/license-last-error.json') ($tag+'/license-last-error')

    foreach ($pattern in @('runtime_perf.log','material_perf.log','product_sync_perf.log','qianchuan_sync_perf.log')) { Capture 'runtime' (Join-Path $root $pattern) ($tag+'/'+$pattern) 'text' }
    Capture 'aiImage' (Join-Path $root 'ai_graphic_delivery_perf.log') ($tag+'/ai-graphic-delivery') 'text'
    $projectRoot=Join-Path $root 'ai_graphic_projects'
    $j=0; foreach ($dir in @(Record-Directories 'aiImage' $projectRoot ($tag+'/projects') 30)) { $j++; Capture 'aiImage' (Join-Path $dir.FullName 'project.json') ($tag+'/project-'+$j) }
}
$profiles=@('Chuangbao')
if($installInfo.Count){$profiles+=@($installInfo.Values|ForEach-Object{$_.runtimeName}|Where-Object{$_})}
else{$profiles+=@($knownBrands|ForEach-Object{$_.runtimeName})}
foreach($profileRootName in @($profiles|Select-Object -Unique)) {
    $heixi=Join-Path $LocalAppDataDirectory ($profileRootName+'/Heixi')
    $label=$profileRootName+'/ai-video'
    Capture 'aiVideo' (Join-Path $heixi 'last-api-error.json') ($label+'/last-api-error')
    Capture 'aiVideo' (Join-Path $heixi 'records.json') ($label+'/legacy-records')
    $memberRoot=Join-Path $heixi 'accounts'
    $j=0; foreach ($member in @(Record-Directories 'aiVideo' $memberRoot ($label+'/accounts') 20)) { $j++; Capture 'aiVideo' (Join-Path $member.FullName 'records.json') ($label+'/member-'+$j) }
    $inner=if($profileRootName -eq 'Chuangbao'){'QianchuanAuto'}else{$profileRootName}
    Capture 'updates' (Join-Path $LocalAppDataDirectory ($profileRootName+'/'+$inner+'/Updates/update.log')) ($profileRootName+'/updater/update.log') 'text'
}
function Add-Check([string]$Module, [string]$Source, $Check) {
    $modules[$Module].sources.Add([pscustomobject]@{source=$Source;lastWriteUtc=[DateTime]::UtcNow.ToString('o');evidence=@($Check)})
    $modules[$Module].evidenceCount++
}
function Resource-Check([string]$Module,[string]$Directory,[string]$Relative,[string]$Source) {
    $path=Join-Path $Directory $Relative
    $present=Test-Path -LiteralPath $path -PathType Leaf
    if($present -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)) { $present=$false }
    Add-Check $Module $Source ([pscustomobject]@{checkId='resource-'+$Relative;status=$(if($present){'passed'}else{'failed'});title='页面组件检查';detail=($Relative+$(if($present){'：存在（未验证业务）'}else{'：缺失或为链接'}));advice='缺失时请客服核对完整安装文件，不要自行下载或覆盖脚本。';timestamp=[DateTime]::UtcNow.ToString('o')})
}
function Project-Live($Value) {
    # Separate schema: do not widen business/task projection to arbitrary files,
    # process command lines, memory dumps, credentials or browser contents.
    $leafFields=@('sampledAtUtc','timeUtc','timestamp','pid','ownerPid','startUtc','role','name','brandName','image','cpuMilliseconds','workingSetBytes','privateMemoryBytes','handles','threads',
        'readBytes','writeBytes','readOperations','writeOperations','respondsWithin150ms','elapsedMs','windowsHungFlag','readSucceeded','loadPercent','totalPhysicalBytes','availablePhysicalBytes','commitLimitBytes','availableCommitBytes',
        'logicalProcessors','durationMs','sampleCount','workDirectory','exists','path','bytes','lastWriteUtc','version','sha256','readError',
        'SchemaVersion','JobId','TargetVersion','CurrentVersion','EntryPoint','ParentProcessId','InstallDirectory','StagingDirectory','BackupDirectory','RestartAfterApply','WaitForStartupHealth',
        'Success','RolledBack','PendingReboot','Message','DiagnosticError','CompletedAtUtc','Status','Error','Attempts','Phase','State','OwnerProcessId','ChildProcessId','UpdatedAtUtc','LastError',
        'journalRecordCount','journalExistingCount','count','backupBlobsTruncated')
    $containerFields=@('samples','processes','systemMemory','windowChecks','controller','plan','result','resultFile','failedFiles','transaction','recovery','journal','journalFile','backupBlobs','records')
    return (Project $Value)
}
function Watermark-ComponentChecks([string]$Installation,[string]$Source) {
    # These first five entries are the exact preconditions of
    # VideoWatermarkStudio.Start. Check them separately from optional execution
    # dependencies so the generic message can be traced to its missing input.
    $parts=@(
        @('assets/one-cut-parser/runtime/python.exe','视频处理运行时','file','基础'),
        @('Tools/FFmpeg/ffmpeg.exe','视频处理组件','file','基础'),
        @('Tools/FFmpeg/ffprobe.exe','视频信息探测组件','file','基础'),
        @('assets/video-watermark/worker.py','水印处理脚本','file','基础'),
        @('Tools/Watermark','水印运行组件目录','directory','基础'),
        @('Tools/Watermark/lib/numpy/__init__.py','水印图像计算组件','file','执行'),
        @('Tools/Watermark/lib/cv2/__init__.py','水印图像处理组件','file','执行'),
        @('Tools/Watermark/lib/onnxruntime/__init__.py','AI水印推理组件','file','AI'),
        @('Tools/Watermark/models/lama_fp32.onnx','AI水印模型','file','AI')
    )
    foreach($part in $parts) {
        $path=Join-Path $Installation $part[0]
        $present=Test-Path -LiteralPath $path -PathType $(if($part[2] -eq 'directory'){'Container'}else{'Leaf'})
        $linked=$false
        if($present) {
            for($current=$path;$current;$current=Split-Path -Parent $current) {
                if((Get-Item -LiteralPath $current).Attributes -band [IO.FileAttributes]::ReparsePoint){$linked=$true;break}
            }
        }
        $status=if($linked){'unknown'}elseif($present){'passed'}else{'failed'}
        $detail=$part[1]+'：'+$part[0]+$(if($linked){'（链接路径，未核验）'}elseif($present){'（存在，未验证实际执行）'}else{'（缺失）'})
        Add-Check 'video' ($Source+'/watermark-components') ([pscustomobject]@{
            checkId=('video-watermark-'+$part[0]);status=$status;title=('视频水印'+$part[3]+'组件检查');detail=$detail;
            advice='请客服核对完整安装包和实际启动目录，并结合安装结果确认该文件是否写入或被移除；保留诊断包和安装记录。';timestamp=[DateTime]::UtcNow.ToString('o')
        })
    }
}
$pageChecks=@{
    home='home-web';accounts='qianchuan-account-web';plans='auto-plan-web';onecut='one-cut-web';
    roi='roi-calculator-web';graphicDownload='graphic-download-web';aiVideo='ai-video-web';
    aiImage='ai-graphic-web';selection='selection-center-web'
}
if($NativeSnapshotPath) {
    try {
        $snapshot=$nativeSnapshot
        if($snapshot.kind -ne 'software-native-checks'){throw 'Unrecognized native snapshot'}
        foreach($check in @($snapshot.checks | Select-Object -First 80)) {
            $module=[string]$check.module
            if(!$modules.Contains($module) -or $check.status -notin @('passed','failed','pending','unknown')){throw 'Invalid diagnostic check'}
            $safe=[ordered]@{}
            foreach($field in @('checkId','status','title','detail','advice','timestamp')) { $safe[$field]=Clean-Text $check.$field 1800 }
            Add-Check $module 'native-running-program' ([pscustomobject]$safe)
        }
        foreach($source in @($snapshot.sources | Select-Object -First 40)) {
            $module=[string]$source.module
            if($module -notin @('performance','installation')){continue}
            $evidence=Project-Live $source.evidence
            if($null -eq $evidence){continue}
            $modules[$module].sources.Add([pscustomobject]@{source=(Clean-Text $source.source 180);lastWriteUtc=(Clean-Text $source.lastWriteUtc 60);evidence=$evidence})
            $modules[$module].evidenceCount++
        }
        foreach($problem in @($snapshot.issues | Select-Object -First 64)) {
            $module=[string]$problem.module
            if($module -in @('performance','installation')){Issue $module (Clean-Text $problem.source 120) (Clean-Text $problem.message 500)}
        }
    } catch { Issue 'runtime' 'native-running-program' '原生现场检查未完整采集，不能据此判断功能正常' }
}
$applications=New-Object 'System.Collections.Generic.List[object]'
$required=@('QianchuanAuto.exe','ChuangbaoUpdater.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','Tools/FFmpeg/ffmpeg.exe','Tools/FFmpeg/ffprobe.exe','assets/one-cut-parser/runtime/python.exe','assets/one-cut-parser/runtime/python313.dll','assets/one-cut-parser/runtime/python313.zip','assets/one-cut-parser/project/software_bridge.py','assets/one-cut-parser/project/public_video_resolver.py','assets/one-cut-parser/project/OneCutPublicBrowserProbe.exe','assets/one-cut-web/app.js','assets/release/build.json')
$index=0
foreach ($installation in $installs) {
    $index++; $tag='installation-'+$index
    $identity=$installInfo[$installation]
    $exe=Join-Path $installation $identity.entryPoint
    try {
        $version=if(Test-Path -LiteralPath $exe -PathType Leaf){[Diagnostics.FileVersionInfo]::GetVersionInfo($exe)}else{[pscustomobject]@{FileVersion='';ProductVersion=''}}
        $brandRequired=@($required|Where-Object{$_ -notin @('QianchuanAuto.exe','ChuangbaoUpdater.exe')})+@($identity.entryPoint)
        if($identity.updater){$brandRequired+=@($identity.updater)}
        $components=@(foreach ($relative in $brandRequired) { [pscustomobject]@{component=$relative; present=(Test-Path -LiteralPath (Join-Path $installation $relative) -PathType Leaf)} })
        $app=[ordered]@{source=$tag; brandName=$identity.brand; entryPoint=$identity.entryPoint; identityStatus='managed-entry'; fileVersion=$version.FileVersion; productVersion=$version.ProductVersion; exeSha256=''; components=$components; manifestComparison='unavailable'}
        try {$app.exeSha256=File-Sha256 $exe} catch {Issue 'runtime' $tag '无法读取程序校验值，已保留可读取的版本和组件信息'}
        $manifest=Join-Path $installation 'release-manifest.json'
        if (Test-Path -LiteralPath $manifest) {
            try {
                $m=(Read-Limited $manifest 8MB).text | ConvertFrom-Json
                $entry=@($m.files | Where-Object { $_.path -eq $identity.entryPoint } | Select-Object -First 1)
                if ($entry.Count -and $entry[0].sha256 -and $app.exeSha256) { $app.manifestComparison=if($entry[0].sha256 -eq $app.exeSha256){'matches'}else{'differs'} }
            } catch { Issue 'runtime' $tag '版本清单无法解析' }
        }
        $applications.Add([pscustomobject]$app)
    } catch { Issue 'runtime' $tag ('部分版本信息或组件检查无法读取：'+(Clean-Text $_.Exception.Message 500)) }
    Capture 'runtime' (Join-Path $installation 'startup_performance.log') ($tag+'/startup') 'text'
    foreach($module in $pageChecks.Keys) {
        foreach($file in @('index.html','app.js','styles.css')) {
            # Most pages use style.css rather than styles.css. Either stylesheet
            # is acceptable; don't report an invented optional filename missing.
            if($file -eq 'styles.css') { continue }
            Resource-Check $module $installation ('assets/'+$pageChecks[$module]+'/'+$file) $tag
        }
    }
    foreach($page in @('audio-remix-web','video-batch-web','video-watermark-web')) {
        foreach($file in @('index.html','app.js')) {Resource-Check 'video' $installation ('assets/'+$page+'/'+$file) $tag}
    }
    Watermark-ComponentChecks $installation $tag
    foreach($file in @('product-insight.js','product-insight-filters.js','compass-mapping.js')) {
        Resource-Check 'selection' $installation ('assets/selection-center/'+$file) $tag
    }
    Resource-Check 'tutorials' $installation 'assets/tutorials/player.html' $tag
    Resource-Check 'support' $installation 'assets/customer-support/page.html' $tag
    foreach($marker in @('.chuangbao-update-recovery.json','.chuangbao-update-transaction.json','.chuangbao-update-old-files.json')) {
        $markerPath=Join-Path $installation $marker
        if(Test-Path -LiteralPath $markerPath -PathType Leaf) {
            Add-Check 'updates' $tag ([pscustomobject]@{checkId='update-marker';status='unknown';title='发现更新事务或恢复记录';detail=$marker;advice='这可能是待重启、失败恢复或待清理记录，需核对更新日志；不要删除标记。';timestamp=[DateTime]::UtcNow.ToString('o')})
            Capture 'updates' $markerPath ($tag+'/'+$marker)
        }
    }

    Capture 'video' (Join-Path $installation 'qa-audio-remix-viewport.txt') ($tag+'/remix-viewport') 'text'
}
if ($SkipSystemEvents) { Issue 'crashes' 'windows-application-events' '本次未采集 Windows 崩溃事件' }
else {
    try {
        $events=@(Get-WinEvent -FilterHashtable @{LogName='Application'; Id=@(1000,1001,1026); StartTime=(Get-Date).AddDays(-7)} -MaxEvents 300 -ErrorAction Stop)
        $crashNames=@('QianchuanAuto')+@($knownBrands|ForEach-Object{[IO.Path]::GetFileNameWithoutExtension($_.entryPoint);$_.runtimeName})+@($installInfo.Values|ForEach-Object{[IO.Path]::GetFileNameWithoutExtension($_.entryPoint);$_.runtimeName})
        $crashPattern='(?i)(?:^|[\s\\/:"''])('+((@($crashNames|Where-Object{$_}|Select-Object -Unique|ForEach-Object{[regex]::Escape($_)})) -join '|')+')(?:-v[0-9.]+)?\.exe\b'
        $crashes=@(foreach ($event in $events) {
            if ($event.Message -match $crashPattern) {
                [pscustomobject]@{eventId=$event.Id; time=$event.TimeCreated.ToUniversalTime().ToString('o'); provider=$event.ProviderName; message=Clean-Text $event.Message 6000}
            }
        })
        $modules.crashes.sources.Add([pscustomobject]@{source='windows-application-events'; evidence=$crashes})
        $modules.crashes.evidenceCount=$crashes.Count
        if ($events.Count -eq 300) { Issue 'crashes' 'windows-application-events' '仅检查近 7 天最新 300 条相关类型系统事件' }
    } catch {
        if ($_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*') { Issue 'crashes' 'windows-application-events' '无法读取 Windows 崩溃事件，可能没有权限或事件日志不可用' }
    }
}
$environmentInfo=[ordered]@{osVersion=[Environment]::OSVersion.VersionString; is64BitOS=[Environment]::Is64BitOperatingSystem; powershellVersion=$PSVersionTable.PSVersion.ToString(); runningSoftwareCount=$running.Count; discoveryEnabled=(!$NoDiscovery); systemEventsEnabled=(!$SkipSystemEvents)}
try {
    $volumes=@(@(foreach($root in @($installs.ToArray())+@($dataRoots.ToArray())) { [IO.Path]::GetPathRoot($root) }) | Select-Object -Unique)
    $environmentInfo.storage=@(foreach($volume in $volumes) { $drive=New-Object IO.DriveInfo($volume); if($drive.IsReady){[pscustomobject]@{drive=$drive.Name; freeBytes=$drive.AvailableFreeSpace; totalBytes=$drive.TotalSize}} })
} catch { Issue 'runtime' 'disk-space' '未能读取磁盘可用空间' }
foreach ($key in $modules.Keys) {
    $m=$modules[$key]; $issues=@($problems | Where-Object { $_.module -eq $key })
    $m.status=if($m.evidenceCount -gt 0){if($issues.Count){'partial'}else{'collected'}}else{if($issues.Count){'unavailable'}else{'no_records'}}
    $m.sources=@($m.sources.ToArray())
}
$report=[ordered]@{schemaVersion=1; collectorVersion='3.1.1'; kind='software-unified-diagnostics'; exportedAtUtc=[DateTime]::UtcNow.ToString('o'); environment=$environmentInfo; applications=@($applications.ToArray()); modules=$modules; collectionIssues=@($problems.ToArray()); limitations=@('本报告只说明采集到的本软件本地证据；没有记录不等于没有故障。','任务显示成功不代表千川已验收；需结合平台素材编号和实际账户继续核对。','AI 视频的服务端原因和扣费结果可能需要凭 taskNo/traceId 查询，工具不会触发生成、上传或扣费。','内置入口仅记录固定的原生加载与组件状态；不抓取输入内容、浏览器会话、视频文件或网络数据。','页面文件存在和组件校验通过不等于平台业务成功；会员登录需实际鉴权证据。')}
$labels=@{collected='已采集'; partial='部分采集（见采集说明）'; no_records='未找到记录，不能判断是否正常'; unavailable='未能完整采集（见采集说明）'}
$summary=New-Object 'System.Collections.Generic.List[string]'
$summary.Add('本软件统一诊断报告')
$summary.Add('导出时间：'+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$summary.Add('请将整个 ZIP 发给客服；工具不会自动上传，不会修改软件或重试业务任务。')
$summary.Add('')
foreach($key in $modules.Keys){$m=$modules[$key];$summary.Add($m.name+'：'+$labels[$m.status]+'；证据项 '+$m.evidenceCount)}
$summary.Add('');$summary.Add('采集说明：')
foreach($problem in $problems){$summary.Add('- '+$modules[$problem.module].name+' / '+$problem.source+'：'+$problem.message)}
foreach($limitation in $report.limitations){$summary.Add('- '+$limitation)}
if(!$OutputDirectory){$OutputDirectory=[Environment]::GetFolderPath('Desktop')}
if(!$OutputDirectory){throw '没有可用的输出目录'}
[void][IO.Directory]::CreateDirectory($OutputDirectory)
$output=Join-Path $OutputDirectory ('软件统一诊断-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6)+'.zip')
Add-Type -AssemblyName System.IO.Compression
$file=[IO.File]::Open($output,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
    $zip=New-Object IO.Compression.ZipArchive($file,[IO.Compression.ZipArchiveMode]::Create,$true)
    try {
        foreach($entry in @(@('先看这里.txt',($summary -join "`r`n")),@('诊断报告.json',($report | ConvertTo-Json -Depth 35)))) {
            $item=$zip.CreateEntry($entry[0],[IO.Compression.CompressionLevel]::Optimal)
            $stream=$item.Open()
            try { $bytes=[Text.UTF8Encoding]::new($true).GetPreamble()+[Text.Encoding]::UTF8.GetBytes($entry[1]);$stream.Write($bytes,0,$bytes.Length) } finally {$stream.Dispose()}
        }
    } finally {$zip.Dispose()}
} finally {$file.Dispose()}
Write-Output $output
