import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import type { AdminIdentifierResolution } from "@zootopia/shared-types";

const CANONICAL_ADMIN_EMAILS = [
  "alahlyeagle@gmail.com",
  "elmahdy@admin.com",
  "alahlyeagle13@gmail.com",
] as const;

const ADMIN_USERNAME_LOOKUP = {
  elmahdy: "elmahdy@admin.com",
  alahlyeagle: "alahlyeagle@gmail.com",
} as const;

const ADMIN_EMAIL_SET = new Set(CANONICAL_ADMIN_EMAILS);

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function getAllowlistedAdminEmails() {
  return [...CANONICAL_ADMIN_EMAILS];
}

export function isAllowlistedAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return ADMIN_EMAIL_SET.has(normalizeIdentifier(email) as (typeof CANONICAL_ADMIN_EMAILS)[number]);
}

export function hasAdminAccessFromClaims(input: {
  email: string | null | undefined;
  admin: unknown;
}) {
  return isAllowlistedAdminEmail(input.email) && input.admin === true;
}

export function resolveAdminIdentifier(
  identifier: string,
):
  | { ok: true; value: AdminIdentifierResolution }
  | { ok: false; code: string; message: string; status: number } {
  const normalized = normalizeIdentifier(identifier);

  if (!normalized) {
    return {
      ok: false,
      code: "IDENTIFIER_REQUIRED",
      message: "Enter your allowlisted admin email or approved username.",
      status: 400,
    };
  }

  if (normalized.includes("@")) {
    if (!isAllowlistedAdminEmail(normalized)) {
      return {
        ok: false,
        code: "ADMIN_ACCOUNT_UNAUTHORIZED",
        message: "This account is not authorized for admin access.",
        status: 403,
      };
    }

    return {
      ok: true,
      value: {
        email: normalized,
        identifierType: "email",
        resolutionSource: "allowlisted_email",
      },
    };
  }

  const mappedEmail =
    ADMIN_USERNAME_LOOKUP[normalized as keyof typeof ADMIN_USERNAME_LOOKUP];

  if (!mappedEmail) {
    return {
      ok: false,
      code: "ADMIN_USERNAME_NOT_FOUND",
      message: "No admin account was found with this username.",
      status: 404,
    };
  }

  return {
    ok: true,
    value: {
      email: mappedEmail,
      identifierType: "username",
      resolutionSource: "username_alias",
    },
  };
}

export function getDecodedSignInProvider(decodedToken: Pick<DecodedIdToken, "firebase">) {
  const firebaseClaims = decodedToken.firebase as
    | { sign_in_provider?: unknown }
    | undefined;

  return typeof firebaseClaims?.sign_in_provider === "string"
    ? firebaseClaims.sign_in_provider
    : null;
}

export function hasRecentSignIn(decodedToken: Pick<DecodedIdToken, "auth_time">) {
  const authTimeMs =
    typeof decodedToken.auth_time === "number" ? decodedToken.auth_time * 1000 : 0;

  return authTimeMs > 0 && Date.now() - authTimeMs <= 5 * 60 * 1000;
}
