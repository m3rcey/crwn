# Installs the CRWN Studio Bridge panel for Premiere Pro (founder-approved option A, 2026-09-23).
# 1. PlayerDebugMode=1 under CSXS.11 so Premiere 2024 (CEP 11) loads an unsigned local panel.
# 2. Copies the panel into the user's CEP extensions folder (a copy, re-run after edits).
# Then restart Premiere and open Window > Extensions > CRWN Studio Bridge once; Premiere keeps it
# in the workspace after that.
$ErrorActionPreference = "Stop"
$key = "HKCU:\Software\Adobe\CSXS.11"
if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
Set-ItemProperty -Path $key -Name PlayerDebugMode -Value "1" -Type String

$src = Join-Path $PSScriptRoot "com.crwn.studio.bridge"
$dest = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.crwn.studio.bridge"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
Copy-Item -Recurse -Path $src -Destination $dest

"PlayerDebugMode: " + (Get-ItemProperty $key).PlayerDebugMode
"Installed to:    $dest"
Get-ChildItem -Recurse $dest | ForEach-Object { "  " + $_.FullName.Substring($dest.Length) }
