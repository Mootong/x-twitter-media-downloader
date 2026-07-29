param(
    [ValidateSet("patch", "minor", "major")]
    [string]$Level = "patch"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$packagePath = Join-Path $projectRoot "package.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$parts = @($manifest.version.Split(".") | ForEach-Object { [int]$_ })

switch ($Level) {
    "major" { $parts = @($parts[0] + 1, 0, 0) }
    "minor" { $parts = @($parts[0], $parts[1] + 1, 0) }
    "patch" { $parts = @($parts[0], $parts[1], $parts[2] + 1) }
}
$version = $parts -join "."

$manifest.version = $version
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestPath -Encoding utf8
$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
$package.version = $version
$package | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $packagePath -Encoding utf8

Write-Host "Version updated to $version. Update CHANGELOG.md before committing."
