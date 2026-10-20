$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $repoRoot 'dist'
$archivePath = Join-Path $outputDirectory 'audio-tagger.zip'

# Explicit runtime allowlist: never zip the repository root or node_modules.
$entries = @('module.json', 'scripts', 'styles', 'lang', 'packs', 'LICENSE', 'README.md')
$paths = @($entries | ForEach-Object {
    $entryPath = Join-Path $repoRoot $_
    if (-not (Test-Path -LiteralPath $entryPath)) { throw "Missing release entry: $_" }
    $entryPath
})
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'module.json') -Raw | ConvertFrom-Json
if ($manifest.id -ne 'audio-tagger' -or -not $manifest.version) {
    throw 'Invalid module manifest.'
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Compress-Archive -LiteralPath $paths -DestinationPath $archivePath -CompressionLevel Optimal -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'module.json') -Destination (Join-Path $outputDirectory 'module.json') -Force
Write-Output "Built Audio Tagger $($manifest.version): $archivePath"
Write-Output 'Attach dist/audio-tagger.zip and dist/module.json to the GitHub release.'
