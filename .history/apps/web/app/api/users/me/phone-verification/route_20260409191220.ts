import { getPhoneNumberMetadata } from "@zootopia/shared-utils";

import {
  getDecodedSignInProvider,
  hasRecentSignIn,
} from "@/lib/server/admin-auth";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  getFirebaseAdminAuth,
  hasFirebaseAdminRuntime,
} from "@/lib/server/firebase-admin";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { updateUserPhoneVerification } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const E164_PHONE_PATTERN = /^\+[1-9]\d{6,17}$/;
const PHONE_VERIFICATION_RATE_LIMIT_MAX_REQUESTS = 8;
const PHONE_VERIFICATION_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const FIREBASE_PHONE_TOKEN_ERROR_CODES = new Set([
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/argument-error",
  "auth/invalid-argument",
  "auth/user-disabled",
  "auth/user-not-found",
]);

function getFirebaseErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code ?? "");
  }

  return "";
}

export async function POST(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError(
      "UNAUTHENTICATED",
      "Sign in is required to verify your phone number.",
      401,
    );
  }

  /* Settings phone OTP confirmation remains Firebase-owned, but this server receipt endpoint
     still needs basic throttling so repeated token replay attempts cannot hammer the self-only
     verification write path. Keep the scope narrow to this route and preserve session ownership. */
  const rateLimit = checkRequestRateLimit({
    request,
    scope: "settings-phone-verification",
    subject: user.uid,
    maxRequests: PHONE_VERIFICATION_RATE_LIMIT_MAX_REQUESTS,
    windowMs: PHONE_VERIFICATION_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const blocked = apiError(
      "PHONE_VERIFICATION_RATE_LIMITED",
      "Too many phone verification attempts. Please retry shortly.",
      429,
    );
    blocked.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    blocked.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rateLimit.resetAtMs / 1000)),
    );
    return blocked;
  }

  if (!hasFirebaseAdminRuntime()) {
    return apiError(
      "FIREBASE_ADMIN_UNAVAILABLE",
      "Firebase Admin runtime is not configured yet.",
      503,
    );
  }

  let body: { idToken?: string };

  try {
    body = (await request.json()) as { idToken?: string };
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const idToken = String(body.idToken || "").trim();
  if (!idToken) {
    return apiError(
      "ID_TOKEN_REQUIRED",
      "A Firebase ID token is required to verify a phone number.",
      400,
    );
  }

  let decodedToken: Awaited<
    ReturnType<ReturnType<typeof getFirebaseAdminAuth>["verifyIdToken"]>
  >;

  try {
    decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
  } catch (verifyError) {
    const code = getFirebaseErrorCode(verifyError);

    if (code === "auth/id-token-revoked") {
      return apiError(
        "ID_TOKEN_REVOKED",
        "This phone verification token has been revoked. Please request a new OTP.",
        401,
      );
    }

    if (code === "auth/user-disabled") {
      return apiError(
        "USER_SUSPENDED",
        "This account is suspended and cannot verify a phone number right now.",
        403,
      );
    }

    if (FIREBASE_PHONE_TOKEN_ERROR_CODES.has(code)) {
      return apiError(
        "ID_TOKEN_INVALID",
        "The provided phone verification token is invalid or has expired.",
        401,
      );
    }

    return apiError(
      "PHONE_VERIFICATION_FAILED",
      "Unable to verify this phone token right now. Please request a new OTP and retry.",
      503,
    );
  }

  try {

    if (!hasRecentSignIn(decodedToken)) {
      return apiError(
        "RECENT_SIGN_IN_REQUIRED",
        "Please complete a fresh phone OTP verification and try again.",
        401,
      );
    }

    if (getDecodedSignInProvider(decodedToken) !== "phone") {
      return apiError(
        "PHONE_PROVIDER_REQUIRED",
        "This token does not come from a verified phone sign-in flow.",
        403,
      );
    }

    const phoneNumber =
      typeof decodedToken.phone_number === "string"
        ? decodedToken.phone_number.trim()
        : "";

    if (!E164_PHONE_PATTERN.test(phoneNumber)) {
      return apiError(
        "PHONE_NUMBER_INVALID",
        "Verified phone number must use E.164 format.",
        400,
      );
    }
    const phoneMetadata = getPhoneNumberMetadata(phoneNumber);
    if (!phoneMetadata) {
      return apiError(
        "PHONE_NUMBER_INVALID",
        "Verified phone number must be a possible international number.",
        400,
      );
    }

    /* Keep profile ownership server-authoritative by always attaching the verified phone
       to the signed-in session user, never to the uid inside the submitted phone token. */
    const updatedUser = await updateUserPhoneVerification(user.uid, {
      phoneNumber: phoneMetadata.e164,
    });

    return apiSuccess({
      user: {
        phoneNumber: updatedUser.phoneNumber,
        phoneVerifiedAt: updatedUser.phoneVerifiedAt,
        phoneCountryIso2: updatedUser.phoneCountryIso2 ?? null,
        phoneCountryCallingCode: updatedUser.phoneCountryCallingCode ?? null,
      },
    });
  } catch (persistenceError) {
    if (
      persistenceError instanceof Error &&
      persistenceError.message === "USER_NOT_FOUND"
    ) {
      return apiError(
        "UNAUTHENTICATED",
        "Sign in is required to verify your phone number.",
        401,
      );
    }

    return apiError(
      "PHONE_VERIFICATION_PERSISTENCE_FAILED",
      "Phone verification succeeded, but it could not be saved right now. Please retry.",
      503,
    );
  }
}
