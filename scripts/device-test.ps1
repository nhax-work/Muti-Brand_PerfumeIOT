param(
  [string]$Port,
  [switch]$List
)

$ErrorActionPreference = 'Stop'
$ports = @([System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object)
if ($List) {
  if ($ports.Count -eq 0) { Write-Host 'Khong tim thay cong COM.' }
  else { $ports | ForEach-Object { Write-Output $_ } }
  return
}
if (-not $Port) {
  if ($ports.Count -ne 1) {
    throw "Hay chon cong: npm run device:test -- -Port COM5. Cong hien co: $($ports -join ', ')"
  }
  $Port = $ports[0]
}
if ($Port -notmatch '^COM[0-9]+$') { throw 'Cong phai co dang COM5.' }
if ([Console]::IsInputRedirected) { throw 'Can chay trong terminal tuong tac.' }

$serial = New-Object System.IO.Ports.SerialPort $Port, 115200, None, 8, One
$serial.DtrEnable = $false
$serial.RtsEnable = $false
$serial.NewLine = "`n"
$serial.WriteTimeout = 1000
$line = ''
try {
  $serial.Open()
  Write-Host "Da mo $Port, 115200 baud. Dong Serial Monitor Arduino neu cong dang ban."
  Write-Host 'Lenh: TEST ON | SET 1 500 | PRIME 1 10000 | SHOW | STOP | TEST OFF'
  Write-Host 'PRIME chay ngay. Mo van tuong ung truoc khi moi. EXIT hoac Esc de thoat.'
  Write-Host 'Mot so board reset khi mo COM: cho thong bao khoi dong roi gui TEST ON.'
  while ($true) {
    $received = $serial.ReadExisting()
    if ($received) { [Console]::Write($received) }
    if ([Console]::KeyAvailable) {
      $key = [Console]::ReadKey($true)
      if ($key.Key -eq [ConsoleKey]::Escape) { break }
      if ($key.Key -eq [ConsoleKey]::Enter) {
        [Console]::WriteLine()
        $command = $line.Trim().ToUpperInvariant()
        $line = ''
        if ($command -eq 'EXIT') { break }
        if ($command -match '^(TEST (ON|OFF)|SHOW|STOP|SET [1-5] [0-9]{1,4}|PRIME [1-5] [0-9]{1,5})$') {
          $serial.WriteLine($command)
        } elseif ($command) {
          Write-Host 'Lenh khong hop le. Vi du: TEST ON, PRIME 1 10000, STOP, EXIT.'
        }
      } elseif ($key.Key -eq [ConsoleKey]::Backspace) {
        if ($line.Length -gt 0) {
          $line = $line.Substring(0, $line.Length - 1)
          [Console]::Write("`b `b")
        }
      } elseif (-not [char]::IsControl($key.KeyChar) -and $line.Length -lt 63) {
        $line += $key.KeyChar
        [Console]::Write($key.KeyChar)
      }
    }
    Start-Sleep -Milliseconds 20
  }
} finally {
  if ($serial.IsOpen) {
    try {
      # Best effort only: firmware/hardware timeout remains necessary on USB loss.
      $serial.WriteLine('STOP')
      $serial.WriteLine('TEST OFF')
    } catch { Write-Warning 'Khong gui duoc STOP; kiem tra bom tai thiet bi.' }
    $serial.Close()
  }
  $serial.Dispose()
}
