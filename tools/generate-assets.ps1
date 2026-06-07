$ErrorActionPreference = "Stop"

$appRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$audioRoot = Join-Path $appRoot "audio"
$iconRoot = Join-Path $appRoot "icons"
$tempRoot = Join-Path $appRoot ".tmp\audio"

New-Item -ItemType Directory -Force -Path $audioRoot, $iconRoot, $tempRoot | Out-Null

$pitches = @(
  @{ Id = "fastball"; Label = "fastball" },
  @{ Id = "changeup"; Label = "changeup" },
  @{ Id = "curveball"; Label = "curveball" }
)

$singleCalls = @(
  @{ Id = "pitchout"; Label = "pitch out" },
  @{ Id = "first-third-arm"; Label = "first and third arm" },
  @{ Id = "first-third-chest"; Label = "first and third chest" },
  @{ Id = "mound-visit"; Label = "mound visit" },
  @{ Id = "pick-off"; Label = "pick off" },
  @{ Id = "step-off"; Label = "step off" }
)

$zones = @(
  @{ Id = "middle"; Label = "middle" },
  @{ Id = "inside"; Label = "inside" },
  @{ Id = "outside"; Label = "outside" },
  @{ Id = "high"; Label = "high" },
  @{ Id = "low"; Label = "low" }
)

Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.CreationCollisionOption, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Transcoding.PrepareTranscodeResult, Windows.Media.Transcoding, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.MediaProperties.AudioEncodingQuality, Windows.Media.MediaProperties, ContentType = WindowsRuntime] | Out-Null

$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$script:AsTaskOperation = ($methods | Where-Object {
  $_.Name -eq "AsTask" -and
  $_.IsGenericMethodDefinition -and
  $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -like "IAsyncOperation*"
})[0]
$script:AsTaskActionWithProgress = ($methods | Where-Object {
  $_.Name -eq "AsTask" -and
  $_.IsGenericMethodDefinition -and
  $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -like "IAsyncActionWithProgress*"
})[0]

function Wait-AsyncOperation {
  param(
    [Parameter(Mandatory = $true)] $Operation,
    [Parameter(Mandatory = $true)] [Type] $ResultType
  )

  $task = $script:AsTaskOperation.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Wait-AsyncActionWithProgress {
  param(
    [Parameter(Mandatory = $true)] $Operation,
    [Parameter(Mandatory = $true)] [Type] $ProgressType
  )

  $task = $script:AsTaskActionWithProgress.MakeGenericMethod($ProgressType).Invoke($null, @($Operation))
  $task.Wait()
}

function New-SpeechWav {
  param(
    [Parameter(Mandatory = $true)] [string] $Text,
    [Parameter(Mandatory = $true)] [string] $Path
  )

  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.Rate = 1
  $synth.Volume = 100
  $synth.SetOutputToWaveFile($Path)
  $synth.Speak($Text)
  $synth.Dispose()
}

function Convert-WavToM4a {
  param(
    [Parameter(Mandatory = $true)] [string] $WavPath,
    [Parameter(Mandatory = $true)] [string] $M4aPath
  )

  $inputFile = Wait-AsyncOperation `
    ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $WavPath).Path)) `
    ([Windows.Storage.StorageFile])

  $outputFolderPath = Split-Path $M4aPath -Parent
  $outputName = Split-Path $M4aPath -Leaf
  $outputFolder = Wait-AsyncOperation `
    ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync((Resolve-Path $outputFolderPath).Path)) `
    ([Windows.Storage.StorageFolder])
  $outputFile = Wait-AsyncOperation `
    ($outputFolder.CreateFileAsync($outputName, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) `
    ([Windows.Storage.StorageFile])

  $profile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateM4a(
    [Windows.Media.MediaProperties.AudioEncodingQuality]::Medium
  )
  $transcoder = New-Object Windows.Media.Transcoding.MediaTranscoder
  $prepared = Wait-AsyncOperation `
    ($transcoder.PrepareFileTranscodeAsync($inputFile, $outputFile, $profile)) `
    ([Windows.Media.Transcoding.PrepareTranscodeResult])

  if (-not $prepared.CanTranscode) {
    throw "Cannot transcode '$WavPath' to m4a: $($prepared.FailureReason)"
  }

  Wait-AsyncActionWithProgress ($prepared.TranscodeAsync()) ([double])
}

function New-AppIcon {
  param(
    [Parameter(Mandatory = $true)] [int] $Size,
    [Parameter(Mandatory = $true)] [string] $Path
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(15, 95, 70))

  $plate = New-Object System.Drawing.Drawing2D.GraphicsPath
  $plate.AddPolygon(@(
    [System.Drawing.PointF]::new($Size * 0.23, $Size * 0.26),
    [System.Drawing.PointF]::new($Size * 0.77, $Size * 0.26),
    [System.Drawing.PointF]::new($Size * 0.77, $Size * 0.59),
    [System.Drawing.PointF]::new($Size * 0.50, $Size * 0.78),
    [System.Drawing.PointF]::new($Size * 0.23, $Size * 0.59)
  ))

  $graphics.FillPath([System.Drawing.Brushes]::White, $plate)

  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 180, 24, 16)), ([Math]::Max(4, $Size * 0.026))
  $graphics.DrawArc($pen, $Size * 0.23, $Size * 0.19, $Size * 0.24, $Size * 0.56, 292, 96)
  $graphics.DrawArc($pen, $Size * 0.53, $Size * 0.19, $Size * 0.24, $Size * 0.56, 152, 96)

  $font = New-Object System.Drawing.Font "Segoe UI", ($Size * 0.19), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15, 95, 70))
  $rect = [System.Drawing.RectangleF]::new(0, $Size * 0.31, $Size, $Size * 0.26)
  $graphics.DrawString("PC", $font, $brush, $rect, $format)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

foreach ($pitch in $pitches) {
  foreach ($zone in $zones) {
    $fileName = "$($pitch.Id)-$($zone.Id)"
    $wavPath = Join-Path $tempRoot "$fileName.wav"
    $m4aPath = Join-Path $audioRoot "$fileName.m4a"
    $phrase = "$($pitch.Label) $($zone.Label)"

    New-SpeechWav -Text $phrase -Path $wavPath
    Convert-WavToM4a -WavPath $wavPath -M4aPath $m4aPath
  }
}

foreach ($call in $singleCalls) {
  $wavPath = Join-Path $tempRoot "$($call.Id).wav"
  $m4aPath = Join-Path $audioRoot "$($call.Id).m4a"

  New-SpeechWav -Text $call.Label -Path $wavPath
  Convert-WavToM4a -WavPath $wavPath -M4aPath $m4aPath
}

New-AppIcon -Size 192 -Path (Join-Path $iconRoot "icon-192.png")
New-AppIcon -Size 512 -Path (Join-Path $iconRoot "icon-512.png")

Get-ChildItem $tempRoot -Filter *.wav | Remove-Item -Force
Write-Host "Generated $((Get-ChildItem $audioRoot -Filter *.m4a).Count) audio clips and 2 icons."
