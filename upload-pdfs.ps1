$token = (Get-Content "F:\bloomtrack-pro\.upload-secret" -Raw).Trim()
$slugs = @(
    "jennifersalvolmt",
    "bgholistictherapy",
    "pamelachambers",
    "centertruehealth",
    "sobar-massage",
    "actuallyaesthetics",
    "skincarebytaka",
    "firstloved",
    "realadhdcoach",
    "melissamorenobarnett",
    "laurenkranich",
    "yourstorytoglory",
    "sandisue",
    "soultosoulga",
    "infinitehealingandhealth",
    "tranquilitiwellnesscenter"
)
foreach ($slug in $slugs) {
    $file = "F:\bloomtrack-pro\prospect-pdfs\$slug-review.pdf"
    $url = "https://file.gobloomwired.com/review/$slug"
    Write-Host "Uploading $slug..."
    try {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $headers = @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/pdf"
        }
        $resp = Invoke-WebRequest -Uri $url -Method PUT -Headers $headers -Body $bytes -UseBasicParsing
        Write-Host "  $slug => $($resp.StatusCode) OK"
    } catch {
        Write-Host "  $slug => FAILED: $($_.Exception.Message)"
    }
}
Write-Host "Done. All uploads attempted."
