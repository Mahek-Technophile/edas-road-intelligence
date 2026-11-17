$ErrorActionPreference = 'Stop'

if ($env:EDAS_TEST_ENV -ne 'disposable') {
    Write-Error 'BLOCKED: Refusing to run. Set EDAS_TEST_ENV=disposable and target an isolated test deployment.'
    exit 2
}

$required = @(
    'EDAS_API_BASE_URL',
    'EDAS_TEST_USER_TOKEN',
    'EDAS_TEST_ADMIN_TOKEN',
    'EDAS_TEST_VEHICLE_A_TOKEN',
    'EDAS_TEST_VEHICLE_B_TOKEN',
    'EDAS_TEST_VEHICLE_C_TOKEN',
    'EDAS_TEST_VEHICLE_D_TOKEN'
)
foreach ($name in $required) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        Write-Error "BLOCKED: Missing required environment variable: $name"
        exit 2
    }
}

$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command python -ErrorAction SilentlyContinue
}
if (-not $python) {
    Write-Error 'BLOCKED: Python is not installed or not on PATH. Install Python and pytest in the QA environment.'
    exit 2
}

& $python.Source -m pytest -q tests/contract tests/e2e
exit $LASTEXITCODE
