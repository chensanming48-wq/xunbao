param(
    [string]$InstallDirectory=$PSScriptRoot,
    [string]$DataDirectory,
    [string]$OutputDirectory,
    [string]$LocalAppDataDirectory=[Environment]::GetFolderPath('LocalApplicationData'),
    [switch]$NoDiscovery,
    [switch]$SkipSystemEvents
)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'assets/diagnostics/export-unified-diagnostics.ps1') -InstallDirectory $InstallDirectory -DataDirectory $DataDirectory -OutputDirectory $OutputDirectory -LocalAppDataDirectory $LocalAppDataDirectory -NoDiscovery:$NoDiscovery -SkipSystemEvents:$SkipSystemEvents