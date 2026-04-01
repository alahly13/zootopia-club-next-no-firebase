"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, Locale, SessionUser } from "@zootopia/shared-types";
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  createAuthFlowError,
  mapRegularLoginError,
  type AuthStatusDescriptor,
  type AuthSupportNote,
} from "@/components/auth/auth-feedback";
import {
  AuthStatus,
  AuthSupportDetails,
} from "@/components/auth/auth-status";
import type { AppMessages } from "@/lib/messages";

import {
  getEphemeralFirebaseClientAuth,
  getFirebaseClientAuth,
  isFirebaseWebConfigured,
} from "@/lib/firebase/client";

type LoginPanelProps = {
  messages: AppMessages;
  locale: Locale;
  firebaseAdminReady: boolean;
};

type RegularLoginPhase =
  | "idle"
  | "opening_google"
  | "redirecting"
  | "bootstrapping"
  | "success_handoff";

function isRedirectPreferred() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
}

function createGoogleProvider(locale: Locale) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
    hl: locale,
  });

  return provider;
}

export function LoginPanel({
  messages,
  locale,
  firebaseAdminReady,
}: LoginPanelProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<RegularLoginPhase>("idle");
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const firebaseConfigured = isFirebaseWebConfigured();

  const clearClientSession = useCallback(async () => {
    if (!firebaseConfigured) {
      return;
    }

    try {
      await signOut(getFirebaseClientAuth());
    } catch {
      // Best-effort client cleanup only.
    }
  }, [firebaseConfigured]);

  const setFinishingStatus = useCallback(() => {
    setPhase("bootstrapping");
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.loginStatusFinishingTitle,
      body: messages.loginStatusFinishingBody,
    });
  }, [messages]);

  const bootstrapSession = useCallback(async (idToken: string) => {
    setFinishingStatus();

    const response = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ idToken }),
    });

    const payload = (await response.json()) as ApiResult<{
      user: SessionUser;
      redirectTo: string;
    }>;

    if (!response.ok || !payload.ok) {
      throw createAuthFlowError(
        payload.ok ? "BOOTSTRAP_FAILED" : payload.error.code,
        payload.ok ? undefined : payload.error.message,
      );
    }

    setPhase("success_handoff");
    setStatus({
      tone: "success",
      icon: "success",
      title: messages.loginStatusSuccessTitle,
      body: messages.loginStatusSuccessBody,
    });
    await clearClientSession();
    router.replace(payload.data.redirectTo || APP_ROUTES.home);
    router.refresh();
  }, [clearClientSession, messages, router, setFinishingStatus]);

  useEffect(() => {
    if (!firebaseConfigured) {
      return;
    }

    let cancelled = false;

    async function completeRedirectLogin() {
      try {
        const auth = await getEphemeralFirebaseClientAuth();
        const result = await getRedirectResult(auth);
        if (!result?.user || cancelled) {
          return;
        }

        await bootstrapSession(await result.user.getIdToken(true));
      } catch (nextError) {
        await clearClientSession();
        if (!cancelled) {
          setPhase("idle");
          setStatus(mapRegularLoginError(nextError, messages));
        }
      }
    }

    void completeRedirectLogin();

    return () => {
      cancelled = true;
    };
  }, [bootstrapSession, clearClientSession, firebaseConfigured, messages]);

  async function handleGoogleLogin() {
    if (!firebaseConfigured || !firebaseAdminReady) {
      return;
    }

    const prefersRedirect = isRedirectPreferred();
    let shouldReset = true;

    setPhase(prefersRedirect ? "redirecting" : "opening_google");
    setStatus(
      prefersRedirect
        ? {
            tone: "info",
            icon: "working",
            title: messages.loginStatusRedirectingTitle,
            body: messages.loginStatusRedirectingBody,
          }
        : {
            tone: "info",
            icon: "working",
            title: messages.loginStatusWorkingTitle,
            body: messages.loginStatusWorkingBody,
          },
    );

    try {
      const auth = await getEphemeralFirebaseClientAuth();
      const provider = createGoogleProvider(locale);

      if (prefersRedirect) {
        shouldReset = false;
        await signInWithRedirect(auth, provider);
        return;
      }

      const result = await signInWithPopup(auth, provider);
      await bootstrapSession(await result.user.getIdToken(true));
      shouldReset = false;
    } catch (nextError) {
      await clearClientSession();
      const code =
        typeof nextError === "object" && nextError && "code" in nextError
          ? String(nextError.code)
          : "";

      if (
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          setPhase("redirecting");
          setStatus({
            tone: "warning",
            icon: "warning",
            title: messages.loginStatusRedirectingTitle,
            body: messages.loginStatusRedirectingBody,
          });
          const redirectAuth = await getEphemeralFirebaseClientAuth();
          shouldReset = false;
          await signInWithRedirect(redirectAuth, createGoogleProvider(locale));
          return;
        } catch (redirectError) {
          setPhase("idle");
          setStatus(mapRegularLoginError(redirectError, messages));
        }
      } else {
        setPhase("idle");
        setStatus(mapRegularLoginError(nextError, messages));
      }
    } finally {
      if (shouldReset) {
        setPhase("idle");
      }
    }
  }

  const disabled = !firebaseConfigured || !firebaseAdminReady || phase !== "idle";
  const blockingStatus =
    !firebaseConfigured
      ? {
          tone: "warning" as const,
          icon: "config" as const,
          title: messages.loginStatusConfigTitle,
          body: messages.loginStatusConfigBody,
          live: "off" as const,
        }
      : !firebaseAdminReady
        ? {
            tone: "warning" as const,
            icon: "config" as const,
            title: messages.loginStatusServerTitle,
            body: messages.loginStatusServerBody,
            live: "off" as const,
          }
        : null;
  const visibleStatus = blockingStatus ?? status;
  const supportNotes: AuthSupportNote[] = [];
  if (!firebaseConfigured) {
    supportNotes.push({ text: messages.loginConfigHint });
  }
  if (!firebaseAdminReady) {
    supportNotes.push({ text: messages.firebaseUnavailable });
  }
  const buttonLabel =
    !firebaseConfigured || !firebaseAdminReady
      ? messages.loginCtaUnavailable
      : phase === "opening_google"
        ? messages.loginCtaWorking
        : phase === "redirecting"
          ? messages.loginCtaRedirecting
          : phase === "bootstrapping" || phase === "success_handoff"
            ? messages.loginCtaSuccess
            : messages.loginCta;

  return (
    <div className="auth-panel-stack">
      <div className="surface-card auth-card">
        <p className="auth-card-copy">{messages.loginCardHint}</p>
        <AuthStatus status={visibleStatus} />

        <div className="auth-actions">
          <button
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={disabled}
            className="action-button auth-provider-button"
          >
            <span className="google-mark-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="google-mark" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M21.4 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.3a4.8 4.8 0 0 1-2 3.1v2.6h3.3c1.9-1.8 2.8-4.4 2.8-7.5Z"
                  fill="#4285F4"
                />
                <path
                  d="M12 21.8c2.6 0 4.7-.9 6.3-2.3l-3.3-2.6c-.9.6-2 .9-3 .9-2.4 0-4.5-1.6-5.2-3.9H3.4v2.7A9.8 9.8 0 0 0 12 21.8Z"
                  fill="#34A853"
                />
                <path
                  d="M6.8 13.9a5.9 5.9 0 0 1 0-3.8V7.4H3.4a9.8 9.8 0 0 0 0 9.2l3.4-2.7Z"
                  fill="#FBBC04"
                />
                <path
                  d="M12 6.2c1.4 0 2.8.5 3.8 1.4l2.8-2.8A9.6 9.6 0 0 0 12 2.2a9.8 9.8 0 0 0-8.6 5.2l3.4 2.7C7.5 7.8 9.6 6.2 12 6.2Z"
                  fill="#EA4335"
                />
              </svg>
            </span>
            <span>{buttonLabel}</span>
          </button>

          <Link href={APP_ROUTES.adminLogin} className="secondary-button auth-secondary-link">
            <Shield className="auth-secondary-link-icon" aria-hidden="true" />
            <span>{messages.loginAdminAction}</span>
          </Link>
        </div>
      </div>

      <AuthSupportDetails
        label={messages.loginSupportDetailsLabel}
        notes={supportNotes}
      />
    </div>
  );
}
