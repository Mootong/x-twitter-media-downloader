$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.manifest_version -ne 3) {
    throw "manifest_version must be 3"
}
if (-not $manifest.version) {
    throw "manifest.json is missing version"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js was not found"
}

$javascriptFiles = @(
    "background.js",
    "content.js",
    "interceptor.js",
    "popup.js",
    "review.js"
)
foreach ($file in $javascriptFiles) {
    & $node.Source --check (Join-Path $projectRoot $file)
    if ($LASTEXITCODE -ne 0) {
        throw "JavaScript validation failed: $file"
    }
}

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    & $python.Source -m py_compile (Join-Path $projectRoot "helper/media_helper.py")
    if ($LASTEXITCODE -ne 0) {
        throw "Python validation failed"
    }
}

Write-Host "Validation passed: manifest, JavaScript, and helper structure are valid."
