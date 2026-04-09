import { apiError, apiSuccess } from "@/lib/server/api";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { getAuthenticatedSessionUser } from "@/lib/server/session";
import {
  RecaptchaEnterpriseServiceClient,
  type protos,
} from "@google-cloud/recaptcha-enterprise";

export const runtime = "nodejs";

const RECAPTCHA_ENTERPRISE_EXPECTED_ACTION = "phone_verification_send_otp";
const RECAPTCHA_ENTERPRISE_VERIFY_RATE_LIMIT_MAX_REQUESTS = 10;
const RECAPTCHA_ENTERPRISE_VERIFY_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RECAPTCHA_ENTERPRISE_DEFAULT_MIN_SCORE = 0.5;

let recaptchaEnterpriseClient: RecaptchaEnterpriseServiceClient | null = null;

type RecaptchaEnterpriseAssessmentOutcome =
  | {
      ok: true;
      score: number;
      action: string;
      hostname: string | null;
      reasons: string[];
      assessmentName: string | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
      status: number;
    };

function readEnvValue(value: string | undefined) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function getRecaptchaEnterpriseProjectId() {
  return (
    readEnvValue(process.env.RECAPTCHA_ENTERPRISE_PROJECT_ID) ||
    readEnvValue(process.env.FIREBASE_PROJECT_ID) ||
    readEnvValue(process.env.GOOGLE_CLOUD_PROJECT) ||
    readEnvValue(process.env.GCLOUD_PROJECT) ||
    readEnvValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  );
}

function getRecaptchaEnterpriseSiteKey() {
  return (
    readEnvValue(process.env.RECAPTCHA_ENTERPRISE_SITE_KEY) ||
    readEnvValue(process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY)
  );
}

function getRecaptchaEnterpriseAssessmentConfig() {
  const projectId = getRecaptchaEnterpriseProjectId();
  const siteKey = getRecaptchaEnterpriseSiteKey();
  if (!projectId || !siteKey) return null;
  return { projectId, siteKey };
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

function getRecaptchaEnterpriseClient() {
  if (!recaptchaEnterpriseClient) {
    recaptchaEnterpriseClient = new RecaptchaEnterpriseServiceClient();
  }

  return recaptchaEnterpriseClient;
}

function normalizeTokenInvalidReason(
  input:
    | protos.google.cloud.recaptchaenterprise.v1.TokenProperties.InvalidReason
    | keyof typeof protos.google.cloud.recaptchaenterprise.v1.TokenProperties.InvalidReason
    | null
    | undefined,
) {
  if (typeof input === "string") {
    const normalized = input.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof input === "number") {
    switch (input) {
      case 3:
        return "EXPIRED";
      case 4:
        return "DUPE";
      case 6:
        return "BROWSER_ERROR";
      default:
        return String(input);
    }
  }

  return null;
}

function isTokenExpiredLikeReason(reason: string | null) {
  if (!reason) return false;
  return (
    reason === "EXPIRED" ||
    reason === "DUPE" ||
    reason === "BROWSER_ERROR" ||
    reason === "TIMEOUT_OR_DUPLICATE"
  );
}

function normalizeAssessmentReasons(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (typeof item === "number" && Number.isFinite(item)) return String(item);
      return "";
    })
    .filter((item) => item.length > 0);
}

async function verifyRecaptchaEnterpriseWithCreateAssessment(params: {
  projectId: string;
  siteKey: string;
  token: string;
  action: string;
  requestIp: string | null;
  userAgent: string | null;
}): Promise<RecaptchaEnterpriseAssessmentOutcome> {
  const client = getRecaptchaEnterpriseClient();

  const event: protos.google.cloud.recaptchaenterprise.v1.IEvent = {
    siteKey: params.siteKey,
    token: params.token,
    expectedAction: params.action,
  };

  if (params.requestIp) {
    event.userIpAddress = params.requestIp;
  }

  if (params.userAgent) {
    event.userAgent = params.userAgent;
  }

  let assessment: protos.google.cloud.recaptchaenterprise.v1.IAssessment;
  try {
    [assessment] = await client.createAssessment({
      parent: client.projectPath(params.projectId),
      assessment: { event },
    });
  } catch {
    return {
      ok: false,
      code: "RECAPTCHA_ENTERPRISE_VERIFY_FAILED",
      message: "Unable to verify the reCAPTCHA Enterprise token right now.",
      status: 502,
    };
  }

  const tokenProperties = assessment.tokenProperties;
  if (!tokenProperties?.valid) {
    const invalidReason = normalizeTokenInvalidReason(tokenProperties?.invalidReason);

    if (isTokenExpiredLikeReason(invalidReason)) {
      return {
        ok: false,
        code: "RECAPTCHA_ENTERPRISE_TOKEN_EXPIRED",
        message: "The reCAPTCHA Enterprise token expired. Please try again.",
        status: 400,
      };
    }

    return {
      ok: false,
      code: "RECAPTCHA_ENTERPRISE_TOKEN_INVALID",
      message: "The reCAPTCHA Enterprise token is invalid.",
      status: 400,
    };
  }

  const verifiedAction = String(tokenProperties.action || "").trim();
  if (verifiedAction !== RECAPTCHA_ENTERPRISE_EXPECTED_ACTION) {
    return {
      ok: false,
      code: "RECAPTCHA_ENTERPRISE_ACTION_MISMATCH",
      message: "reCAPTCHA Enterprise action verification failed.",
      status: 400,
    };
  }

  const score = Number(assessment.riskAnalysis?.score);
  if (!Number.isFinite(score)) {
    return {
      ok: false,
      code: "RECAPTCHA_ENTERPRISE_VERIFY_RESPONSE_INVALID",
      message: "Security verification returned an invalid score.",
      status: 502,
    };
  }

  const reasons = [
    ...normalizeAssessmentReasons(assessment.riskAnalysis?.reasons),
    ...normalizeAssessmentReasons(assessment.riskAnalysis?.extendedVerdictReasons),
  ];

  return {
    ok: true,
    score,
    action: verifiedAction,
    hostname:
      typeof tokenProperties.hostname === "string" && tokenProperties.hostname.trim()
        ? tokenProperties.hostname.trim()
        : null,
    reasons: Array.from(new Set(reasons)),
    assessmentName:
      typeof assessment.name === "string" && assessment.name.trim()
        ? assessment.name.trim()
        : null,
  };
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

  const requestIp = getRequestIp(request);

  const minScore = getRecaptchaEnterpriseMinScore();

  const assessmentConfig = getRecaptchaEnterpriseAssessmentConfig();
  if (!assessmentConfig) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_VERIFY_CONFIG_MISSING",
      "reCAPTCHA Enterprise verification is not configured on the server.",
      503,
    );
  }

  /* CreateAssessment is the canonical verification path for the Settings
     send-OTP precheck. Keep this server-owned so score/action checks cannot
     be bypassed from the browser. */
  const assessmentOutcome = await verifyRecaptchaEnterpriseWithCreateAssessment({
    projectId: assessmentConfig.projectId,
    siteKey: assessmentConfig.siteKey,
    token,
    action,
    requestIp,
    userAgent: request.headers.get("user-agent")?.trim() || null,
  });

  if (!assessmentOutcome.ok) {
    return apiError(
      assessmentOutcome.code,
      assessmentOutcome.message,
      assessmentOutcome.status,
    );
  }

  if (assessmentOutcome.score < minScore) {
    return apiError(
      "RECAPTCHA_ENTERPRISE_RISK_TOO_HIGH",
      "Security verification blocked this request. Please try again later.",
      403,
    );
  }

  return apiSuccess({
    score: assessmentOutcome.score,
    action: assessmentOutcome.action,
    hostname: assessmentOutcome.hostname,
    reasons: assessmentOutcome.reasons,
    assessmentName: assessmentOutcome.assessmentName,
  });
}
