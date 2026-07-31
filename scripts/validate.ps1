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
if (-not $manifest.icons."128") {
    throw "manifest.json is missing a 128px icon"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js was not found"
}

$javascriptFiles = @(
    "background.js",
    "content.js",
    "i18n.js",
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

$locales = @("en", "zh_CN", "ja", "ko", "es")
$defaultMessages = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "_locales/en/messages.json") | ConvertFrom-Json
foreach ($locale in $locales) {
    $messages = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "_locales/$locale/messages.json") | ConvertFrom-Json
    if (-not $messages.extensionName.message -or -not $messages.extensionDescription.message) {
        throw "Locale $locale is missing manifest messages"
    }
    if ($messages.PSObject.Properties.Name.Count -ne $defaultMessages.PSObject.Properties.Name.Count) {
        throw "Locale $locale message keys do not match the default locale"
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
