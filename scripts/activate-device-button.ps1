param(
  [string]$MachineSerial = "M001",
  [int]$SlotNumber = 1,
  [double]$DosageMl = 0.12,
  [int]$ExpiresInSeconds = 300
)

$ErrorActionPreference = "Stop"

if ($MachineSerial -notmatch '^[A-Za-z0-9-]+$') {
  throw "MachineSerial may only contain letters, numbers, and hyphens."
}

if ($SlotNumber -lt 1) {
  throw "SlotNumber must be greater than zero."
}

if ($ExpiresInSeconds -lt 1) {
  throw "ExpiresInSeconds must be greater than zero."
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  throw "docker was not found. Start Docker Desktop and open a new PowerShell terminal."
}

$now = [DateTimeOffset]::UtcNow
$commandToken = "cmd-dev-$([Guid]::NewGuid().ToString('N'))"
$topic = "scentstation/$MachineSerial/command"

$payload = [ordered]@{
  schema_version = 1
  machine_serial = $MachineSerial
  ts = $now.ToString("yyyy-MM-ddTHH:mm:ssZ")
  command_token = $commandToken
  command_type = "DISPENSE"
  dispense_type = "DIAGNOSTIC"
  slot_number = $SlotNumber
  dosage_ml = $DosageMl
  expires_at = $now.AddSeconds($ExpiresInSeconds).ToString("yyyy-MM-ddTHH:mm:ssZ")
  signature = "DEV_ONLY"
} | ConvertTo-Json -Compress

# Base64 avoids PowerShell 5.1 changing JSON quoting/encoding when invoking native commands.
$payloadBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
$publishCommand =
  "printf '%s' '$payloadBase64' | base64 -d | mosquitto_pub -t '$topic' -q 1 -s"

& $docker.Source exec scent-mqtt sh -c $publishCommand
if ($LASTEXITCODE -ne 0) {
  throw "Failed to publish the DISPENSE command. Is scent-mqtt running?"
}

Write-Host "Button activation command published."
Write-Host "Machine : $MachineSerial"
Write-Host "Slot    : $SlotNumber"
Write-Host "Token   : $commandToken"
Write-Host "Expires : $($now.AddSeconds($ExpiresInSeconds).ToString('o'))"
