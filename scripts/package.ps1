$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "manifest.json") | ConvertFrom-Json
$dist = Join-Path $projectRoot "dist"
$stage = Join-Path $dist "extension"
$zip = Join-Path $dist "x-twitter-media-downloader-v$($manifest.version).zip"

& (Join-Path $PSScriptRoot "validate.ps1")

if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$releaseFiles = @(
    "manifest.json",
    "background.js",
    "content.js",
    "interceptor.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "review.html",
    "review.css",
    "review.js",
    "i18n.js",
    "icons",
    "_locales"
)
foreach ($file in $releaseFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stage -Recurse -Force
}
Remove-Item -LiteralPath (Join-Path $stage "icons/icon.svg") -Force -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
}
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
Write-Host "Release package: $zip"
