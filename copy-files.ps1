# -*- coding: utf-8 -*-
$ErrorActionPreference = "Continue"
$sourceDir = "D:\ГД\!!№3 Клиенты\ЗАЯВКИ ВЫДАННЫЕ\"
$targetDir = "E:\MySOFT\financier.ai\test-data\office-files"

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$files = Get-ChildItem -Path $sourceDir -Recurse -Include "*.xls","*.xlsx","*.doc","*.docx" -ErrorAction SilentlyContinue | Select-Object -First 20

$counter = @{xls=0; xlsx=0; doc=0; docx=0}
$copied = 0

foreach ($f in $files) {
    try {
        $ext = $f.Extension.Substring(1)
        $counter[$ext]++
        $destName = "test_${ext}_${counter[$ext]}.$ext"
        $dest = Join-Path $targetDir $destName
        Copy-Item $f.FullName $dest -Force
        Write-Host "Copied: $destName ($($f.Length) bytes)"
        $copied++
    } catch {
        Write-Host "Skip: $($f.Name)"
    }
}

Write-Host ""
Write-Host "Copied $copied files to $targetDir"