# Regenerates the diagrams (docs/images/diagrams/*.mmd -> .svg) and docs/dossier-technique.pdf.
# Requirements: Node.js 20.19 or later. Everything else is installed locally in docs/pdf/node_modules
# by "npm ci" (exact versions of docs/pdf/package-lock.json), Chrome for Testing included.
# Usage, from any folder:  powershell -ExecutionPolicy Bypass -File docs\build-pdf.ps1
$ErrorActionPreference = 'Stop'
$pdfDir = Join-Path $PSScriptRoot 'pdf'
$diagramDir = Join-Path $PSScriptRoot 'images\diagrams'

Push-Location $pdfDir
try {
  # 1. Tools, at the versions of the lockfile (skipped when already installed)
  if (-not (Test-Path 'node_modules\.bin\mmdc.cmd')) {
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  }

  # 2. Diagrams: one SVG per Mermaid source
  foreach ($source in Get-ChildItem (Join-Path $diagramDir '*.mmd')) {
    $svg = [IO.Path]::ChangeExtension($source.FullName, '.svg')
    & .\node_modules\.bin\mmdc.cmd -i $source.FullName -o $svg -c mermaid-config.json -b white -q
    if ($LASTEXITCODE -ne 0) { throw "mmdc failed on $($source.Name)" }
    Write-Host "diagram: $($source.Name) -> $(Split-Path $svg -Leaf)"
  }

  # 3. PDF
  node build.mjs
  if ($LASTEXITCODE -ne 0) { throw 'PDF build failed' }
}
finally {
  Pop-Location
}
