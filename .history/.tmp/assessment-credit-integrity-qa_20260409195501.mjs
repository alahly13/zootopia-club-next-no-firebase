import fs from "node:fs";
import path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import ExcelJS from "exceljs";

const DEFAULT_ADMIN_EMAILS = [
  "alahlyeagle@gmail.com",
  "elmahdy@admin.com",
  "alahlyeagle13@gmail.com",
];

function parseEnvFile(envFilePath) {
  if (!fs.existsSync(envFilePath)) {
    return {};
  }

  const output = {};
  const lines = fs.readFileSync(envFilePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    output[key] = value;
  }

  return output;
}

function readEnv(envMap, key) {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.trim().length > 0) {
    return fromProcess.trim();
  }

  const fromFile = envMap[key];
  if (typeof fromFile === "string" && fromFile.trim().length > 0) {
    return fromFile.trim();
  }

  return "";
}

function getFirebaseAdminConfig(envMap) {
  const projectId =
    readEnv(envMap, "FIREBASE_PROJECT_ID")
    || readEnv(envMap, "FIREBASE_ADMIN_PROJECT_ID")
    || readEnv(envMap, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  const clientEmail =
    readEnv(envMap, "FIREBASE_CLIENT_EMAIL")
    || readEnv(envMap, "FIREBASE_ADMIN_CLIENT_EMAIL");

  const privateKey = (
    readEnv(envMap, "FIREBASE_PRIVATE_KEY")
    || readEnv(envMap, "FIREBASE_ADMIN_PRIVATE_KEY")
  ).replace(/\\n/g, "\n");

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function getAdminEmails(envMap) {
  const configured = readEnv(envMap, "ZOOTOPIA_ADMIN_EMAILS");
  if (!configured) {
    return [...DEFAULT_ADMIN_EMAILS];
  }

  const parsed = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return parsed.length > 0 ? [...new Set(parsed)] : [...DEFAULT_ADMIN_EMAILS];
}

async function selectVerifiedAdminUser(auth, candidateEmails) {
  for (const email of candidateEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      if (user.customClaims?.admin === true && user.disabled !== true) {
        return user;
      }
    } catch {
      // Continue scanning allowlisted candidates.
    }
  }

  return null;
}

async function exchangeCustomTokenForIdToken(apiKey, customToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.idToken !== "string") {
    throw new Error(`Unable to exchange custom token for ID token (${response.status}).`);
  }

  return payload.idToken;
}

async function createSessionCookieForUid(input) {
  const claims = input.claims ?? undefined;
  const customToken = await input.auth.createCustomToken(input.uid, claims);
  const idToken = await exchangeCustomTokenForIdToken(input.apiKey, customToken);
  return input.auth.createSessionCookie(idToken, {
    expiresIn: 60 * 60 * 1000,
  });
}

function normalizeCellValue(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }

    if ("result" in value) {
      return normalizeCellValue(value.result);
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((entry) => String(entry.text || "")).join("");
    }
  }

  return String(value).trim();
}

async function fetchWithSession(input) {
  const headers = {
    ...(input.headers ?? {}),
  };

  if (input.sessionCookie) {
    headers.cookie = `zc_session=${input.sessionCookie}; zc_theme=light; zc_locale=en`;
  }

  return fetch(`${input.baseUrl}${input.pathName}`, {
    method: input.method ?? "GET",
    headers,
    body: input.body,
    redirect: "manual",
  });
}

async function parseApiResponse(response) {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    payload,
    text,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function expectCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getNumericDelta(before, after) {
  if (typeof before !== "number" || typeof after !== "number") {
    return null;
  }

  return after - before;
}

async function main() {
  const workspaceRoot = process.cwd();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(
    workspaceRoot,
    "output",
    "playwright",
    "assessment-credit-integrity",
    runId,
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const envMap = parseEnvFile(path.join(workspaceRoot, ".env.local"));
  const apiKey = readEnv(envMap, "NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is missing.");
  }

  const adminConfig = getFirebaseAdminConfig(envMap);
  if (!adminConfig.projectId || !adminConfig.clientEmail || !adminConfig.privateKey) {
    throw new Error("Firebase Admin credentials are missing from local env.");
  }

  const baseUrl = process.env.ASSESSMENT_CREDIT_QA_BASE_URL || "http://127.0.0.1:3025";

  const firebaseApp =
    getApps()[0]
    || initializeApp({
      credential: cert({
        projectId: adminConfig.projectId,
        clientEmail: adminConfig.clientEmail,
        privateKey: adminConfig.privateKey,
      }),
      projectId: adminConfig.projectId,
    });

  const auth = getAuth(firebaseApp);
  const adminEmails = getAdminEmails(envMap);
  const adminUser = await selectVerifiedAdminUser(auth, adminEmails);
  if (!adminUser?.uid) {
    throw new Error("No allowlisted admin user with admin: true was found.");
  }

  const adminSessionCookie = await createSessionCookieForUid({
    auth,
    apiKey,
    uid: adminUser.uid,
    claims: { admin: true },
  });

  async function adminGetUsers() {
    const response = await fetchWithSession({
      baseUrl,
      sessionCookie: adminSessionCookie,
      pathName: "/api/admin/users",
    });
    const parsed = await parseApiResponse(response);
    expectCondition(parsed.status === 200 && parsed.payload?.ok === true, `Admin users list failed (${parsed.status}).`);
    return parsed.payload.data.users;
  }

  async function adminGetCredits(uid) {
    const response = await fetchWithSession({
      baseUrl,
      sessionCookie: adminSessionCookie,
      pathName: `/api/admin/users/${encodeURIComponent(uid)}/credits`,
    });
    const parsed = await parseApiResponse(response);
    expectCondition(parsed.status === 200 && parsed.payload?.ok === true, `Admin credits GET failed for ${uid} (${parsed.status}).`);
    return parsed.payload.data;
  }

  async function adminPatchCredits(uid, mutation, expectedStatus = 200) {
    const response = await fetchWithSession({
      baseUrl,
      sessionCookie: adminSessionCookie,
      pathName: `/api/admin/users/${encodeURIComponent(uid)}/credits`,
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(mutation),
    });

    const parsed = await parseApiResponse(response);
    expectCondition(
      parsed.status === expectedStatus,
      `Admin credits PATCH expected ${expectedStatus}, got ${parsed.status} for ${uid}. Body: ${parsed.text}`,
    );

    return parsed;
  }

  const users = await adminGetUsers();
  const activeNonAdminUsers = users.filter(
    (user) => user.role === "user" && user.status === "active",
  );
  const completedCandidates = activeNonAdminUsers.filter(
    (user) => user.profileCompleted === true,
  );

  if (activeNonAdminUsers.length < 2) {
    throw new Error("Need at least two active non-admin users for cross-user credit checks.");
  }

  const userA = completedCandidates[0] ?? activeNonAdminUsers[0];
  const userB = activeNonAdminUsers.find((user) => user.uid !== userA.uid) ?? null;
  if (!userB) {
    throw new Error("Unable to select a distinct user B for cross-user credit checks.");
  }

  const generationChecksEligible = completedCandidates.length > 0;
  const generationChecksSkipReason = generationChecksEligible
    ? null
    : "No active profile-complete non-admin user was available in this environment.";

  const userASessionCookie = await createSessionCookieForUid({
    auth,
    apiKey,
    uid: userA.uid,
  });
  const userBSessionCookie = await createSessionCookieForUid({
    auth,
    apiKey,
    uid: userB.uid,
  });

  async function getUserCredits(sessionCookie) {
    const response = await fetchWithSession({
      baseUrl,
      sessionCookie,
      pathName: "/api/assessment/credits",
    });
    const parsed = await parseApiResponse(response);
    expectCondition(parsed.status === 200 && parsed.payload?.ok === true, `Assessment credits endpoint failed (${parsed.status}).`);
    return parsed.payload.data.credits;
  }

  async function postAssessment(sessionCookie, body, idempotencyKey) {
    const response = await fetchWithSession({
      baseUrl,
      sessionCookie,
      pathName: "/api/assessment",
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });

    return parseApiResponse(response);
  }

  // Normalize baseline state so delta checks are deterministic.
  await adminPatchCredits(userA.uid, { action: "set_access", access: "enabled" });
  await adminPatchCredits(userA.uid, { action: "set_manual_credits", amount: 5 });
  await adminPatchCredits(userA.uid, { action: "clear_daily_override" });

  await adminPatchCredits(userB.uid, { action: "set_access", access: "enabled" });
  await adminPatchCredits(userB.uid, { action: "set_manual_credits", amount: 7 });
  await adminPatchCredits(userB.uid, { action: "clear_daily_override" });

  const baselineA = await getUserCredits(userASessionCookie);
  const baselineB = await getUserCredits(userBSessionCookie);
  let generationId = null;
  let firstAttempt = null;
  let replayAttempt = null;
  let invalidAttempt = null;
  let crossUserReadParsed = null;
  let afterFirstA = baselineA;
  let afterFirstB = baselineB;
  let afterReplayA = baselineA;
  let afterInvalidA = baselineA;
  let usedDeltaA = null;
  let remainingDeltaA = null;
  let usedDeltaB = null;
  let remainingDeltaB = null;

  if (generationChecksEligible) {
    const generationPayload = {
      prompt: `Credit integrity QA ${runId}`,
      options: {
        mode: "question_generation",
        questionCount: 10,
        difficulty: "easy",
        language: "en",
        questionTypes: ["mcq"],
        questionTypeDistribution: [{ type: "mcq", percentage: 100 }],
      },
    };

    const idempotencyKey = `credit-qa-${runId}-a`;
    firstAttempt = await postAssessment(userASessionCookie, generationPayload, idempotencyKey);
    expectCondition(firstAttempt.status === 200 && firstAttempt.payload?.ok === true, `First assessment generation failed (${firstAttempt.status}): ${firstAttempt.text}`);

    generationId = firstAttempt.payload.data.generation?.id;
    expectCondition(typeof generationId === "string" && generationId.length > 0, "Generation id missing after successful assessment request.");

    afterFirstA = await getUserCredits(userASessionCookie);
    afterFirstB = await getUserCredits(userBSessionCookie);

    usedDeltaA = getNumericDelta(baselineA.usedCount, afterFirstA.usedCount);
    remainingDeltaA =
      typeof baselineA.remainingCount === "number" && typeof afterFirstA.remainingCount === "number"
        ? afterFirstA.remainingCount - baselineA.remainingCount
        : null;

    expectCondition(
      usedDeltaA === 1 || remainingDeltaA === -1,
      `User A credit delta is invalid. usedDelta=${usedDeltaA}, remainingDelta=${remainingDeltaA}`,
    );

    usedDeltaB = getNumericDelta(baselineB.usedCount, afterFirstB.usedCount);
    remainingDeltaB =
      typeof baselineB.remainingCount === "number" && typeof afterFirstB.remainingCount === "number"
        ? afterFirstB.remainingCount - baselineB.remainingCount
        : null;

    expectCondition(usedDeltaB === 0, `User B usedCount changed unexpectedly (${usedDeltaB}).`);
    if (remainingDeltaB !== null) {
      expectCondition(remainingDeltaB === 0, `User B remainingCount changed unexpectedly (${remainingDeltaB}).`);
    }

    replayAttempt = await postAssessment(userASessionCookie, generationPayload, idempotencyKey);
    expectCondition(replayAttempt.status === 200 && replayAttempt.payload?.ok === true, `Replay request failed (${replayAttempt.status}): ${replayAttempt.text}`);
    expectCondition(
      replayAttempt.payload.data.generation?.id === generationId,
      "Replay request did not return the same generation id.",
    );

    afterReplayA = await getUserCredits(userASessionCookie);
    expectCondition(
      getNumericDelta(afterFirstA.usedCount, afterReplayA.usedCount) === 0,
      "Replay request incremented usedCount unexpectedly.",
    );
    if (typeof afterFirstA.remainingCount === "number" && typeof afterReplayA.remainingCount === "number") {
      expectCondition(
        afterReplayA.remainingCount - afterFirstA.remainingCount === 0,
        "Replay request decremented remainingCount unexpectedly.",
      );
    }

    const crossUserRead = await fetchWithSession({
      baseUrl,
      sessionCookie: userBSessionCookie,
      pathName: `/api/assessment/${encodeURIComponent(generationId)}`,
    });
    crossUserReadParsed = await parseApiResponse(crossUserRead);
    expectCondition(
      crossUserReadParsed.status === 404 || crossUserReadParsed.status === 403,
      `Cross-user assessment read should be blocked but returned ${crossUserReadParsed.status}.`,
    );

    const beforeInvalidA = await getUserCredits(userASessionCookie);
    invalidAttempt = await postAssessment(userASessionCookie, {}, `credit-qa-${runId}-invalid`);
    expectCondition(
      invalidAttempt.status === 400,
      `Invalid assessment request should fail with 400, got ${invalidAttempt.status}.`,
    );

    afterInvalidA = await getUserCredits(userASessionCookie);
    expectCondition(
      getNumericDelta(beforeInvalidA.usedCount, afterInvalidA.usedCount) === 0,
      "Failed assessment request changed usedCount unexpectedly.",
    );
    if (typeof beforeInvalidA.remainingCount === "number" && typeof afterInvalidA.remainingCount === "number") {
      expectCondition(
        afterInvalidA.remainingCount - beforeInvalidA.remainingCount === 0,
        "Failed assessment request changed remainingCount unexpectedly.",
      );
    }
  }

  const adminStateBeforeManual = await adminGetCredits(userA.uid);
  const manualBefore = adminStateBeforeManual.state.account.manualCredits;
  await adminPatchCredits(userA.uid, { action: "add_manual_credits", amount: 2 });
  const adminStateAfterManual = await adminGetCredits(userA.uid);
  const manualAfter = adminStateAfterManual.state.account.manualCredits;
  expectCondition(manualAfter === manualBefore + 2, `Manual credits mutation mismatch: before=${manualBefore}, after=${manualAfter}.`);

  const selfMutation = await adminPatchCredits(
    adminUser.uid,
    { action: "set_manual_credits", amount: 10 },
    403,
  );
  expectCondition(
    selfMutation.payload?.ok === false
      && selfMutation.payload?.error?.code === "ASSESSMENT_CREDIT_SELF_MUTATION_FORBIDDEN",
    "Admin self-mutation guard did not return the expected error code.",
  );

  const exportResponse = await fetchWithSession({
    baseUrl,
    sessionCookie: adminSessionCookie,
    pathName: "/api/admin/users/export",
  });
  expectCondition(exportResponse.status === 200, `Admin export failed (${exportResponse.status}).`);

  const workbookBuffer = Buffer.from(await exportResponse.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBuffer);
  const worksheet = workbook.getWorksheet("Users");
  expectCondition(Boolean(worksheet), "Users worksheet is missing from export workbook.");

  const headerCells = worksheet.getRow(1).values;
  const headers = Array.isArray(headerCells)
    ? headerCells.slice(1).map((value) => normalizeCellValue(value))
    : [];

  const requiredCreditHeaders = [
    "Assessment Access",
    "Assessment Daily Limit",
    "Assessment Used Today",
    "Assessment Daily Remaining",
    "Assessment Manual Credits",
    "Assessment Grant Credits",
    "Assessment Extra Credits",
    "Assessment Total Remaining",
  ];

  for (const header of requiredCreditHeaders) {
    expectCondition(headers.includes(header), `Export workbook is missing credit header: ${header}`);
  }

  const headerIndexByName = new Map(headers.map((header, index) => [header, index + 1]));

  function readRowByUid(uid) {
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const uidValue = normalizeCellValue(row.getCell(headerIndexByName.get("UID")).value);
      if (uidValue === uid) {
        return row;
      }
    }

    return null;
  }

  const exportedRowA = readRowByUid(userA.uid);
  const exportedRowB = readRowByUid(userB.uid);
  expectCondition(Boolean(exportedRowA), "Export workbook does not contain user A row.");
  expectCondition(Boolean(exportedRowB), "Export workbook does not contain user B row.");

  const finalStateA = await adminGetCredits(userA.uid);
  const finalStateB = await adminGetCredits(userB.uid);

  function cellText(row, header) {
    const index = headerIndexByName.get(header);
    return normalizeCellValue(row.getCell(index).value);
  }

  expectCondition(
    cellText(exportedRowA, "Assessment Access") === "Enabled",
    "Exported assessment access for user A is incorrect.",
  );
  expectCondition(
    cellText(exportedRowA, "Assessment Manual Credits")
      === String(finalStateA.state.account.manualCredits),
    "Exported manual credits for user A are incorrect.",
  );
  expectCondition(
    cellText(exportedRowA, "Assessment Total Remaining")
      === String(finalStateA.state.credits.remainingCount ?? ""),
    "Exported total remaining for user A is incorrect.",
  );

  expectCondition(
    cellText(exportedRowB, "Assessment Manual Credits")
      === String(finalStateB.state.account.manualCredits),
    "Exported manual credits for user B are incorrect.",
  );

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    adminUid: adminUser.uid,
    userA: {
      uid: userA.uid,
      email: userA.email,
      generationId,
      baselineCredits: baselineA,
      afterFirstCredits: afterFirstA,
      afterReplayCredits: afterReplayA,
      afterInvalidCredits: afterInvalidA,
      finalAdminState: finalStateA.state,
    },
    userB: {
      uid: userB.uid,
      email: userB.email,
      baselineCredits: baselineB,
      afterUserAFirstCredits: afterFirstB,
      finalAdminState: finalStateB.state,
    },
    checks: {
      firstSuccessStatus: firstAttempt.status,
      replayStatus: replayAttempt.status,
      invalidStatus: invalidAttempt.status,
      crossUserReadStatus: crossUserReadParsed.status,
      adminSelfMutationStatus: selfMutation.status,
      exportStatus: exportResponse.status,
      usedDeltaA,
      remainingDeltaA,
      usedDeltaB,
      remainingDeltaB,
    },
  };

  const reportPath = path.join(outputDir, "assessment-credit-integrity-qa-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Assessment credit integrity QA completed.");
  console.log(`Report: ${reportPath}`);
  console.log(
    JSON.stringify(
      {
        userA: {
          uid: userA.uid,
          usedDeltaA,
          remainingDeltaA,
        },
        userB: {
          uid: userB.uid,
          usedDeltaB,
          remainingDeltaB,
        },
        crossUserReadStatus: crossUserReadParsed.status,
        exportStatus: exportResponse.status,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Assessment credit integrity QA failed.");
  console.error(error);
  process.exitCode = 1;
});
