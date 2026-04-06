# Firebase App Hosting secrets helper (Firebase CLI only)
# Run from repo root:
# powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1
#
# Helpful flags:
# -IncludeOptional   Prompt for optional secrets even when .env.local has no value
# -NonInteractive    Do not prompt; fail if required secret values are missing
# -SkipGrantAccess   Set secret values only (skip backend grant-access step)
# -DryRun            Print what would run without calling Firebase CLI

[CmdletBinding()]
param(
  [string]$ProjectId = "zootopia2026",
  [string]$BackendId = "zootopia-club-next-backend",
  [string]$EnvFilePath = ".env.local",
  [switch]$IncludeOptional,
  [switch]$NonInteractive,
  [switch]$SkipGrantAccess,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$FirebaseCliPrefix = @("npx", "-y", "firebase-tools@latest")

# This definition table is the single source of truth for App Hosting secret setup.
# Keep secret names aligned with apps/web/apphosting.yaml and env keys aligned with .env.example.
$SecretDefinitions = @(
  [pscustomobject]@{ SecretName = "google-ai-api-key"; EnvKey = "GOOGLE_AI_API_KEY"; Required = $true; Feature = "Gemini and Google AI runtime" },
  [pscustomobject]@{ SecretName = "dashscope-api-key"; EnvKey = "DASHSCOPE_API_KEY"; Required = $false; Feature = "Qwen DashScope runtime" },
  [pscustomobject]@{ SecretName = "firebase-client-email"; EnvKey = "FIREBASE_CLIENT_EMAIL"; Required = $false; Feature = "Firebase Admin fallback identity" },
  [pscustomobject]@{ SecretName = "firebase-private-key"; EnvKey = "FIREBASE_PRIVATE_KEY"; Required = $false; Feature = "Firebase Admin fallback identity" },
  [pscustomobject]@{ SecretName = "smtp-user"; EnvKey = "SMTP_USER"; Required = $false; Feature = "Contact relay" },
  [pscustomobject]@{ SecretName = "smtp-pass"; EnvKey = "SMTP_PASS"; Required = $false; Feature = "Contact relay" },
  [pscustomobject]@{ SecretName = "smtp-email-from"; EnvKey = "EMAIL_FROM"; Required = $false; Feature = "Contact relay" },
  [pscustomobject]@{ SecretName = "contact-form-to"; EnvKey = "CONTACT_FORM_TO"; Required = $false; Feature = "Contact relay" },
  [pscustomobject]@{ SecretName = "zootopia-maintenance-secret"; EnvKey = "ZOOTOPIA_MAINTENANCE_SECRET"; Required = $false; Feature = "Internal maintenance endpoint" }
)

function Convert-SecureStringToPlainText {
  param([Parameter(Mandatory = $true)][Security.SecureString]$SecureValue)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Read-SecretValueFromPrompt {
  param([Parameter(Mandatory = $true)][string]$Prompt)

  $secureInput = Read-Host -Prompt $Prompt -AsSecureString
  return Convert-SecureStringToPlainText -SecureValue $secureInput
}

function Convert-EnvLineValue {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Value
  )

  $trimmed = $Value.Trim()
  if ($trimmed.Length -lt 2) {
    return $trimmed
  }

  if (($trimmed.StartsWith('"') -and $trimmed.EndsWith('"')) -or ($trimmed.StartsWith("'") -and $trimmed.EndsWith("'"))) {
    return $trimmed.Substring(1, $trimmed.Length - 2)
  }

  return $trimmed
}

function Read-EnvFileMap {
  param([Parameter(Mandatory = $true)][string]$Path)

  $envMap = @{}
  if (-not (Test-Path -Path $Path)) {
    return $envMap
  }

  foreach ($rawLine in Get-Content -Path $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $line.Substring(0, $separatorIndex).Trim()
    $value = Convert-EnvLineValue -Value $line.Substring($separatorIndex + 1)
    $envMap[$key] = $value
  }

  return $envMap
}

function Resolve-SecretValue {
  param(
    [Parameter(Mandatory = $true)]$Definition,
    [Parameter(Mandatory = $true)][hashtable]$EnvMap
  )

  # Session env vars win, then .env.local. This supports both CI and local workflows.
  $resolved = $null
  $sessionValue = [Environment]::GetEnvironmentVariable($Definition.EnvKey)
  if (-not [string]::IsNullOrWhiteSpace($sessionValue)) {
    $resolved = $sessionValue
  }
  elseif ($EnvMap.ContainsKey($Definition.EnvKey) -and -not [string]::IsNullOrWhiteSpace($EnvMap[$Definition.EnvKey])) {
    $resolved = [string]$EnvMap[$Definition.EnvKey]
  }

  # Firebase private keys are often stored as escaped "\\n" in env files.
  # Convert those escapes back to real newlines before sending to Secret Manager.
  if (-not [string]::IsNullOrWhiteSpace($resolved) -and $Definition.EnvKey -like "*PRIVATE_KEY*") {
    $resolved = $resolved -replace "\\n", "`n"
  }

  return $resolved
}

function Invoke-FirebaseCli {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $commandParts = $FirebaseCliPrefix + $Arguments
  Write-Host ("> " + ($commandParts -join " ")) -ForegroundColor DarkGray

  if ($DryRun) {
    return
  }

  & $commandParts[0] $commandParts[1..($commandParts.Length - 1)]
  if ($LASTEXITCODE -ne 0) {
    throw "Firebase CLI command failed with exit code $LASTEXITCODE."
  }
}

function Set-AppHostingSecret {
  param(
    [Parameter(Mandatory = $true)]$Definition,
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Backend
  )

  $tempFilePath = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tempFilePath, $Value, [System.Text.UTF8Encoding]::new($false))
    Invoke-FirebaseCli -Arguments @(
      "apphosting:secrets:set",
      $Definition.SecretName,
      "--project",
      $ProjectId,
      "--data-file",
      $tempFilePath
    )

    if (-not $SkipGrantAccess) {
      Invoke-FirebaseCli -Arguments @(
        "apphosting:secrets:grantaccess",
        $Definition.SecretName,
        "--project",
        $ProjectId,
        "--backend",
        $Backend
      )
    }
  }
  finally {
    Remove-Item -Path $tempFilePath -ErrorAction SilentlyContinue
  }
}

Write-Host "Using project: $ProjectId" -ForegroundColor Cyan
Write-Host "Using backend: $BackendId" -ForegroundColor Cyan
Write-Host "Env source: $EnvFilePath" -ForegroundColor Cyan
if ($DryRun) {
  Write-Host "Running in dry-run mode. No Firebase changes will be applied." -ForegroundColor Yellow
}

$envMap = Read-EnvFileMap -Path $EnvFilePath
$updatedSecrets = New-Object System.Collections.Generic.List[string]
$skippedSecrets = New-Object System.Collections.Generic.List[string]

foreach ($definition in $SecretDefinitions) {
  $value = Resolve-SecretValue -Definition $definition -EnvMap $envMap
  $hasValue = -not [string]::IsNullOrWhiteSpace($value)
  $shouldConfigure = $definition.Required -or $hasValue -or $IncludeOptional

  if (-not $shouldConfigure) {
    $skippedSecrets.Add("$($definition.SecretName) (optional, no value found)")
    continue
  }

  if (-not $hasValue) {
    if ($NonInteractive) {
      if ($definition.Required) {
        throw "Missing required value for $($definition.EnvKey). Provide it in session env or $EnvFilePath."
      }

      $skippedSecrets.Add("$($definition.SecretName) (optional, missing value in non-interactive mode)")
      continue
    }

    if (-not $definition.Required) {
      $optionalChoice = (Read-Host -Prompt "No value found for $($definition.EnvKey). Set $($definition.SecretName) now? [y/N]").Trim().ToLowerInvariant()
      if ($optionalChoice -ne "y" -and $optionalChoice -ne "yes") {
        $skippedSecrets.Add("$($definition.SecretName) (optional, skipped by user)")
        continue
      }
    }

    $value = Read-SecretValueFromPrompt -Prompt "Enter value for $($definition.EnvKey) (hidden input)"
    if ([string]::IsNullOrWhiteSpace($value)) {
      if ($definition.Required) {
        throw "Required secret $($definition.SecretName) cannot be empty."
      }

      $skippedSecrets.Add("$($definition.SecretName) (optional, empty input)")
      continue
    }

    if ($definition.EnvKey -like "*PRIVATE_KEY*" -and $value -match "\\n") {
      $value = $value -replace "\\n", "`n"
    }
  }

  Write-Host "" 
  Write-Host "----------------------------------------" -ForegroundColor DarkGray
  Write-Host "Setting secret: $($definition.SecretName)" -ForegroundColor Green
  Write-Host "Env key: $($definition.EnvKey) | Feature: $($definition.Feature)" -ForegroundColor DarkCyan
  Write-Host "----------------------------------------" -ForegroundColor DarkGray

  Set-AppHostingSecret -Definition $definition -Value $value -Backend $BackendId
  $updatedSecrets.Add($definition.SecretName)
}

Write-Host ""
Write-Host "Done syncing App Hosting secrets." -ForegroundColor Cyan
Write-Host "Updated secrets: $($updatedSecrets.Count)" -ForegroundColor Cyan
if ($updatedSecrets.Count -gt 0) {
  Write-Host (" - " + ($updatedSecrets -join ", ")) -ForegroundColor Cyan
}

if ($skippedSecrets.Count -gt 0) {
  Write-Host "Skipped secrets: $($skippedSecrets.Count)" -ForegroundColor Yellow
  foreach ($skipReason in $skippedSecrets) {
    Write-Host (" - " + $skipReason) -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1) Ensure matching secret refs are uncommented in apps/web/apphosting.yaml"
Write-Host "2) Run:"
Write-Host "   npm run lint --workspace @zootopia/web"
Write-Host "   npm run typecheck --workspace @zootopia/web"
Write-Host "   npm run build --workspace @zootopia/web"
Write-Host "3) Create a new App Hosting rollout or push the connected branch"