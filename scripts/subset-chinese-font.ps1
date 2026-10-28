$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path -Parent $PSScriptRoot
$copy = (Get-Content -LiteralPath (Join-Path $siteRoot 'src/zh-CN.mjs') -Raw) + (Get-Content -LiteralPath (Join-Path $siteRoot 'src/site-v2.js') -Raw)
$characters = @([regex]::Matches($copy, '[\p{IsCJKUnifiedIdeographs}\u3000-\u303f\uff00-\uffef]').Value | Sort-Object -Unique) -join ''
$requestUrl = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400..700&display=swap&text=' + [Uri]::EscapeDataString($characters)
$css = (Invoke-WebRequest -Uri $requestUrl -UserAgent 'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' -TimeoutSec 30).Content
$fontUrl = [regex]::Match($css, 'src: url\(([^)]+)\)').Groups[1].Value
if (([Uri]$fontUrl).Host -ne 'fonts.gstatic.com' -or $css -notmatch "format\('woff2'\)") { throw 'Unexpected font response' }
$fonts = Join-Path $siteRoot 'src/fonts'
Invoke-WebRequest -Uri $fontUrl -OutFile (Join-Path $fonts 'noto-sans-sc-subset.woff2') -TimeoutSec 30
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt' -OutFile (Join-Path $fonts 'noto-sans-sc-OFL.txt') -TimeoutSec 30
[IO.File]::WriteAllText((Join-Path $fonts 'noto-sans-sc-characters.txt'), $characters)
Write-Output ('Updated Chinese subset: ' + $characters.Length + ' characters.')
