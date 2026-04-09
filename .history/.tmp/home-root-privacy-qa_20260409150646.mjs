import fs from "node:fs";
import path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import puppeteer from "puppeteer-core";

const DEFAULT_ADMIN_EMAILS = [
  "alahlyeagle@gmail.com",
  "elmahdy@admin.com",
  "alahlyeagle13@gmail.com",
];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
];

const SCENARIOS = [
  {
    locale: "en",
    expectedDir: "ltr",
    trustLabelSnippet: "Trust & Privacy",
    privacyLabelSnippet: "Privacy Policy",
  },
  {
    locale: "ar",
    expectedDir: "rtl",
    trustLabelSnippet: "الثقة والخصوصية",
    privacyLabelSnippet: "سياسة الخصوصية",
  },
];

const FIRESTORE_DATABASE_ID = "zootopia-club-next-database";
const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
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
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
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
    readEnv(envMap, "FIREBASE_PROJECT_ID") ||
    readEnv(envMap, "FIREBASE_ADMIN_PROJECT_ID") ||
    readEnv(envMap, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  const clientEmail =
    readEnv(envMap, "FIREBASE_CLIENT_EMAIL") ||
    readEnv(envMap, "FIREBASE_ADMIN_CLIENT_EMAIL");

  const privateKey = (
    readEnv(envMap, "FIREBASE_PRIVATE_KEY") ||
    readEnv(envMap, "FIREBASE_ADMIN_PRIVATE_KEY")
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

function getBrowserExecutablePath() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
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

async function selectActiveNonAdminFirestoreUser(firestore, adminEmailSet) {
  const snapshot = await firestore.collection("users").get();
  const candidates = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: String(data.email || "").trim().toLowerCase(),
        role: String(data.role || ""),
        status: String(data.status || ""),
        profileCompleted: data.profileCompleted === true,
      };
    })
    .filter((doc) => {
      return (
        doc.role === "user" &&
        doc.status === "active" &&
        doc.profileCompleted &&
        Boolean(doc.email) &&
        !adminEmailSet.has(doc.email)
      );
    });

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0];
}

async function main() {
  const workspaceRoot = process.cwd();
  const envMap = parseEnvFile(path.join(workspaceRoot, ".env.local"));

  const apiKey = readEnv(envMap, "NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is missing.");
  }

  const adminConfig = getFirebaseAdminConfig(envMap);
  if (!adminConfig.projectId || !adminConfig.clientEmail || !adminConfig.privateKey) {
    throw new Error("Firebase Admin credentials are missing from local env.");
  }

  const browserExecutablePath = getBrowserExecutablePath();
  if (!browserExecutablePath) {
    throw new Error("Chrome/Edge executable not found.");
  }

  const baseUrl = process.env.HOMEPAGE_QA_BASE_URL || "http://127.0.0.1:3025";

  const firebaseApp =
    getApps()[0] ||
    initializeApp({
      credential: cert({
        projectId: adminConfig.projectId,
        clientEmail: adminConfig.clientEmail,
        privateKey: adminConfig.privateKey,
      }),
      projectId: adminConfig.projectId,
    });

  const auth = getAuth(firebaseApp);
  const firestore = getFirestore(firebaseApp, FIRESTORE_DATABASE_ID);

  const adminEmails = getAdminEmails(envMap);
  const adminEmailSet = new Set(adminEmails.map((email) => email.toLowerCase()));

  const selectedFirestoreUser = await selectActiveNonAdminFirestoreUser(
    firestore,
    adminEmailSet,
  );

  if (!selectedFirestoreUser?.uid) {
    throw new Error("No active non-admin user found for homepage QA.");
  }

  const user = await auth.getUser(selectedFirestoreUser.uid);
  const customToken = await auth.createCustomToken(user.uid);
  const idToken = await exchangeCustomTokenForIdToken(apiKey, customToken);
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: 60 * 60 * 1000,
  });

  const browser = await puppeteer.launch({
    executablePath: browserExecutablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];

  for (const scenario of SCENARIOS) {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height });
      await page.setCookie(
        {
          name: "zc_session",
          value: sessionCookie,
          url: baseUrl,
          httpOnly: true,
        },
        {
          name: "zc_locale",
          value: scenario.locale,
          url: baseUrl,
        },
      );

      await page.goto(`${baseUrl}/`, { waitUntil: "networkidle2", timeout: 60000 });
      await page.evaluate(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      });

      const metrics = await page.evaluate((expected) => {
        const pathname = window.location.pathname;
        const direction = document.documentElement.getAttribute("dir") || "";

        const homeContainer = document.querySelector("div.space-y-8.animate-in.fade-in.duration-700");
        const textNodes = Array.from(document.querySelectorAll("p,span,h1,h2,h3,div"));
        const trustLabelNode = textNodes.find((node) =>
          String(node.textContent || "").includes(expected.trustLabelSnippet),
        );

        const trustSection = trustLabelNode ? trustLabelNode.closest("section") : null;
        const trustCard = trustLabelNode ? trustLabelNode.closest("div") : null;
        const privacyLink = trustSection
          ? trustSection.querySelector('a[href="/privacy"]')
          : null;

        const trustSectionRect = trustSection ? trustSection.getBoundingClientRect() : null;
        const trustCardClass = trustCard ? String(trustCard.className || "") : "";
        const linkRect = privacyLink ? privacyLink.getBoundingClientRect() : null;
        const linkStyle = privacyLink ? window.getComputedStyle(privacyLink) : null;

        const horizontalOverflow =
          Math.max(
            document.documentElement.scrollWidth || 0,
            document.body?.scrollWidth || 0,
          ) > window.innerWidth + 1;

        const isLastHomepageSection = Boolean(
          homeContainer && trustSection && homeContainer.lastElementChild === trustSection,
        );

        const linkVisible = Boolean(
          linkRect &&
            linkStyle &&
            linkRect.width > 0 &&
            linkRect.height > 0 &&
            linkStyle.visibility !== "hidden" &&
            linkStyle.display !== "none",
        );

        return {
          pathname,
          direction,
          trustLabelFound: Boolean(trustLabelNode),
          trustSectionFound: Boolean(trustSection),
          trustSectionVisible: Boolean(
            trustSectionRect && trustSectionRect.width > 0 && trustSectionRect.height > 0,
          ),
          trustCardClass,
          isLastHomepageSection,
          privacyLinkFound: Boolean(privacyLink),
          privacyLinkText: String(privacyLink?.textContent || ""),
          privacyLinkFontSize: Number.parseFloat(
            String(linkStyle?.fontSize || "0"),
          ),
          linkVisible,
          horizontalOverflow,
        };
      }, scenario);

      const pass =
        metrics.pathname === "/" &&
        metrics.direction === scenario.expectedDir &&
        metrics.trustLabelFound &&
        metrics.trustSectionFound &&
        metrics.trustSectionVisible &&
        metrics.isLastHomepageSection &&
        metrics.privacyLinkFound &&
        metrics.linkVisible &&
        metrics.privacyLinkText.includes(scenario.privacyLabelSnippet) &&
        metrics.privacyLinkFontSize >= 14 &&
        metrics.trustCardClass.includes("rounded-[1.35rem]") &&
        !metrics.horizontalOverflow;

      results.push({
        scenario: scenario.locale,
        viewport: viewport.name,
        pass,
        ...metrics,
      });

      await page.close();
    }
  }

  await browser.close();

  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((item) => !item.pass);
  if (failed.length > 0) {
    console.error("HOMEPAGE_PRIVACY_QA_FAILED");
    console.error(JSON.stringify(failed, null, 2));
    process.exit(1);
  }
}

await main();
