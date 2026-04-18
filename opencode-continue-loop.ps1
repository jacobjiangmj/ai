$ErrorActionPreference = 'Stop'

$sessionId = 'ses_261b7e17effeStRVl9ZzebeJO5'
$message = '继续'
$intervalSeconds = 10
$endTime = (Get-Date).AddHours(24)
$logPath = Join-Path $PSScriptRoot 'opencode-continue-loop.log'

Add-Content -Path $logPath -Value ("{0} started pid={1} interval={2}s end={3}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $PID, $intervalSeconds, ($endTime.ToString('yyyy-MM-dd HH:mm:ss')))

while ((Get-Date) -lt $endTime) {
    try {
        Add-Content -Path $logPath -Value ("{0} sending" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
        & opencode run -s $sessionId $message | Out-Null
        Add-Content -Path $logPath -Value ("{0} sent" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    }
    catch {
        $errorDetail = ($_ | Out-String).Trim()
        Add-Content -Path $logPath -Value ("{0} failed: {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $errorDetail)
    }
    if ((Get-Date) -lt $endTime) {
        Start-Sleep -Seconds $intervalSeconds
    }
}

Add-Content -Path $logPath -Value ("{0} finished pid={1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $PID)
