# Firebase App Hosting secrets helper (Firebase CLI only)
# Run from repo root:
# powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1

$ErrorActionPreference = "Stop"

$ProjectId = "zootopia2026"
$BackendId = "zootopia-club-next-backend"

Write-Host "Using project: $ProjectId" -ForegroundColor Cyan
firebase use $ProjectId

Write-Host ""
Write-Host "====================================================" -ForegroundColor Yellow
Write-Host "IMPORTANT CHOICES FOR EVERY SECRET PROMPT" -ForegroundColor Yellow
Write-Host "1) Enter the real secret value"
Write-Host "2) Choose: Production"
Write-Host "3) Choose: Grant access now -> Yes"
Write-Host "4) Choose: Add this secret to apphosting.yaml -> No"
Write-Host "====================================================" -ForegroundColor Yellow
Write-Host ""

$Secrets = @(
  "google-ai-api-key",
  "dashscope-api-key",
  "firebase-client-email",
  "firebase-private-key",
  "smtp-user",
  "smtp-pass",
  "smtp-email-from",
  "contact-form-to",
  "zootopia-maintenance-secret"
)

foreach ($SecretName in $Secrets) {
  Write-Host ""
  Write-Host "----------------------------------------" -ForegroundColor DarkGray
  Write-Host "Now setting secret: $SecretName" -ForegroundColor Green
  Write-Host "----------------------------------------" -ForegroundColor DarkGray
  firebase apphosting:secrets:set $SecretName
}

Write-Host ""
Write-Host "Done setting all listed secrets." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1) Make sure the matching secret refs are uncommented in apps/web/apphosting.yaml"
Write-Host "2) Run:"
Write-Host "   npm run lint --workspace @zootopia/web"
Write-Host "   npm run typecheck --workspace @zootopia/web"
Write-Host "   npm run build --workspace @zootopia/web"
Write-Host "3) Create a new App Hosting rollout or push the connected branch"