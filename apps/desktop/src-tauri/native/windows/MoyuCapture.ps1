param(
  [Parameter(Mandatory = $true)][double]$X,
  [Parameter(Mandatory = $true)][double]$Y
)

$ErrorActionPreference = "Stop"

function Write-CaptureResult([string]$Text, [string]$Origin) {
  @{ text = $Text.Trim(); origin = $Origin } | ConvertTo-Json -Compress
  exit 0
}

function Await-WinRt($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $point = New-Object System.Windows.Point($X, $Y)
  $element = [System.Windows.Automation.AutomationElement]::FromPoint($point)
  if ($null -ne $element) {
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
      $range = $pattern.RangeFromPoint($point)
      $range.ExpandToEnclosingUnit([System.Windows.Automation.TextUnit]::Word)
      $text = $range.GetText(-1).Trim()
      if (-not [string]::IsNullOrWhiteSpace($text)) {
        Write-CaptureResult $text "accessibility"
      }
    }
    $name = $element.Current.Name
    if (-not [string]::IsNullOrWhiteSpace($name) -and $name.Length -le 120) {
      Write-CaptureResult $name "accessibility"
    }
  }
} catch {
  # Continue to OCR when the target application does not expose UI Automation text.
}

$tempPath = Join-Path ([System.IO.Path]::GetTempPath()) ("moyu-ocr-" + [guid]::NewGuid().ToString("N") + ".png")
try {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Runtime.WindowsRuntime

  $width = 560
  $height = 240
  $left = [int][Math]::Round($X - $width / 2)
  $top = [int][Math]::Round($Y - $height / 2)
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($left, $top, 0, 0, $bitmap.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
    $bitmap.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }

  [void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  [void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  [void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]

  $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tempPath)) ([Windows.Storage.StorageFile])
  $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $softwareBitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) { throw "Windows OCR language pack is unavailable." }
  $result = Await-WinRt ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])

  $bestText = $null
  $bestDistance = [double]::PositiveInfinity
  foreach ($line in $result.Lines) {
    foreach ($word in $line.Words) {
      $rect = $word.BoundingRect
      $centerX = $rect.X + $rect.Width / 2
      $centerY = $rect.Y + $rect.Height / 2
      $distance = [Math]::Sqrt([Math]::Pow($centerX - $width / 2, 2) + [Math]::Pow($centerY - $height / 2, 2))
      if ($distance -lt $bestDistance) {
        $bestDistance = $distance
        $bestText = $word.Text
      }
    }
  }
  if ([string]::IsNullOrWhiteSpace($bestText)) { throw "No text was found near the cursor." }
  Write-CaptureResult $bestText "ocr"
} catch {
  [Console]::Error.WriteLine("Windows 取词失败：" + $_.Exception.Message)
  exit 1
} finally {
  if (Test-Path $tempPath) { Remove-Item -Force $tempPath -ErrorAction SilentlyContinue }
}
