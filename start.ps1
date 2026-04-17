$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$python = 'py'
$pythonArgs = @('-3')
$nodeDir = 'C:\Program Files\nodejs'
$node = Join-Path $nodeDir 'node.exe'
$npm = Join-Path $nodeDir 'npm.cmd'
$backendPort = 18001
$frontendPort = 5173
$backendUrl = "http://127.0.0.1:$backendPort"
$frontendUrl = "http://127.0.0.1:$frontendPort"
$gitlabToken = $env:GITLAB_PRIVATE_TOKEN

if ([string]::IsNullOrWhiteSpace($gitlabToken)) {
    $gitlabToken = [Environment]::GetEnvironmentVariable('GITLAB_PRIVATE_TOKEN', 'User')
}

if ([string]::IsNullOrWhiteSpace($gitlabToken)) {
    $gitlabToken = [Environment]::GetEnvironmentVariable('GITLAB_PRIVATE_TOKEN', 'Machine')
}

function Test-HttpOk {
    param([string]$Url)

    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Stop-PortProcess {
    param([int]$Port)

    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($processId in $connections) {
        if ($processId) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpOk -Url $Url) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }

    return $false
}

function Wait-ForPort {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
        if ($listener) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }

    return $false
}

if (-not (Test-Path $node)) {
    throw "Node.js not found: $node"
}

if (-not (Test-Path $npm)) {
    throw "npm not found: $npm"
}

$env:Path = "$nodeDir;$env:Path"

if ([string]::IsNullOrWhiteSpace($gitlabToken)) {
    throw 'GITLAB_PRIVATE_TOKEN is not set.'
}

$env:GITLAB_PRIVATE_TOKEN = $gitlabToken

Write-Host 'Installing backend dependencies...'
& $python @pythonArgs -m pip install -r (Join-Path $backendDir 'requirements.txt')

Write-Host 'Installing frontend dependencies...'
Push-Location $frontendDir
try {
    & $npm install
}
finally {
    Pop-Location
}

Write-Host 'Applying database migrations...'
& $python @pythonArgs (Join-Path $backendDir 'manage.py') migrate

Stop-PortProcess -Port $backendPort
Stop-PortProcess -Port $frontendPort

$backendLog = Join-Path $backendDir 'runserver.log'
$backendErrLog = Join-Path $backendDir 'runserver.err.log'
$frontendLog = Join-Path $frontendDir 'vite.log'
$frontendErrLog = Join-Path $frontendDir 'vite.err.log'

Remove-Item $backendLog, $backendErrLog, $frontendLog, $frontendErrLog -ErrorAction SilentlyContinue

Write-Host "Starting backend on $backendUrl ..."
$backendProcess = Start-Process -FilePath $python `
    -ArgumentList @('-3', 'manage.py', 'runserver', "127.0.0.1:$backendPort", '--noreload') `
    -WorkingDirectory $backendDir `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError $backendErrLog `
    -PassThru

if (-not (Wait-ForHttp -Url "$backendUrl/api/gitlab/filters/")) {
    throw "Backend failed to start. See $backendErrLog"
}

Write-Host "Starting frontend on $frontendUrl ..."
$frontendCommand = "set VITE_BACKEND_BASE_URL=$backendUrl&& `"$npm`" run dev -- --host 127.0.0.1 --port $frontendPort"
$frontendProcess = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', $frontendCommand) `
    -WorkingDirectory $frontendDir `
    -RedirectStandardOutput $frontendLog `
    -RedirectStandardError $frontendErrLog `
    -PassThru

if (-not (Wait-ForPort -Port $frontendPort)) {
    throw "Frontend failed to start. See $frontendErrLog"
}

Start-Process $frontendUrl | Out-Null

Write-Host ''
Write-Host "Backend PID: $($backendProcess.Id)"
Write-Host "Frontend PID: $($frontendProcess.Id)"
Write-Host "Backend URL: $backendUrl"
Write-Host "Frontend URL: $frontendUrl"
