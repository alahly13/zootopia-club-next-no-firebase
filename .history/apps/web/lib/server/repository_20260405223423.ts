import "server-only";

import type {
  AdminOverview,
  AssessmentGeneration,
  DocumentRecord,
  InfographicGeneration,
  RequiredUserProfile,
  SessionUser,
  UserDocument,
  UserRole,
  UserStatus,
} from "@zootopia/shared-types";
import { evaluateProfileCompletion, toIsoTimestamp } from "@zootopia/shared-utils";
import type { UserRecord } from "firebase-admin/auth";
import { randomUUID } from "node:crypto";

import {
  hasAdminAccessFromClaims,
  isAllowlistedAdminEmail,
} from "@/lib/server/admin-auth";
import { deleteAssessmentArtifact } from "@/lib/server/assessment-artifact-storage";
import { normalizeAssessmentGenerationRecord } from "@/lib/server/assessment-records";
import { deleteDocumentBinaryFromStorage } from "@/lib/server/document-runtime";
import {
  getFirebaseAdminAuth,
  getFirebaseAdminFirestore,
  hasFirebaseAdminRuntime,
} from "@/lib/server/firebase-admin";
import {
  getAssessmentStatus,
  getRetentionExpiryTimestamp,
} from "@/lib/server/assessment-retention";

type AdminLogEntry = {
  id: string;
  actorUid: string;
  actorRole?: UserRole;
  action: string;
  targetUid?: string;
  ownerUid?: string;
  ownerRole?: UserRole;
  resourceType?: string;
  resourceId?: string;
  route?: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type ExpiredUploadSweepResult = {
  forced: boolean;
  skipped: boolean;
  runAt: string;
  scannedCount: number;
  deletedCount: number;
};

type MemoryStore = {
  users: Map<string, UserDocument>;
  documents: Map<string, DocumentRecord>;
  assessments: Map<string, AssessmentGeneration>;
  infographics: Map<string, InfographicGeneration>;
  adminLogs: AdminLogEntry[];
};

type OwnerScopedRecordCollection = "documents" | "assessmentGenerations";
const EXPIRED_UPLOAD_SWEEP_INTERVAL_MS = 60 * 1000;
const EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT = 200;

declare global {
  var __ZOOTOPIA_MEMORY_STORE__: MemoryStore | undefined;
  var __ZOOTOPIA_EXPIRED_UPLOAD_SWEEP_LAST_RUN_AT__: number | undefined;
}

function getMemoryStore(): MemoryStore {
  if (!globalThis.__ZOOTOPIA_MEMORY_STORE__) {
    globalThis.__ZOOTOPIA_MEMORY_STORE__ = {
      users: new Map(),
      documents: new Map(),
      assessments: new Map(),
      infographics: new Map(),
      adminLogs: [],
    };
  }

  return globalThis.__ZOOTOPIA_MEMORY_STORE__;
}

function shouldUseFirestore() {
  return hasFirebaseAdminRuntime();
}

function toSafeIsoTimestamp(value: string | null | undefined, fallback: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
}

function canViewOwnerOwnedRecord(
  ownerUid: string,
  viewer: Pick<SessionUser, "uid" | "role">,
) {
  return viewer.role === "admin" || viewer.uid === ownerUid;
}

function normalizeStoredOwnerRole(value: unknown): UserRole | undefined {
  return value === "admin" || value === "user" ? value : undefined;
}

/* Legacy owner-scoped records can predate ownerRole persistence. Resolve that metadata only
   from authoritative server context so preview/result/export/upload flows can self-heal old
   records without silently pushing admin-owned history into user scope. */
async function resolvePersistedOwnerRole(input: {
  ownerUid: string;
  ownerRole?: unknown;
  viewer?: Pick<SessionUser, "uid" | "role"> | null;
}) {
  const storedOwnerRole = normalizeStoredOwnerRole(input.ownerRole);
  if (storedOwnerRole) {
    return storedOwnerRole;
  }

  if (input.viewer && input.viewer.uid === input.ownerUid) {
    return input.viewer.role;
  }

  const owner = await getUserByUid(input.ownerUid);
  return owner?.role;
}

/* Firestore rejects undefined fields, but unresolved legacy ownerRole values must stay
   intentionally unset until they can be inferred safely. Keep this write guard narrow so we
   preserve record truth instead of defaulting ambiguous metadata into the wrong role. */
function omitUndefinedOwnerRole<T extends { ownerRole?: UserRole }>(
  record: T,
): Omit<T, "ownerRole"> | T {
  if (record.ownerRole) {
    return record;
  }

  const nextRecord = { ...record };
  delete nextRecord.ownerRole;
  return nextRecord;
}

async function persistResolvedOwnerRoleBackfill(
  collectionName: OwnerScopedRecordCollection,
  recordId: string,
  ownerRole: UserRole,
) {
  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection(collectionName)
      .doc(recordId)
      .set({ ownerRole }, { merge: true });
    return;
  }

  const store = getMemoryStore();
  if (collectionName === "documents") {
    const existing = store.documents.get(recordId);
    if (existing) {
      store.documents.set(recordId, {
        ...existing,
        ownerRole,
      });
    }
    return;
  }

  const existing = store.assessments.get(recordId);
  if (existing) {
    store.assessments.set(recordId, {
      ...existing,
      ownerRole,
    });
  }
}

/* Accessed legacy records should backfill their resolved ownerRole once the server can prove
   it from the owner account. This keeps future artifact refreshes deterministic while ensuring
   a temporary metadata repair never blocks the user-facing read path if Firestore is busy. */
async function backfillMissingOwnerRoles<T extends { id: string; ownerRole?: UserRole }>(
  collectionName: OwnerScopedRecordCollection,
  records: T[],
  resolvedOwnerRole: UserRole | undefined,
) {
  if (!resolvedOwnerRole) {
    return;
  }

  const missingRecordIds = records
    .filter((record) => !normalizeStoredOwnerRole(record.ownerRole))
    .map((record) => record.id);

  if (missingRecordIds.length === 0) {
    return;
  }

  try {
    await Promise.all(
      missingRecordIds.map((recordId) =>
        persistResolvedOwnerRoleBackfill(collectionName, recordId, resolvedOwnerRole),
      ),
    );
  } catch {
    // Legacy metadata repair is best-effort; read access should not fail because a backfill write lagged.
  }
}

function normalizeDocumentRecord(
  record: DocumentRecord,
  fallbackActiveId: string | null,
  resolvedOwnerRole?: UserRole,
): DocumentRecord {
  const isActive = record.isActive === true || record.id === fallbackActiveId;
  const expiresAt = record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt);

  return {
    ...record,
    ownerRole: normalizeStoredOwnerRole(record.ownerRole) ?? resolvedOwnerRole,
    isActive,
    supersededAt: isActive ? null : record.supersededAt ?? null,
    expiresAt,
  };
}

function normalizeDocumentRecordList(
  records: DocumentRecord[],
  resolvedOwnerRole?: UserRole,
) {
  const fallbackActiveId =
    records.find((record) => record.isActive === true)?.id ??
    records.find((record) => !record.supersededAt)?.id ??
    records[0]?.id ??
    null;

  return records.map((record) =>
    normalizeDocumentRecord(record, fallbackActiveId, resolvedOwnerRole),
  );
}

function isDocumentExpired(record: Pick<DocumentRecord, "createdAt" | "expiresAt">) {
  return Date.now() >= Date.parse(record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt));
}

async function purgeExpiredDocumentRecord(record: DocumentRecord) {
  await deleteDocumentBinaryFromStorage(record);

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore().collection("documents").doc(record.id).delete();
  } else {
    getMemoryStore().documents.delete(record.id);
  }

  await appendAdminLog({
    actorUid: "system",
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
    action: "document-expired-cleanup",
    resourceType: "document",
    resourceId: record.id,
    metadata: {
      fileName: record.fileName,
    },
  });
}

function normalizeDocumentCleanupCandidate(
  record: DocumentRecord,
  resolvedOwnerRole?: UserRole,
) {
  return normalizeDocumentRecord(
    {
      ...record,
      expiresAt: record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt),
    },
    record.isActive === true ? record.id : null,
    resolvedOwnerRole,
  );
}

/* Session-bound upload cleanup uses this throttled sweep so expired source files are removed
   even when users never revisit protected upload routes after session expiry. Keep the sweep
   batch-limited and owner-validated so high traffic does not create cross-owner side effects. */
export async function sweepExpiredUploadedSources(input: {
  force?: boolean;
} = {}): Promise<ExpiredUploadSweepResult> {
  const forced = input.force === true;
  const runAt = new Date().toISOString();
  const nowMs = Date.now();
  const lastRunAt = globalThis.__ZOOTOPIA_EXPIRED_UPLOAD_SWEEP_LAST_RUN_AT__ ?? 0;

  if (!forced && nowMs - lastRunAt < EXPIRED_UPLOAD_SWEEP_INTERVAL_MS) {
    return {
      forced,
      skipped: true,
      runAt,
      scannedCount: 0,
      deletedCount: 0,
    };
  }

  globalThis.__ZOOTOPIA_EXPIRED_UPLOAD_SWEEP_LAST_RUN_AT__ = nowMs;

  let candidates: DocumentRecord[] = [];

  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("documents")
      .where("expiresAt", "<=", runAt)
      .orderBy("expiresAt", "asc")
      .limit(EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT)
      .get();

    candidates = snapshot.docs.map((documentSnapshot) => {
      const record = documentSnapshot.data() as DocumentRecord;
      const normalizedRecord: DocumentRecord = {
        ...record,
        id: record.id || documentSnapshot.id,
      };

      return normalizeDocumentCleanupCandidate(
        normalizedRecord,
        normalizeStoredOwnerRole(record.ownerRole),
      );
    });
  } else {
    candidates = [...getMemoryStore().documents.values()]
      .map((record) =>
        normalizeDocumentCleanupCandidate(
          record,
          normalizeStoredOwnerRole(record.ownerRole),
        ),
      )
      .filter((record) => isDocumentExpired(record))
      .slice(0, EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT);
  }

  let deletedCount = 0;
  for (const candidate of candidates) {
    if (!isDocumentExpired(candidate)) {
      continue;
    }

    await purgeExpiredDocumentRecord(candidate);
    deletedCount += 1;
  }

  return {
    forced,
    skipped: false,
    runAt,
    scannedCount: candidates.length,
    deletedCount,
  };
}

/* Session termination must clear the owner's temporary upload workspace immediately so source
   binaries do not outlive the authenticated session boundary. Assessment result records/artifacts
   are intentionally preserved under their existing retention policy and are not touched here. */
export async function clearUploadWorkspaceForOwner(ownerUid: string) {
  const records = await listRawDocumentsForOwner(ownerUid);
  const normalizedRecords = normalizeDocumentRecordList(records);

  await Promise.all(normalizedRecords.map((record) => deleteDocumentBinaryFromStorage(record)));

  if (shouldUseFirestore()) {
    await Promise.all(
      normalizedRecords.map((record) =>
        getFirebaseAdminFirestore().collection("documents").doc(record.id).delete(),
      ),
    );
  } else {
    const store = getMemoryStore();
    for (const record of normalizedRecords) {
      store.documents.delete(record.id);
    }
  }

  return {
    ownerUid,
    clearedDocumentCount: normalizedRecords.length,
  };
}

async function purgeExpiredAssessmentArtifacts(
  record: Pick<AssessmentGeneration, "ownerUid" | "artifacts">,
) {
  const artifacts = Object.values(record.artifacts ?? {});
  await Promise.all(
    artifacts.map((artifact) => deleteAssessmentArtifact(artifact, record.ownerUid)),
  );
}

async function purgeExpiredAssessmentGenerationRecord(record: AssessmentGeneration) {
  await purgeExpiredAssessmentArtifacts(record);

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("assessmentGenerations")
      .doc(record.id)
      .delete();
  } else {
    getMemoryStore().assessments.delete(record.id);
  }

  await appendAdminLog({
    actorUid: "system",
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
    action: "assessment-expired-cleanup",
    resourceType: "assessment",
    resourceId: record.id,
  });
}

async function persistDocumentRecord(record: DocumentRecord) {
  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("documents")
      .doc(record.id)
      .set(omitUndefinedOwnerRole(record), { merge: true });
  } else {
    getMemoryStore().documents.set(record.id, record);
  }
}

async function markPreviousDocumentsInactive(input: {
  ownerUid: string;
  activeDocumentId: string;
  supersededAt: string;
}) {
  const supersededDocuments: DocumentRecord[] = [];

  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("documents")
      .where("ownerUid", "==", input.ownerUid)
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();

    await Promise.all(
      snapshot.docs.map(async (documentSnapshot) => {
        if (documentSnapshot.id === input.activeDocumentId) {
          return;
        }

        const existing = documentSnapshot.data() as DocumentRecord;
        if (existing.isActive === false && existing.supersededAt) {
          return;
        }

        supersededDocuments.push(
          normalizeDocumentRecord(
            {
              ...existing,
              id: existing.id || documentSnapshot.id,
              isActive: false,
              supersededAt: existing.supersededAt ?? input.supersededAt,
              updatedAt: input.supersededAt,
            },
            null,
            normalizeStoredOwnerRole(existing.ownerRole),
          ),
        );

        await documentSnapshot.ref.set(
          {
            isActive: false,
            supersededAt: existing.supersededAt ?? input.supersededAt,
            updatedAt: input.supersededAt,
          } satisfies Partial<DocumentRecord>,
          { merge: true },
        );
      }),
    );

    return supersededDocuments;
  }

  const store = getMemoryStore();
  for (const [documentId, existing] of store.documents.entries()) {
    if (existing.ownerUid !== input.ownerUid || documentId === input.activeDocumentId) {
      continue;
    }

    store.documents.set(documentId, {
      ...existing,
      isActive: false,
      supersededAt: existing.supersededAt ?? input.supersededAt,
      updatedAt: input.supersededAt,
    });

    supersededDocuments.push(
      normalizeDocumentRecord(
        {
          ...existing,
          isActive: false,
          supersededAt: existing.supersededAt ?? input.supersededAt,
          updatedAt: input.supersededAt,
        },
        null,
        normalizeStoredOwnerRole(existing.ownerRole),
      ),
    );
  }

  return supersededDocuments;
}

function resolveProfileState(input: {
  role: UserRole;
  fullName: string | null;
  universityCode: string | null;
  profileCompletedAt: string | null | undefined;
  now: string;
}) {
  const completion = evaluateProfileCompletion({
    role: input.role,
    fullName: input.fullName,
    universityCode: input.universityCode,
  });

  return {
    fullName: completion.normalizedFullName ?? input.fullName ?? null,
    universityCode:
      completion.normalizedUniversityCode ?? input.universityCode ?? null,
    profileCompleted: completion.profileCompleted,
    profileCompletedAt: completion.profileCompleted
      ? input.profileCompletedAt ?? input.now
      : null,
  };
}

function buildUserDocumentFromAuthRecord(
  authUser: UserRecord,
  existing: UserDocument | null,
) {
  const now = toIsoTimestamp(new Date());
  const role = getRoleFromAuthClaims({
    email: authUser.email ?? existing?.email ?? null,
    admin: authUser.customClaims?.admin,
  });
  const createdAt = existing?.createdAt ?? toSafeIsoTimestamp(authUser.metadata.creationTime, now);
  const updatedAt =
    existing?.updatedAt ??
    toSafeIsoTimestamp(
      authUser.metadata.lastRefreshTime ??
        authUser.metadata.lastSignInTime ??
        authUser.metadata.creationTime,
      createdAt,
    );
  const profileState = resolveProfileState({
    role,
    fullName: existing?.fullName ?? null,
    universityCode: existing?.universityCode ?? null,
    profileCompletedAt: existing?.profileCompletedAt,
    now,
  });

  return {
    uid: authUser.uid,
    email: authUser.email ?? existing?.email ?? null,
    displayName: authUser.displayName ?? existing?.displayName ?? null,
    photoURL: authUser.photoURL ?? existing?.photoURL ?? null,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    role,
    status:
      existing?.status === "suspended" || authUser.disabled
        ? ("suspended" as const)
        : ("active" as const),
    preferences: existing?.preferences ?? {
      theme: "system",
      language: "en",
    },
    createdAt,
    updatedAt,
  } satisfies UserDocument;
}

async function listAllFirebaseAuthUsers() {
  const users: UserRecord[] = [];
  let nextPageToken: string | undefined;

  do {
    const page = await getFirebaseAdminAuth().listUsers(1000, nextPageToken);
    users.push(...page.users);
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return users;
}

export function getRoleFromAuthClaims(claims: {
  role?: unknown;
  admin?: unknown;
  email?: string | null;
}): UserRole {
  if (
    hasAdminAccessFromClaims({
      email: claims.email,
      admin: claims.admin,
    })
  ) {
    return "admin";
  }

  return "user";
}

export async function getUserByUid(uid: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("users")
      .doc(uid)
      .get();

    if (!snapshot.exists) {
      try {
        // Admin user management must be able to act on real Firebase Auth accounts even before
        // those accounts have hydrated a Firestore user document through a normal sign-in flow.
        const authUser = await getFirebaseAdminAuth().getUser(uid);
        const hydratedUser = buildUserDocumentFromAuthRecord(authUser, null);
        await getFirebaseAdminFirestore()
          .collection("users")
          .doc(uid)
          .set(hydratedUser, { merge: true });
        return hydratedUser;
      } catch (error) {
        if (
          typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === "auth/user-not-found"
        ) {
          return null;
        }

        throw error;
      }
    }

    return snapshot.data() as UserDocument;
  }

  return getMemoryStore().users.get(uid) ?? null;
}

export async function upsertUserFromAuth(input: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: UserRole;
}) {
  const now = toIsoTimestamp(new Date());
  const existing = await getUserByUid(input.uid);
  const role = input.role ?? existing?.role ?? "user";
  const profileState = resolveProfileState({
    role,
    fullName: existing?.fullName ?? null,
    universityCode: existing?.universityCode ?? null,
    profileCompletedAt: existing?.profileCompletedAt,
    now,
  });

  const nextUser: UserDocument = {
    uid: input.uid,
    email: input.email,
    displayName: input.displayName,
    photoURL: input.photoURL,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    role,
    status: existing?.status ?? "active",
    preferences: existing?.preferences ?? {
      theme: "system",
      language: "en",
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("users")
      .doc(input.uid)
      .set(nextUser, { merge: true });
  } else {
    getMemoryStore().users.set(input.uid, nextUser);
  }

  return nextUser;
}

export async function listUsers() {
  if (shouldUseFirestore()) {
    const [snapshot, authUsers] = await Promise.all([
      getFirebaseAdminFirestore().collection("users").get(),
      listAllFirebaseAuthUsers(),
    ]);
    const usersByUid = new Map<string, UserDocument>();

    for (const doc of snapshot.docs) {
      const user = doc.data() as UserDocument;
      usersByUid.set(user.uid, user);
    }

    // Admin visibility belongs to the full account inventory. Do not reintroduce a Firestore-only
    // or 100-user-limited view here, or blocking/auditing will silently miss real platform accounts.
    for (const authUser of authUsers) {
      usersByUid.set(
        authUser.uid,
        buildUserDocumentFromAuthRecord(authUser, usersByUid.get(authUser.uid) ?? null),
      );
    }

    return [...usersByUid.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  return [...getMemoryStore().users.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function setUserRole(uid: string, role: UserRole) {
  const user = await getUserByUid(uid);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  if (role === "admin" && !isAllowlistedAdminEmail(user.email)) {
    throw new Error(
      "Only the allowlisted admin emails may hold the admin role in this workspace.",
    );
  }

  const now = toIsoTimestamp(new Date());
  const profileState = resolveProfileState({
    role,
    fullName: user.fullName,
    universityCode: user.universityCode,
    profileCompletedAt: user.profileCompletedAt,
    now,
  });

  const nextUser: UserDocument = {
    ...user,
    role,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    updatedAt: now,
  };

  if (shouldUseFirestore()) {
    const auth = getFirebaseAdminAuth();
    const userRecord = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, {
      ...(userRecord.customClaims ?? {}),
      role,
      admin: role === "admin",
    });
    await auth.revokeRefreshTokens(uid);
    await getFirebaseAdminFirestore()
      .collection("users")
      .doc(uid)
      .set(nextUser, { merge: true });
  } else {
    getMemoryStore().users.set(uid, nextUser);
  }

  return nextUser;
}

export async function setUserStatus(uid: string, status: UserStatus) {
  const user = await getUserByUid(uid);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const nextUser: UserDocument = {
    ...user,
    status,
    updatedAt: toIsoTimestamp(new Date()),
  };

  if (shouldUseFirestore()) {
    // Blocking stays server-authoritative here: we mirror the workspace status into Firebase Auth
    // itself and revoke refresh tokens so an old session cannot keep bypassing the admin decision.
    await getFirebaseAdminAuth().updateUser(uid, {
      disabled: status === "suspended",
    });
    await getFirebaseAdminAuth().revokeRefreshTokens(uid);
    await getFirebaseAdminFirestore()
      .collection("users")
      .doc(uid)
      .set(nextUser, { merge: true });
  } else {
    getMemoryStore().users.set(uid, nextUser);
  }

  return nextUser;
}

export async function updateUserProfile(
  uid: string,
  profile: RequiredUserProfile,
) {
  const user = await getUserByUid(uid);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const now = toIsoTimestamp(new Date());
  const profileState = resolveProfileState({
    role: user.role,
    fullName: profile.fullName,
    universityCode: profile.universityCode,
    profileCompletedAt: user.profileCompletedAt,
    now,
  });

  const nextUser: UserDocument = {
    ...user,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    updatedAt: now,
  };

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("users")
      .doc(uid)
      .set(nextUser, { merge: true });
  } else {
    getMemoryStore().users.set(uid, nextUser);
  }

  return nextUser;
}

export async function appendAdminLog(input: Omit<AdminLogEntry, "id" | "createdAt">) {
  const entry: AdminLogEntry = {
    id: randomUUID(),
    createdAt: toIsoTimestamp(new Date()),
    ...input,
  };

  try {
    if (shouldUseFirestore()) {
      await getFirebaseAdminFirestore()
        .collection("adminActivityLogs")
        .doc(entry.id)
        .set(entry);
    } else {
      getMemoryStore().adminLogs.unshift(entry);
    }
  } catch {
    // Audit logging should stay observable but never break the primary auth/storage/export path.
  }
}

export async function listAdminActivityLogs(limit = 40) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("adminActivityLogs")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AdminLogEntry);
  }

  return getMemoryStore().adminLogs
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

async function listRawDocumentsForOwner(ownerUid: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("documents")
      .where("ownerUid", "==", ownerUid)
      .get();

    return snapshot.docs.map((doc) => {
      const record = doc.data() as DocumentRecord;
      return {
        ...record,
        id: record.id || doc.id,
      } as DocumentRecord;
    });
  }

  return [...getMemoryStore().documents.values()].filter(
    (record) => record.ownerUid === ownerUid,
  );
}

async function listRawAssessmentGenerationsForOwner(ownerUid: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("assessmentGenerations")
      .where("ownerUid", "==", ownerUid)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AssessmentGeneration);
  }

  return [...getMemoryStore().assessments.values()].filter(
    (record) => record.ownerUid === ownerUid,
  );
}

/* This explicit maintenance helper lets future admin-safe migrations backfill whole owner
   histories from authoritative role context instead of relying on repeated request-time repair.
   Keep it role-aware and ownerUid-scoped so admin/user datasets never bleed across owners. */
export async function backfillLegacyOwnerRolesForOwner(ownerUid: string) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({ ownerUid });
  if (!resolvedOwnerRole) {
    return {
      ownerUid,
      ownerRole: null,
      documentsUpdated: 0,
      assessmentsUpdated: 0,
    };
  }

  const [documents, assessments] = await Promise.all([
    listRawDocumentsForOwner(ownerUid),
    listRawAssessmentGenerationsForOwner(ownerUid),
  ]);
  const missingDocuments = documents.filter(
    (record) => !normalizeStoredOwnerRole(record.ownerRole),
  );
  const missingAssessments = assessments.filter(
    (record) => !normalizeStoredOwnerRole(record.ownerRole),
  );

  await Promise.all([
    ...missingDocuments.map((record) =>
      persistResolvedOwnerRoleBackfill("documents", record.id, resolvedOwnerRole),
    ),
    ...missingAssessments.map((record) =>
      persistResolvedOwnerRoleBackfill(
        "assessmentGenerations",
        record.id,
        resolvedOwnerRole,
      ),
    ),
  ]);

  return {
    ownerUid,
    ownerRole: resolvedOwnerRole,
    documentsUpdated: missingDocuments.length,
    assessmentsUpdated: missingAssessments.length,
  };
}

export async function saveDocument(record: DocumentRecord) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  const nextRecord: DocumentRecord = {
    ...record,
    ownerRole: resolvedOwnerRole,
    isActive: record.isActive !== false,
    supersededAt: record.isActive === false ? record.supersededAt ?? record.updatedAt : null,
    expiresAt: record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt),
  };

  await persistDocumentRecord(nextRecord);

  if (nextRecord.isActive) {
    const supersededDocuments = await markPreviousDocumentsInactive({
      ownerUid: nextRecord.ownerUid,
      activeDocumentId: nextRecord.id,
      supersededAt: nextRecord.updatedAt,
    });

    /* Replacing the active upload must retire the old source binary immediately so workspace
       uploads stay session-scoped and owner-isolated. Metadata can remain for history/readback,
       but the superseded source file itself must not linger in Storage after replacement. */
    await Promise.allSettled(
      supersededDocuments.map((supersededDocument) =>
        deleteDocumentBinaryFromStorage(supersededDocument),
      ),
    );
  }

  return nextRecord;
}

export async function listDocumentsForUser(ownerUid: string, limit = 20) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({ ownerUid });

  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("documents")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const rawDocuments = snapshot.docs.map((doc) => doc.data() as DocumentRecord);
    await backfillMissingOwnerRoles("documents", rawDocuments, resolvedOwnerRole);
    const documents = normalizeDocumentRecordList(rawDocuments, resolvedOwnerRole);
    const activeDocuments: DocumentRecord[] = [];

    for (const document of documents) {
      if (isDocumentExpired(document)) {
        await purgeExpiredDocumentRecord(document);
        continue;
      }

      activeDocuments.push(document);
    }

    return activeDocuments;
  }

  const rawDocuments = [...getMemoryStore().documents.values()]
    .filter((record) => record.ownerUid === ownerUid)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
  await backfillMissingOwnerRoles("documents", rawDocuments, resolvedOwnerRole);
  const documents = normalizeDocumentRecordList(rawDocuments, resolvedOwnerRole);

  const activeDocuments: DocumentRecord[] = [];
  for (const document of documents) {
    if (isDocumentExpired(document)) {
      await purgeExpiredDocumentRecord(document);
      continue;
    }

    activeDocuments.push(document);
  }

  return activeDocuments;
}

export async function getDocumentById(id: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("documents")
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const document = snapshot.data() as DocumentRecord;
    const fallbackDocuments = await listDocumentsForUser(document.ownerUid, 10);
    const fallbackActiveId =
      fallbackDocuments.find((record) => record.isActive)?.id ?? null;
    const resolvedOwnerRole = await resolvePersistedOwnerRole({
      ownerUid: document.ownerUid,
      ownerRole: document.ownerRole,
    });
    await backfillMissingOwnerRoles("documents", [document], resolvedOwnerRole);

    const normalizedDocument = normalizeDocumentRecord(
      document,
      fallbackActiveId,
      resolvedOwnerRole,
    );
    if (isDocumentExpired(normalizedDocument)) {
      await purgeExpiredDocumentRecord(normalizedDocument);
      return null;
    }

    return normalizedDocument;
  }

  const record = getMemoryStore().documents.get(id);
  if (!record) {
    return null;
  }

  const fallbackDocuments = await listDocumentsForUser(record.ownerUid, 10);
  const fallbackActiveId = fallbackDocuments.find((document) => document.isActive)?.id ?? null;
  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  await backfillMissingOwnerRoles("documents", [record], resolvedOwnerRole);

  const normalizedDocument = normalizeDocumentRecord(
    record,
    fallbackActiveId,
    resolvedOwnerRole,
  );
  if (isDocumentExpired(normalizedDocument)) {
    await purgeExpiredDocumentRecord(normalizedDocument);
    return null;
  }

  return normalizedDocument;
}

export async function getDocumentByIdForOwner(id: string, ownerUid: string) {
  const document = await getDocumentById(id);
  if (!document || document.ownerUid !== ownerUid) {
    return null;
  }

  return document;
}

export async function getActiveDocumentForOwner(ownerUid: string) {
  const documents = await listDocumentsForUser(ownerUid, 20);
  return documents.find((document) => document.isActive) ?? documents[0] ?? null;
}

async function promoteMostRecentDocumentActive(ownerUid: string) {
  const promotedAt = toIsoTimestamp(new Date());

  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("documents")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    const nextDocument = snapshot.docs[0];
    if (!nextDocument) {
      return null;
    }

    await nextDocument.ref.set(
      {
        isActive: true,
        supersededAt: null,
        updatedAt: promotedAt,
      } satisfies Partial<DocumentRecord>,
      { merge: true },
    );

    return nextDocument.data() as DocumentRecord;
  }

  const store = getMemoryStore();
  const nextDocument = [...store.documents.values()]
    .filter((document) => document.ownerUid === ownerUid)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (!nextDocument) {
    return null;
  }

  store.documents.set(nextDocument.id, {
    ...nextDocument,
    isActive: true,
    supersededAt: null,
    updatedAt: promotedAt,
  });

  return nextDocument;
}

export async function deleteDocumentForOwner(documentId: string, ownerUid: string) {
  const record = await getDocumentByIdForOwner(documentId, ownerUid);
  if (!record) {
    return null;
  }

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("documents")
      .doc(documentId)
      .delete();
  } else {
    getMemoryStore().documents.delete(documentId);
  }

  /* Removing the active upload should leave the workspace with one stable active source when older documents still exist.
     Future agents should preserve this promotion step so Upload and Assessment keep the current active-document contract. */
  if (record.isActive) {
    await promoteMostRecentDocumentActive(ownerUid);
  }

  return record;
}

export async function saveAssessmentGeneration(record: AssessmentGeneration) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  const normalizedRecord = normalizeAssessmentGenerationRecord(record, {
    resolvedOwnerRole,
  });

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("assessmentGenerations")
      .doc(normalizedRecord.id)
      .set(omitUndefinedOwnerRole(normalizedRecord), { merge: true });
  } else {
    getMemoryStore().assessments.set(normalizedRecord.id, normalizedRecord);
  }

  return normalizedRecord;
}

export async function listAssessmentGenerationsForUser(ownerUid: string, limit = 20) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({ ownerUid });

  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("assessmentGenerations")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const rawGenerations = snapshot.docs.map((doc) => doc.data() as AssessmentGeneration);
    await backfillMissingOwnerRoles(
      "assessmentGenerations",
      rawGenerations,
      resolvedOwnerRole,
    );
    const generations = rawGenerations.map((record) =>
      normalizeAssessmentGenerationRecord(record, {
        resolvedOwnerRole,
      }),
    );
    const activeGenerations: AssessmentGeneration[] = [];

    for (const generation of generations) {
      if (generation.status === "expired") {
        await purgeExpiredAssessmentGenerationRecord(generation);
        continue;
      }

      activeGenerations.push(generation);
    }

    return activeGenerations;
  }

  const rawGenerations = [...getMemoryStore().assessments.values()]
    .filter((record) => record.ownerUid === ownerUid)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
  await backfillMissingOwnerRoles(
    "assessmentGenerations",
    rawGenerations,
    resolvedOwnerRole,
  );
  const generations = rawGenerations.map((record) =>
    normalizeAssessmentGenerationRecord(record, {
      resolvedOwnerRole,
    }),
  );

  const activeGenerations: AssessmentGeneration[] = [];
  for (const generation of generations) {
    if (generation.status === "expired") {
      await purgeExpiredAssessmentGenerationRecord(generation);
      continue;
    }

    activeGenerations.push(generation);
  }

  return activeGenerations;
}

export async function getAssessmentGenerationById(id: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("assessmentGenerations")
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const record = snapshot.data() as AssessmentGeneration;
    const resolvedOwnerRole = await resolvePersistedOwnerRole({
      ownerUid: record.ownerUid,
      ownerRole: record.ownerRole,
    });
    await backfillMissingOwnerRoles(
      "assessmentGenerations",
      [record],
      resolvedOwnerRole,
    );

    return normalizeAssessmentGenerationRecord(record, {
      resolvedOwnerRole,
    });
  }

  const record = getMemoryStore().assessments.get(id);
  if (!record) {
    return null;
  }

  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  await backfillMissingOwnerRoles("assessmentGenerations", [record], resolvedOwnerRole);

  return normalizeAssessmentGenerationRecord(record, {
    resolvedOwnerRole,
  });
}

export async function getAssessmentGenerationForViewer(
  id: string,
  viewer: Pick<SessionUser, "uid" | "role">,
  options: {
    includeExpired?: boolean;
  } = {},
) {
  const generation = await getAssessmentGenerationById(id);
  if (!generation || !canViewOwnerOwnedRecord(generation.ownerUid, viewer)) {
    return null;
  }

  const lifecycle = getAssessmentStatus(generation);
  if (!options.includeExpired && lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
    return null;
  }

  if (lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
  }

  return generation;
}

export async function getAssessmentGenerationForOwner(
  id: string,
  ownerUid: string,
  options: {
    includeExpired?: boolean;
  } = {},
) {
  /* Regular preview/result/export/history routes must stay owner-only even when admins exist.
     Keep admin observation on separate code paths so platform oversight never piggybacks on
     the normal user artifact surfaces. */
  const generation = await getAssessmentGenerationById(id);
  if (!generation || generation.ownerUid !== ownerUid) {
    return null;
  }

  const lifecycle = getAssessmentStatus(generation);
  if (!options.includeExpired && lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
    return null;
  }

  if (lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
  }

  return generation;
}

export async function getAssessmentGenerationForAdminObservation(
  id: string,
  options: {
    includeExpired?: boolean;
  } = {},
) {
  // This explicit admin lane exists so admin-safe observability can be implemented without
  // reopening the user-facing preview/result/export routes to cross-owner access.
  const generation = await getAssessmentGenerationById(id);
  if (!generation) {
    return null;
  }

  const lifecycle = getAssessmentStatus(generation);
  if (!options.includeExpired && lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
    return null;
  }

  if (lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
  }

  return generation;
}

export async function saveInfographicGeneration(record: InfographicGeneration) {
  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("infographicGenerations")
      .doc(record.id)
      .set(record, { merge: true });
  } else {
    getMemoryStore().infographics.set(record.id, record);
  }

  return record;
}

export async function listInfographicGenerationsForUser(ownerUid: string, limit = 20) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("infographicGenerations")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as InfographicGeneration);
  }

  return [...getMemoryStore().infographics.values()]
    .filter((record) => record.ownerUid === ownerUid)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function getInfographicGenerationById(id: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("infographicGenerations")
      .doc(id)
      .get();

    return snapshot.exists ? (snapshot.data() as InfographicGeneration) : null;
  }

  return getMemoryStore().infographics.get(id) ?? null;
}

export async function getInfographicGenerationForViewer(
  id: string,
  viewer: Pick<SessionUser, "uid" | "role">,
) {
  const generation = await getInfographicGenerationById(id);
  if (!generation || !canViewOwnerOwnedRecord(generation.ownerUid, viewer)) {
    return null;
  }

  return generation;
}

export async function getInfographicGenerationForOwner(
  id: string,
  ownerUid: string,
) {
  /* Keep user-facing infographic readback owner-only so admin observation can evolve on a
     separate path without turning the normal user endpoint into a cross-owner surface. */
  const generation = await getInfographicGenerationById(id);
  if (!generation || generation.ownerUid !== ownerUid) {
    return null;
  }

  return generation;
}

async function countCollection(collectionName: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection(collectionName)
      .limit(500)
      .get();

    return snapshot.size;
  }

  const store = getMemoryStore();
  switch (collectionName) {
    case "documents":
      return store.documents.size;
    case "assessmentGenerations":
      return store.assessments.size;
    case "infographicGenerations":
      return store.infographics.size;
    default:
      return 0;
  }
}

export async function getAdminOverviewData(
  preloadedUsers?: UserDocument[],
): Promise<AdminOverview> {
  const users = preloadedUsers ?? await listUsers();

  return {
    totalUsers: users.length,
    activeUsers: users.filter((user) => user.status === "active").length,
    totalDocuments: await countCollection("documents"),
    totalAssessmentGenerations: await countCollection("assessmentGenerations"),
    totalInfographicGenerations: await countCollection("infographicGenerations"),
  };
}
