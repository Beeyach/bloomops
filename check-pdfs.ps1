$slugs = @(
    "jennifersalvolmt","bgholistictherapy","pamelachambers","centertruehealth",
    "sobar-massage","actuallyaesthetics","skincarebytaka","firstloved",
    "realadhdcoach","melissamorenobarnett","laurenkranich","yourstorytoglory",
    "sandisue","soultosoulga","infinitehealingandhealth","tranquilitiwellnesscenter"
)
foreach ($s in $slugs) {
    try {
        $r = Invoke-WebRequest -Uri "https://file.gobloomwired.com/review/$s" -Method HEAD -UseBasicParsing
        $kb = [math]::Round([int]$r.Headers["Content-Length"] / 1024)
        Write-Host "$s => $($r.StatusCode) (${kb}KB)"
    } catch {
        Write-Host "$s => FAILED"
    }
}
