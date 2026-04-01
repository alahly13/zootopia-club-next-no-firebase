import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { ENV_LOCAL_PATH, loadEnvFileIntoProcess } from "./env-utils.mjs";

const EXPECTED_PROJECT_ID = "zootopia2026";
const FIRESTORE_DATABASE_ID = "zootopia-club-next-database";
const DEFAULT_ADMIN_EMAILS = [
  "alahlyeagle@gmail.com",
  "elmahdy@admin.com",
  "alahlyeagle13@gmail.com",
];

function getEnvValue(primaryKey, fallbackKey) {
  return process.env[primaryKey] || (fallbackKey ? process.env[fallbackKey] : undefined);
}

function getConfiguredProjectId() {
  return (
    getEnvValue("FIREBASE_PROJECT_ID", "FIREBASE_ADMIN_PROJECT_ID") ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT
  );
}

function getConfiguredClientEmail() {
  return getEnvValue("FIREBASE_CLIENT_EMAIL", "FIREBASE_ADMIN_CLIENT_EMAIL");
}

function getConfiguredPrivateKey() {
  return getEnvValue("FIREBASE_PRIVATE_KEY", "FIREBASE_ADMIN_PRIVATE_KEY")?.replace(
    /\\n/g,
    "\n",
  );
}

function getConfiguredStorageBucket(projectId) {
  return process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
}

function getAdminEmails() {
  const configured = process.env.ZOOTOPIA_ADMIN_EMAILS?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : DEFAULT_ADMIN_EMAILS;
}

function initializeAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = getConfiguredProjectId();
  if (!projectId) {
    throw new Error(
      `Missing Firebase Admin project configuration. Run the bootstrap command first or define server env vars in ${ENV_LOCAL_PATH}.`,
    );
  }

  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `Refusing to target Firebase project ${projectId}. Expected ${EXPECTED_PROJECT_ID}.`,
    );
  }

  const clientEmail = getConfiguredClientEmail();
  const privateKey = getConfiguredPrivateKey();
  const storageBucket = getConfiguredStorageBucket(projectId);

  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
      storageBucket,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket,
  });
}

async function upsertAdminUserDocument(firestore, userRecord) {
  const userRef = firestore.collection("users").doc(userRecord.uid);
  const snapshot = await userRef.get();
  const existing = snapshot.exists ? snapshot.data() : null;
  const now = new Date().toISOString();

  await userRef.set(
    {
      uid: userRecord.uid,
      email: userRecord.email ?? null,
      displayName: userRecord.displayName ?? null,
      photoURL: userRecord.photoURL ?? null,
      fullName: existing?.fullName ?? null,
      universityCode: existing?.universityCode ?? null,
      profileCompleted: existing?.profileCompleted ?? true,
      profileCompletedAt:
        existing?.profileCompletedAt ?? existing?.updatedAt ?? existing?.createdAt ?? now,
      role: "admin",
      status: existing?.status ?? "active",
      preferences: existing?.preferences ?? {
        theme: "system",
        language: "en",
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
    { merge: true },
  );
}

async function main() {
  await loadEnvFileIntoProcess();

  const app = initializeAdminApp();
  const auth = getAuth(app);
  const firestore = getFirestore(app, FIRESTORE_DATABASE_ID);

  const adminEmails = getAdminEmails();
  const missingUsers = [];

  for (const email of adminEmails) {
    try {
      const userRecord = await auth.getUserByEmail(email);
      await auth.setCustomUserClaims(userRecord.uid, {
        ...(userRecord.customClaims ?? {}),
        role: "admin",
        admin: true,
      });
      await auth.revokeRefreshTokens(userRecord.uid);
      await upsertAdminUserDocument(firestore, userRecord);
      console.log(`Admin claims applied: ${email} (${userRecord.uid})`);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";

      if (code === "auth/user-not-found") {
        missingUsers.push(email);
        continue;
      }

      throw error;
    }
  }

  if (missingUsers.length > 0) {
    console.warn(
      `These emails do not exist in Firebase Auth yet: ${missingUsers.join(", ")}`,
    );
    console.warn("Have those owners sign in once, then rerun this command.");
    process.exitCode = 1;
    return;
  }

  console.log(
    "Admin claims and Firestore role mirrors are in place. Each admin should sign out and sign back in before verification.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unable to assign admin claims.",
  );
  process.exitCode = 1;
});
