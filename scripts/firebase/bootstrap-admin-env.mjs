import fs from "node:fs/promises";

import {
  ENV_LOCAL_PATH,
  SERVICE_ACCOUNT_KEY_PATH,
  formatEnvValue,
  parseEnvFile,
  readJsonFile,
  readTextFile,
} from "./env-utils.mjs";

const EXPECTED_PROJECT_ID = "zootopia2026";
const DEFAULT_STORAGE_BUCKET = "zootopia2026.firebasestorage.app";
const DEFAULT_ADMIN_EMAILS = [
  "alahlyeagle@gmail.com",
  "elmahdy@admin.com",
  "alahlyeagle13@gmail.com",
];

async function main() {
  const serviceAccount = await readJsonFile(SERVICE_ACCOUNT_KEY_PATH);

  if (serviceAccount.project_id !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `serviceAccountKeyNext.json targets ${serviceAccount.project_id}, expected ${EXPECTED_PROJECT_ID}.`,
    );
  }

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error(
      "serviceAccountKeyNext.json is missing the fields required for Firebase Admin bootstrap.",
    );
  }

  const currentContent = await readTextFile(ENV_LOCAL_PATH);
  const currentEnv = parseEnvFile(currentContent);

  const desiredEntries = [
    ["FIREBASE_PROJECT_ID", serviceAccount.project_id],
    ["FIREBASE_CLIENT_EMAIL", serviceAccount.client_email],
    ["FIREBASE_PRIVATE_KEY", serviceAccount.private_key],
    ["FIREBASE_STORAGE_BUCKET", DEFAULT_STORAGE_BUCKET],
    ["ZOOTOPIA_ADMIN_EMAILS", DEFAULT_ADMIN_EMAILS.join(",")],
  ];

  const missingEntries = desiredEntries.filter(([key]) => !currentEnv.has(key));

  if (missingEntries.length === 0) {
    console.log(".env.local already contains the Firebase Admin bootstrap values.");
    console.log(
      "Verify the safe NEXT_PUBLIC_FIREBASE_* values manually from Firebase Console if they are still missing.",
    );
    return;
  }

  let nextContent = currentContent.trimEnd();
  if (nextContent.length > 0) {
    nextContent += "\n\n";
  }

  nextContent += "# Firebase Admin bootstrap (server only)\n";
  for (const [key, value] of missingEntries) {
    nextContent += `${key}=${formatEnvValue(value)}\n`;
  }

  await fs.writeFile(ENV_LOCAL_PATH, `${nextContent.trimEnd()}\n`, "utf8");

  console.log(
    `.env.local updated with server-only Firebase Admin entries: ${missingEntries
      .map(([key]) => key)
      .join(", ")}`,
  );
  console.log(
    "Verify FIREBASE_STORAGE_BUCKET against Firebase Console, then add the safe NEXT_PUBLIC_FIREBASE_* values manually.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unable to bootstrap .env.local.",
  );
  process.exitCode = 1;
});
