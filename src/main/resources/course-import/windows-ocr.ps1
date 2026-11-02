param([Parameter(Mandatory=$true)][string]$ImagePath, [Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapTransform, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
$taskAwaitMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await-WinRT($Operation, [Type]$ResultType) {
    $taskOperation = $taskAwaitMethod.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $taskOperation.Wait()
    return $taskOperation.Result
}
$taskStream = $null
$taskBitmap = $null
try {
    $taskFile = Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
    $taskStream = Await-WinRT ($taskFile.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $taskDecoder = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($taskStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $taskLimit = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
    if ([Math]::Max($taskDecoder.PixelWidth, $taskDecoder.PixelHeight) -gt $taskLimit) {
        $taskScale = $taskLimit / [double][Math]::Max($taskDecoder.PixelWidth, $taskDecoder.PixelHeight)
        $taskTransform = [Windows.Graphics.Imaging.BitmapTransform]::new()
        $taskTransform.ScaledWidth = [uint32][Math]::Max(1, [Math]::Floor($taskDecoder.PixelWidth * $taskScale))
        $taskTransform.ScaledHeight = [uint32][Math]::Max(1, [Math]::Floor($taskDecoder.PixelHeight * $taskScale))
        $taskBitmap = Await-WinRT ($taskDecoder.GetSoftwareBitmapAsync(
            [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,
            $taskTransform, [Windows.Graphics.Imaging.ExifOrientationMode]::RespectExifOrientation,
            [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])
    } else {
        $taskBitmap = Await-WinRT ($taskDecoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    }
    $taskEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('zh-Hans-CN'))
    if ($null -eq $taskEngine) { throw 'Chinese OCR is unavailable' }
    $taskResult = Await-WinRT ($taskEngine.RecognizeAsync($taskBitmap)) ([Windows.Media.Ocr.OcrResult])
    $taskLines = @($taskResult.Lines | ForEach-Object {
        $taskWords = @($_.Words)
        $taskLeft = ($taskWords | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
        $taskTop = ($taskWords | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
        $taskRight = ($taskWords | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
        $taskBottom = ($taskWords | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
        @{ text=$_.Text; x=[Math]::Round($taskLeft); y=[Math]::Round($taskTop); width=[Math]::Round($taskRight-$taskLeft); height=[Math]::Round($taskBottom-$taskTop) }
    })
    $taskOutput = @{ width=$taskBitmap.PixelWidth; height=$taskBitmap.PixelHeight; lines=$taskLines }
    [IO.File]::WriteAllText($OutputPath, ($taskOutput | ConvertTo-Json -Depth 5 -Compress), [Text.UTF8Encoding]::new($false))
} finally {
    if ($null -ne $taskBitmap) { $taskBitmap.Dispose() }
    if ($null -ne $taskStream) { $taskStream.Dispose() }
}
