import "server-only";

import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from "@zootopia/shared-config";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import {
  getSupabaseAuthUser,
  listSupabaseAuthUsers,
  revokeSupabaseRefreshTokens,
  setSupabaseUserClaims,
  setSupabaseUserDisabled,
  verifySupabaseAccessToken,
} from "@/lib/server/supabase-admin";

let cachedSupabaseAuthAdapter: {
  verifyIdToken: (idToken: string) => Promise<Record<string, unknown>>;
  verifySessionCookie: (
    sessionCookie: string,
    checkRevoked?: boolean,
  ) => Promise<Record<string, unknown>>;
  createSessionCookie: (
    idToken: string,
    options?: { expiresIn?: number },
  ) => Promise<string>;
  listUsers: (
    maxResults: number,
    pageToken?: string,
  ) => Promise<{ users: unknown[]; pageToken?: string }>;
  getUser: (uid: string) => Promise<unknown>;
  setCustomUserClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;
  revokeRefreshTokens: (uid: string) => Promise<void>;
  updateUser: (uid: string, updates: { disabled?: boolean }) => Promise<void>;
} | null = null;

function buildAuthError(code: string, message: string) {
  return Object.assign(new Error(message), {
    code,
  });
}

function getAdminProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    FIREBASE_PROJECT_ID
  );
}

function getAdminClientEmail() {
  return process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
}

function getAdminPrivateKey() {
  return (
    process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY
  )?.replace(/\\n/g, "\n");
}

function hasManagedFirebaseRuntime() {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.FIREBASE_CONFIG ||
      process.env.K_SERVICE ||
      process.env.FUNCTION_TARGET,
  );
}

export function hasFirebaseAdminRuntime() {
  return Boolean(
    (getAdminClientEmail() && getAdminPrivateKey()) || hasManagedFirebaseRuntime(),
  );
}

export function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId = getAdminProjectId();
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;

  const clientEmail = getAdminClientEmail();
  const privateKey = getAdminPrivateKey();

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

export function getFirebaseAdminAuth() {
  if (cachedSupabaseAuthAdapter) {
    return cachedSupabaseAuthAdapter;
  }

  cachedSupabaseAuthAdapter = {
    async verifyIdToken(idToken: string) {
      const decodedToken = await verifySupabaseAccessToken(idToken);
      if (!decodedToken) {
        throw buildAuthError(
          "auth/invalid-id-token",
          "The provided Supabase access token is invalid or expired.",
        );
      }

      return decodedToken as Record<string, unknown>;
    },
    async verifySessionCookie(sessionCookie: string) {
      const decodedToken = await verifySupabaseAccessToken(sessionCookie);
      if (!decodedToken) {
        throw buildAuthError(
          "auth/invalid-session-cookie",
          "The secure session cookie is invalid or expired.",
        );
      }

      return decodedToken as Record<string, unknown>;
    },
    async createSessionCookie(idToken: string) {
      // Keep the existing server-authenticated session-cookie contract.
      // Supabase access tokens are verified on every request through verifySessionCookie().
      const token = String(idToken || "").trim();
      if (!token) {
        throw buildAuthError("auth/invalid-id-token", "Session token is required.");
      }

      return token;
    },
    async listUsers(maxResults: number, pageToken?: string) {
      return listSupabaseAuthUsers({
        maxResults,
        pageToken,
      });
    },
    async getUser(uid: string) {
      const user = await getSupabaseAuthUser(uid);
      if (!user) {
        throw buildAuthError("auth/user-not-found", "The user was not found.");
      }

      return user;
    },
    async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
      await setSupabaseUserClaims(uid, claims);
    },
    async revokeRefreshTokens(uid: string) {
      await revokeSupabaseRefreshTokens(uid);
    },
    async updateUser(uid: string, updates: { disabled?: boolean }) {
      if (typeof updates.disabled === "boolean") {
        await setSupabaseUserDisabled(uid, updates.disabled);
      }
    },
  };

  return cachedSupabaseAuthAdapter;
}

export function getFirebaseAdminFirestore() {
  return getFirestore(getFirebaseAdminApp(), FIRESTORE_DATABASE_ID);
}

export function getFirebaseAdminStorageBucket() {
  return getStorage(getFirebaseAdminApp()).bucket();
}
