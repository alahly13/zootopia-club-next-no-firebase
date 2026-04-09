# PowerShell Script Commands Guide (Firebase App Hosting Secrets)

Run these from the repository root.

## Preflight checks

```powershell
Test-Path .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1
Test-Path .\.env.local
```

## Dry-run validation (safe first command)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -DryRun -NonInteractive -SkipGrantAccess
```

## Apply secrets (interactive)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1
```

## CI / non-interactive apply

Use this only when required values are already present in session env vars or `.env.local`.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -NonInteractive
```

## Useful optional flags

Include optional secrets even when values are missing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -IncludeOptional
```

Target a single secret by name:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -OnlySecretName google-ai-api-key
```

Skip backend grant-access (set value only):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -SkipGrantAccess
```

Skip `.env.example` key alignment validation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1 -SkipEnvTemplateValidation
```

## Current reCAPTCHA Enterprise contract

- Settings phone OTP server verification is CreateAssessment-only.
- No shared reCAPTCHA secret key is provisioned via this script.
- Keep these non-secret values configured in env/apphosting config:
	- `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` (BUILD)
	- `FIREBASE_PROJECT_ID` (RUNTIME)
	- optional overrides: `RECAPTCHA_ENTERPRISE_PROJECT_ID`, `RECAPTCHA_ENTERPRISE_SITE_KEY` (RUNTIME)
	- `RECAPTCHA_ENTERPRISE_MIN_SCORE` (RUNTIME)

## Post-change verification

```powershell
npm run lint --workspace @zootopia/web
npm run typecheck --workspace @zootopia/web
npm run build --workspace @zootopia/web
```