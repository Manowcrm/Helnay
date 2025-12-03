# Windows Task Scheduler Setup Script for Database Backups
# Run this script as Administrator to set up automated daily backups

$taskName = "Helnay-Database-Backup"
$scriptPath = Join-Path $PSScriptRoot "backup-script.js"
$nodeExe = (Get-Command node).Source
$logPath = Join-Path $PSScriptRoot "data\backups\backup.log"

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "⚠️  Task '$taskName' already exists. Removing..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create the action (run node backup-script.js)
$action = New-ScheduledTaskAction `
    -Execute $nodeExe `
    -Argument "`"$scriptPath`"" `
    -WorkingDirectory $PSScriptRoot

# Create the trigger (daily at 3 AM)
$trigger = New-ScheduledTaskTrigger -Daily -At "3:00AM"

# Create the settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false

# Create the principal (run as current user)
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U `
    -RunLevel Highest

# Register the task
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Automated daily backup of Helnay Rentals database at 3:00 AM"

Write-Host ""
Write-Host "✅ Task '$taskName' created successfully!" -ForegroundColor Green
Write-Host "📅 Schedule: Daily at 3:00 AM" -ForegroundColor Cyan
Write-Host "📂 Backups location: $PSScriptRoot\data\backups" -ForegroundColor Cyan
Write-Host "🔄 Backup retention: 30 days" -ForegroundColor Cyan
Write-Host ""
Write-Host "To test the backup now, run:" -ForegroundColor Yellow
Write-Host "  node backup-script.js" -ForegroundColor White
Write-Host ""
Write-Host "To view the task:" -ForegroundColor Yellow
Write-Host "  Get-ScheduledTask -TaskName '$taskName'" -ForegroundColor White
Write-Host ""
Write-Host "To disable the task:" -ForegroundColor Yellow
Write-Host "  Disable-ScheduledTask -TaskName '$taskName'" -ForegroundColor White
Write-Host ""
Write-Host "To remove the task:" -ForegroundColor Yellow
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false" -ForegroundColor White
Write-Host ""
