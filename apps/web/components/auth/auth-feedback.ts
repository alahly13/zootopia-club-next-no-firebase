import type { AppMessages } from "@/lib/messages";

export type AuthStatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type AuthStatusIcon =
  | "info"
  | "working"
  | "success"
  | "warning"
  | "danger"
  | "permission"
  | "config";

export type AuthStatusDescriptor = {
  tone: AuthStatusTone;
  icon: AuthStatusIcon;
  title: string;
  body?: string;
  live?: "polite" | "assertive" | "off";
};

export type AuthSupportNote = {
  text: string;
  tone?: "default" | "danger";
};

export type AuthFlowError = {
  code: string;
  message?: string;
};

function status(
  tone: AuthStatusTone,
  icon: AuthStatusIcon,
  title: string,
  body?: string,
  live?: "polite" | "assertive" | "off",
): AuthStatusDescriptor {
  return {
    tone,
    icon,
    title,
    body,
    live,
  };
}

export function createAuthFlowError(code: string, message?: string): AuthFlowError {
  return {
    code,
    message,
  };
}

export function getAuthFlowErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  return null;
}

export function mapRegularLoginError(
  error: unknown,
  messages: AppMessages,
): AuthStatusDescriptor {
  const code = getAuthFlowErrorCode(error);

  switch (code) {
    case "auth/popup-closed-by-user":
      return status(
        "warning",
        "warning",
        messages.loginStatusPopupClosedTitle,
        messages.loginStatusPopupClosedBody,
      );
    case "auth/cancelled-popup-request":
      return status(
        "warning",
        "warning",
        messages.loginStatusPopupCancelledTitle,
        messages.loginStatusPopupCancelledBody,
      );
    case "auth/popup-blocked":
    case "auth/operation-not-supported-in-this-environment":
      return status(
        "warning",
        "warning",
        messages.loginStatusRedirectingTitle,
        messages.loginStatusRedirectingBody,
      );
    case "RECENT_SIGN_IN_REQUIRED":
      return status(
        "warning",
        "warning",
        messages.loginStatusRefreshTitle,
        messages.loginStatusRefreshBody,
      );
    case "ADMIN_LOGIN_REQUIRED":
      return status(
        "danger",
        "permission",
        messages.loginStatusAdminRequiredTitle,
        messages.loginStatusAdminRequiredBody,
        "assertive",
      );
    case "GOOGLE_SIGN_IN_REQUIRED":
      return status(
        "danger",
        "permission",
        messages.loginStatusGoogleRequiredTitle,
        messages.loginStatusGoogleRequiredBody,
        "assertive",
      );
    case "USER_SUSPENDED":
    case "auth/user-disabled":
      return status(
        "danger",
        "permission",
        messages.loginStatusSuspendedTitle,
        messages.loginStatusSuspendedBody,
        "assertive",
      );
    case "BOOTSTRAP_FAILED":
      return status(
        "danger",
        "danger",
        messages.loginStatusBootstrapErrorTitle,
        messages.loginStatusBootstrapErrorBody,
        "assertive",
      );
    default:
      return status(
        "danger",
        "danger",
        messages.loginStatusGenericErrorTitle,
        messages.loginStatusGenericErrorBody,
        "assertive",
      );
  }
}

export function mapAdminLoginError(
  error: unknown,
  messages: AppMessages,
): AuthStatusDescriptor {
  const code = getAuthFlowErrorCode(error);

  switch (code) {
    case "IDENTIFIER_REQUIRED":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusIdentifierRequiredTitle,
        messages.adminLoginStatusIdentifierRequiredBody,
      );
    case "ADMIN_USERNAME_NOT_FOUND":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusIdentifierNotFoundTitle,
        messages.adminLoginStatusIdentifierNotFoundBody,
      );
    case "ADMIN_ACCOUNT_UNAUTHORIZED":
      return status(
        "danger",
        "permission",
        messages.adminLoginStatusUnauthorizedTitle,
        messages.adminLoginStatusUnauthorizedBody,
        "assertive",
      );
    case "ADMIN_CLAIM_REQUIRED":
      return status(
        "danger",
        "permission",
        messages.adminLoginStatusClaimRequiredTitle,
        messages.adminLoginStatusClaimRequiredBody,
        "assertive",
      );
    case "EMAIL_PASSWORD_REQUIRED":
      return status(
        "danger",
        "permission",
        messages.adminLoginStatusPasswordRequiredTitle,
        messages.adminLoginStatusPasswordRequiredBody,
        "assertive",
      );
    case "RECENT_SIGN_IN_REQUIRED":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusRecentSigninTitle,
        messages.adminLoginStatusRecentSigninBody,
      );
    case "USER_SUSPENDED":
    case "auth/user-disabled":
      return status(
        "danger",
        "permission",
        messages.adminLoginStatusSuspendedTitle,
        messages.adminLoginStatusSuspendedBody,
        "assertive",
      );
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/invalid-login-credentials":
      return status(
        "danger",
        "danger",
        messages.adminLoginStatusInvalidCredentialsTitle,
        messages.adminLoginStatusInvalidCredentialsBody,
        "assertive",
      );
    case "auth/too-many-requests":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusRetryLaterTitle,
        messages.adminLoginStatusRetryLaterBody,
      );
    case "ADMIN_BOOTSTRAP_FAILED":
      return status(
        "danger",
        "danger",
        messages.adminLoginStatusBootstrapErrorTitle,
        messages.adminLoginStatusBootstrapErrorBody,
        "assertive",
      );
    default:
      return status(
        "danger",
        "danger",
        messages.adminLoginStatusGenericErrorTitle,
        messages.adminLoginStatusGenericErrorBody,
        "assertive",
      );
  }
}
