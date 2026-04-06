# Firebase App Hosting Env and Secrets Guide (Beginner)

This guide explains how this repo handles environment variables and secrets for Firebase App Hosting.

## Short answer to the main question

Yes. This project can safely use apps/web/apphosting.yaml as the primary code-managed App Hosting config for most settings.

What still must be done manually:
- Create Cloud Secret Manager secret values.
- Grant backend access to those secrets.
- Keep Firebase Console overrides empty unless you intentionally want to override file values.

## Basic concepts in plain language

### YAML vs JSON
- YAML is a text format that uses indentation and dashes.
- JSON uses braces, brackets, commas, and quotes.
- apps/web/apphosting.yaml is YAML because App Hosting reads YAML for backend config.

### tsconfig.json vs apphosting.yaml
- tsconfig.json configures TypeScript behavior (type checking, compile options).
- apphosting.yaml configures deployment/runtime behavior (env vars, secrets, Cloud Run settings).
- They are unrelated and should not be mixed.

### Environment variables
- Environment variables are runtime/build settings read from process.env.
- Non-secret env vars are safe to keep in source control.
- Secret env vars must come from Secret Manager, not from source files.

### Secrets
- Secrets are sensitive values (API keys, passwords, private keys).
- Never commit secret values to Git.
- In App Hosting, secrets are referenced in apphosting.yaml, but their values live in Cloud Secret Manager.

### BUILD vs RUNTIME availability
- BUILD means the variable is available while the app is being built.
- RUNTIME means the variable is available when Cloud Run executes your server.
- NEXT_PUBLIC_* values are usually BUILD only because Next.js injects them into the built client bundle.

## Where each config belongs

- .env.local:
  Local development only. Real values on your own machine.
- .env.example:
  Template and documentation. No real secret values.
- apps/web/apphosting.yaml:
  Code-managed deploy config for App Hosting (non-secrets + secret references).
- Cloud Secret Manager:
  Real secret values (referenced by name in apphosting.yaml).
- Firebase Console:
  Optional override layer. Use only when you intentionally need per-environment overrides.

## Current contract used by this repo

### Non-secret config in apphosting.yaml

These are now code-managed in apps/web/apphosting.yaml:
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- FIREBASE_PROJECT_ID
- FIREBASE_STORAGE_BUCKET
- ZOOTOPIA_ADMIN_EMAILS
- ZOOTOPIA_SESSION_TTL_SECONDS
- DASHSCOPE_BASE_URL
- GOOGLE_AI_MODEL
- GOOGLE_AI_ADVANCED_MODEL
- QWEN_MODEL
- SMTP_HOST
- SMTP_PORT
- SMTP_SECURE

### Secret references in apphosting.yaml

Active secret reference:
- GOOGLE_AI_API_KEY -> google-ai-api-key

Optional secret references (commented in file until needed):
- DASHSCOPE_API_KEY -> dashscope-api-key
- SMTP_USER -> smtp-user
- SMTP_PASS -> smtp-pass
- EMAIL_FROM -> smtp-email-from
- CONTACT_FORM_TO -> contact-form-to
- ZOOTOPIA_MAINTENANCE_SECRET -> zootopia-maintenance-secret
- FIREBASE_CLIENT_EMAIL -> firebase-client-email
- FIREBASE_PRIVATE_KEY -> firebase-private-key

### Local-only values (do not place in apphosting.yaml)

- ASSESSMENT_PDF_BROWSER_EXECUTABLE_PATH
- PUPPETEER_EXECUTABLE_PATH
- ZOOTOPIA_ADMIN_PASSWORD (shell command only, never in env files)

### System-managed values (do not set manually)

- FIREBASE_WEBAPP_CONFIG (App Hosting build-time)
- FIREBASE_CONFIG
- GOOGLE_CLOUD_PROJECT
- GCLOUD_PROJECT
- GOOGLE_APPLICATION_CREDENTIALS
- K_SERVICE
- FUNCTION_TARGET
- NODE_ENV

## Firebase web config and next.config.ts backfill

This repo supports both paths safely:
- Primary path now: explicit NEXT_PUBLIC_* in apphosting.yaml (BUILD).
- Safety net path: apps/web/next.config.ts still backfills NEXT_PUBLIC_* from FIREBASE_WEBAPP_CONFIG if explicit values are missing.

That means if NEXT_PUBLIC_* is accidentally removed from apphosting.yaml, App Hosting can still work when the backend is linked to a Firebase web app.

## How App Hosting reads this file

During each rollout from the configured app root (apps/web), App Hosting applies:
- runConfig values
- env variable values
- secret references

App Hosting does not create your secret values automatically. Secret references only point to values that must already exist in Secret Manager.

## Precedence rules (important)

From Firebase docs, highest to lowest:
1. Firebase Console environment values
2. apphosting.<env>.yaml
3. apphosting.yaml
4. Firebase system-injected variables

If the same key exists in Console and apphosting.yaml, Console wins.

## Manual steps you still must do

1. Create required secrets in Secret Manager via Firebase CLI.

Example:

```bash
firebase apphosting:secrets:set google-ai-api-key --project zootopia2026
```

2. If you use optional features, create optional secrets too.

Examples:

```bash
firebase apphosting:secrets:set dashscope-api-key --project zootopia2026
firebase apphosting:secrets:set smtp-user --project zootopia2026
firebase apphosting:secrets:set smtp-pass --project zootopia2026
firebase apphosting:secrets:set smtp-email-from --project zootopia2026
firebase apphosting:secrets:set contact-form-to --project zootopia2026
firebase apphosting:secrets:set zootopia-maintenance-secret --project zootopia2026
```

3. If secrets were created in Cloud Console instead of Firebase CLI, grant backend access using the Firebase App Hosting secret access command and follow prompts.

4. Keep Console env overrides empty unless you intentionally need to override apphosting.yaml.

5. Deploy.

```bash
npm run firebase:app:deploy
```

6. Verify rollout env in Firebase Console rollout details.

## Beginner rollout checklist

- apps/web/apphosting.yaml contains your non-secret deploy config.
- Cloud Secret Manager contains required secret values.
- No raw secrets are in Git-tracked files.
- Console overrides are either empty or intentionally documented.
- Deployment succeeds and /login plus protected server routes run with expected runtime flags.
