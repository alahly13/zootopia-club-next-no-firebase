import { apiError, apiSuccess } from "@/lib/server/api";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const RECAPTCHA_ENTERPRISE_EXPECTED_ACTION = "phone_verification_send_otp";
const RECAPTCHA_ENTERPRISE_VERIFY_RATE_LIMIT_MAX_REQUESTS = 10;
const RECAPTCHA_ENTERPRISE_VERIFY_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RECAPTCHA_ENTERPRISE_VERIFY_ENDPOINT =
  "https://www.google.com/recaptcha/api/siteverify";
const RECAPTCHA_ENTERPRISE_DEFAULT_MIN_SCORE = 0.5;

type RecaptchaEnterpriseSiteVerifyResponse = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

function readEnvValue(value: string | undefined) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function getRecaptchaEnterpriseSecretKey() {
  return (
    readEnvValue(process.env.RECAPTCHA_ENTERPRISE_SECRET_KEY) ||
    readEnvValue(process.env.RECAPTCHA_SECRET_KEY)
  );
}

function getRecaptchaEnterpriseMinScore() {
  const configured = readEnvValue(process.env.RECAPTCHA_ENTERPRISE_MIN_SCORE);
  if (!configured) return RECAPTCHA_ENTERPRISE_DEFAULT_MIN_SCORE;

  const parsed = Number(configured);
  if (!Number.isFinite(parsed)) return RECAPTCHA_ENTERPRISE_DEFAULT_MIN_SCORE;
  if (parsed < 0 || parsed > 1) return RECAPTCHA_ENTERPRISE_DEFAULT_MIN_SCORE;

  return parsed;
}

function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstForwardedIp = forwarded.split(",")[0]?.trim();
    if (firstForwardedIp) return firstForwardedIp;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || null;
}

function normalizeErrorCodes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError(
      "UNAUTHENTICATED",
      "Sign in is required before phone OTP checks can run.",
      401,
    );
  }

  /* This rate-limit is scoped to the Settings send-OTP security precheck.
     Keep it server-side so repeated token spam cannot hammer Enterprise verify
     calls even if the browser retries aggressively. */
  const rateLimit = checkRequestRateLimit({
    request,
    scope: "settings-phone-recaptcha-enterprise-verify",
    maxRequests: RECAPTCHA_ENTERPRISE_VERIFY_RATE_LIMIT_MAX_REQUESTS,
    windowMs: RECAPTCHA_ENTERPRISE_VERIFY_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const blocked = apiError(
      "RECAPTCHA_ENTERPRISE_RATE_LIMITED",
      "Too many security verification attempts. Please retry shortly.",
      429,
    );
    blocked.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    blocked.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rateLimit.resetAtMs / 1000)),
    );
    return blocked;
  }

  const secretKey = getRecaptchaEnterpriseSecretKey();
  if (!secretKey) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_VERIFY_CONFIG_MISSING",
      "reCAPTCHA Enterprise verification is not configured on the server.",
      503,
    );
  }

  let body: {
    token?: string;
    action?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const token = String(body.token || "").trim();
  const action = String(body.action || "").trim();

  if (!token) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_TOKEN_REQUIRED",
      "A reCAPTCHA Enterprise token is required.",
      400,
    );
  }

  if (!action) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_ACTION_REQUIRED",
      "A reCAPTCHA Enterprise action is required.",
      400,
    );
  }

  if (action !== RECAPTCHA_ENTERPRISE_EXPECTED_ACTION) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_ACTION_MISMATCH",
      "Unexpected reCAPTCHA Enterprise action for phone OTP send.",
      400,
    );
  }

  const formBody = new URLSearchParams();
  formBody.set("secret", secretKey);
  formBody.set("response", token);

  const requestIp = getRequestIp(request);
  if (requestIp) {
    formBody.set("remoteip", requestIp);
  }

  let verifyResponse: Response;
  try {
    verifyResponse = await fetch(RECAPTCHA_ENTERPRISE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
      cache: "no-store",
    });
  } catch {
    return apiError(
      "RECAPTCHA_ENTERPRISE_VERIFY_FAILED",
      "Unable to verify the reCAPTCHA Enterprise token right now.",
      502,
    );
  }

  if (!verifyResponse.ok) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_VERIFY_FAILED",
      "Unable to verify the reCAPTCHA Enterprise token right now.",
      502,
    );
  }

  let verifyPayload: RecaptchaEnterpriseSiteVerifyResponse;
  try {
    verifyPayload =
      (await verifyResponse.json()) as RecaptchaEnterpriseSiteVerifyResponse;
  } catch {
    return apiError(
      "RECAPTCHA_ENTERPRISE_VERIFY_RESPONSE_INVALID",
      "Security verification returned an invalid response.",
      502,
    );
  }

  const errorCodes = normalizeErrorCodes(verifyPayload["error-codes"]);

  /* Execute tokens are short-lived and one-time use. Map timeout-or-duplicate
     to an explicit expiry code so the Settings page can ask for a fresh send
     attempt without changing Firebase OTP ownership. */
  if (!verifyPayload.success) {
    if (errorCodes.includes("timeout-or-duplicate")) {
      return apiError(
        "RECAPTCHA_ENTERPRISE_TOKEN_EXPIRED",
        "The reCAPTCHA Enterprise token expired. Please try again.",
        400,
      );
    }

    return apiError(
      "RECAPTCHA_ENTERPRISE_TOKEN_INVALID",
      "The reCAPTCHA Enterprise token is invalid.",
      400,
    );
  }

  const verifiedAction = String(verifyPayload.action || "").trim();
  if (verifiedAction !== RECAPTCHA_ENTERPRISE_EXPECTED_ACTION) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_ACTION_MISMATCH",
      "reCAPTCHA Enterprise action verification failed.",
      400,
    );
  }

  const score = Number(verifyPayload.score);
  if (!Number.isFinite(score)) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_VERIFY_RESPONSE_INVALID",
      "Security verification returned an invalid score.",
      502,
    );
  }

  const minScore = getRecaptchaEnterpriseMinScore();
  if (score < minScore) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_RISK_TOO_HIGH",
      "Security verification blocked this request. Please try again later.",
      403,
    );
  }

  return apiSuccess({
    score,
    action: verifiedAction,
    hostname:
      typeof verifyPayload.hostname === "string" && verifyPayload.hostname.trim()
        ? verifyPayload.hostname.trim()
        : null,
  });
}
