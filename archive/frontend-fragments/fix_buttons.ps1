$filepath = 'e:\youtubr\youtubeMusicDownload-main\frontend\src\App.jsx'
$content = [System.IO.File]::ReadAllText($filepath, [System.Text.Encoding]::UTF8)

$content = $content -replace '<Button\b', '<RippleButton'
$content = $content -replace '</Button>', '</RippleButton>'
$content = $content -replace ' variant="text"', ''
$content = $content -replace ' variant="outlined"', ''

[System.IO.File]::WriteAllText($filepath, $content, [System.Text.Encoding]::UTF8)
Write-Host "App.jsx fixed. Checking..."
$remaining = ($content | Select-String -Pattern '<Button' -AllMatches).Matches.Count
Write-Host "Remaining <Button occurrences: $remaining"
