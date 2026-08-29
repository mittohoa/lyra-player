# Theo doi nhac dang phat tren TOAN MAY qua System Media Transport Controls cua Windows.
# In ra stdout moi lan mot dong JSON; main process cua Lyra doc lien tuc.
#
# Vi sao phai la PowerShell: SMTC la API WinRT, Electron khong goi thang duoc.
# Cach nay khong can bien dich native module nao ca - moi may Windows 10/11 deu chay duoc.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File smtc-watch.ps1 [-IntervalMs 500]
param([int]$IntervalMs = 500)

$ErrorActionPreference = 'Stop'
# Ten bai tieng Viet co dau - phai ep UTF-8 khong thi ra dau hoi
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Event($obj) {
  Write-Output ($obj | ConvertTo-Json -Compress)
  [Console]::Out.Flush()
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

  function Await($op, $type) {
    $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
  }

  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
  $mgrType  = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $mgr = Await ($mgrType::RequestAsync()) $mgrType
} catch {
  Write-Event @{ type = 'error'; message = $_.Exception.Message }
  exit 1
}

Write-Event @{ type = 'ready' }

# Chi doc lai ten bai / nghe si khi thay doi - TryGetMediaPropertiesAsync nang hon
# nhieu so voi doc vi tri, ma ten bai thi hiem khi doi.
$lastKey = ''
$cachedTitle = ''
$cachedArtist = ''
$cachedAlbum = ''

while ($true) {
  try {
    $session = $mgr.GetCurrentSession()

    if ($null -eq $session) {
      if ($lastKey -ne 'none') {
        $lastKey = 'none'
        Write-Event @{ type = 'none' }
      }
    } else {
      $appId    = $session.SourceAppUserModelId
      $playback = $session.GetPlaybackInfo()
      $timeline = $session.GetTimelineProperties()
      $status   = [string]$playback.PlaybackStatus

      # Khoa nhan dang phien: doi app hoac doi do dai bai thi coi nhu doi bai
      $key = $appId + '|' + $timeline.EndTime.TotalSeconds
      if ($key -ne $lastKey) {
        $props = Await ($session.TryGetMediaPropertiesAsync()) $propType
        $cachedTitle  = $props.Title
        $cachedArtist = $props.Artist
        $cachedAlbum  = $props.AlbumTitle
        $lastKey = $key
      }

      # QUAN TRONG: Position la anh chup tai LastUpdatedTime, no KHONG tu chay.
      # Gui kem moc thoi gian de ben kia ngoai suy ra vi tri that.
      $lastUpdated = 0
      if ($timeline.LastUpdatedTime -ne $null) {
        $lastUpdated = [long]($timeline.LastUpdatedTime.ToUnixTimeMilliseconds())
      }

      Write-Event @{
        type        = 'now'
        app         = $appId
        status      = $status
        title       = $cachedTitle
        artist      = $cachedArtist
        album       = $cachedAlbum
        position    = [math]::Round($timeline.Position.TotalSeconds, 3)
        duration    = [math]::Round($timeline.EndTime.TotalSeconds, 3)
        lastUpdated = $lastUpdated
      }
    }
  } catch {
    # Phien bien mat giua chung la chuyen binh thuong - bao roi doc tiep
    Write-Event @{ type = 'warn'; message = $_.Exception.Message }
  }

  Start-Sleep -Milliseconds $IntervalMs
}
