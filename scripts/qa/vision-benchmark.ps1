param(
    [Parameter(Mandatory = $true)]
    [string] $VideoPath,
    [string] $ImagePath,
    [double] $SampleFps = 10.0,
    [int] $ImageSize = 640,
    [double] $Confidence = 0.10
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$video = (Resolve-Path -LiteralPath $VideoPath).Path
$python = Join-Path $repoRoot 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        Write-Error 'Python was not found. Create backend/.venv and install backend/requirements.txt.'
        exit 2
    }
    $python = $pythonCommand.Source
}

$arguments = @(
    (Join-Path $repoRoot 'tests\vision\benchmark.py'),
    '--video', $video,
    '--sample-fps', [string]::Format([Globalization.CultureInfo]::InvariantCulture, '{0}', $SampleFps),
    '--image-size', [string]$ImageSize,
    '--confidence', [string]::Format([Globalization.CultureInfo]::InvariantCulture, '{0}', $Confidence)
)
if ($ImagePath) {
    $image = (Resolve-Path -LiteralPath $ImagePath).Path
    $arguments += @('--image', $image)
}

$previousPythonPath = $env:PYTHONPATH
$env:PYTHONPATH = "$repoRoot;$repoRoot\backend"
try {
    & $python @arguments
    exit $LASTEXITCODE
}
finally {
    $env:PYTHONPATH = $previousPythonPath
}
