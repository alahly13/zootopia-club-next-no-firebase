"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, AdminIdentifierResolution } from "@zootopia/shared-types";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createAuthFlowError,
  mapAdminLoginError,
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

type AdminLoginPanelProps = {
  messages: AppMessages;
  firebaseAdminReady: boolean;
};

type AdminLoginPhase =
  | "idle"
  | "resolving"
  | "signing_in"
  | "bootstrapping"
  | "success_handoff";

export function AdminLoginPanel({
  messages,
  firebaseAdminReady,
}: AdminLoginPanelProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<AdminLoginPhase>("idle");
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const firebaseConfigured = isFirebaseWebConfigured();

  async function clearClientSession() {
    if (!firebaseConfigured) {
      return;
    }

    try {
      await signOut(getFirebaseClientAuth());
    } catch {
      // Best-effort client cleanup only.
    }
  }

  async function resolveIdentifier() {
    const response = await fetch("/api/auth/admin/resolve-identifier", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        identifier,
      }),
    });

    const payload = (await response.json()) as ApiResult<AdminIdentifierResolution>;
    if (!response.ok || !payload.ok) {
      throw createAuthFlowError(
        payload.ok ? "IDENTIFIER_RESOLUTION_FAILED" : payload.error.code,
        payload.ok ? undefined : payload.error.message,
      );
    }

    return payload.data;
  }

  async function bootstrapAdminSession(idToken: string) {
    setPhase("bootstrapping");
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.adminLoginStatusOpeningTitle,
      body: messages.adminLoginStatusOpeningBody,
    });

    const response = await fetch("/api/auth/admin/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ idToken }),
    });

    const payload = (await response.json()) as ApiResult<{ user: unknown }>;
    if (!response.ok || !payload.ok) {
      throw createAuthFlowError(
        payload.ok ? "ADMIN_BOOTSTRAP_FAILED" : payload.error.code,
        payload.ok ? undefined : payload.error.message,
      );
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      return;
    }

    setPhase("resolving");
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.adminLoginStatusResolvingTitle,
      body: messages.adminLoginStatusResolvingBody,
    });

    try {
      const resolution = await resolveIdentifier();
      setPhase("signing_in");
      setStatus({
        tone: "info",
        icon: "working",
        title: messages.adminLoginStatusSigningTitle,
        body: messages.adminLoginStatusSigningBody,
      });

      const auth = await getEphemeralFirebaseClientAuth();
      const credential = await signInWithEmailAndPassword(
        auth,
        resolution.email,
        password,
      );

      await bootstrapAdminSession(await credential.user.getIdToken(true));
      setPhase("success_handoff");
      setStatus({
        tone: "success",
        icon: "success",
        title: messages.adminLoginStatusSuccessTitle,
        body: messages.adminLoginStatusSuccessBody,
      });
      await clearClientSession();
      router.replace(APP_ROUTES.admin);
      router.refresh();
    } catch (nextError) {
      await clearClientSession();
      setPhase("idle");
      setStatus(mapAdminLoginError(nextError, messages));
    }
  }

  const disabled =
    !firebaseConfigured || !firebaseAdminReady || phase !== "idle" || !identifier.trim() || !password;
  const supportNotes: AuthSupportNote[] = [];
  if (!firebaseConfigured) {
    supportNotes.push({ text: messages.adminLoginConfigHint });
  }
  if (!firebaseAdminReady) {
    supportNotes.push({ text: messages.firebaseUnavailable });
  }
  supportNotes.push(
    { text: messages.adminLoginUsernameHint },
    { text: messages.adminLoginRestrictedNotice },
    { text: messages.adminLoginWeakPasswordNotice, tone: "danger" },
  );
  const blockingStatus =
    !firebaseConfigured
      ? {
          tone: "warning" as const,
          icon: "config" as const,
          title: messages.adminLoginStatusConfigTitle,
          body: messages.adminLoginStatusConfigBody,
          live: "off" as const,
        }
      : !firebaseAdminReady
        ? {
            tone: "warning" as const,
            icon: "config" as const,
            title: messages.adminLoginStatusServerTitle,
            body: messages.adminLoginStatusServerBody,
            live: "off" as const,
          }
        : null;
  const idleHelperStatus =
    !identifier.trim() || !password
      ? {
          tone: "neutral" as const,
          icon: "info" as const,
          title: messages.adminLoginIdleTitle,
          body: messages.adminLoginIdleBody,
          live: "off" as const,
        }
      : null;
  const visibleStatus = blockingStatus ?? status ?? idleHelperStatus;
  const buttonLabel =
    !firebaseConfigured || !firebaseAdminReady
      ? messages.adminLoginCtaUnavailable
      : phase === "resolving"
        ? messages.adminLoginCtaChecking
        : phase === "signing_in"
          ? messages.adminLoginCtaVerifying
          : phase === "bootstrapping" || phase === "success_handoff"
            ? messages.adminLoginCtaOpening
            : messages.adminLoginCta;

  return (
    <div className="auth-panel-stack">
      <div className="surface-card auth-card">
        <p className="auth-card-copy">{messages.adminLoginCardHint}</p>
        <AuthStatus status={visibleStatus} />

        <form className="auth-fields" onSubmit={handleSubmit}>
          <label>
            <span className="field-label">{messages.adminLoginIdentifierLabel}</span>
            <input
              type="text"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                if (phase === "idle") {
                  setStatus(null);
                }
              }}
              placeholder={messages.adminLoginIdentifierPlaceholder}
              autoComplete="username"
              className="field-control"
            />
          </label>

          <label>
            <span className="field-label">{messages.adminLoginPasswordLabel}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (phase === "idle") {
                  setStatus(null);
                }
              }}
              placeholder={messages.adminLoginPasswordPlaceholder}
              autoComplete="current-password"
              className="field-control"
            />
          </label>

          <button
            type="submit"
            disabled={disabled}
            className="action-button auth-submit-button"
          >
            {buttonLabel}
          </button>

          <Link href={APP_ROUTES.login} className="secondary-button auth-secondary-link">
            <GraduationCap className="auth-secondary-link-icon" aria-hidden="true" />
            <span>{messages.adminLoginBackAction}</span>
          </Link>
        </form>
      </div>

      <AuthSupportDetails
        label={messages.adminSupportDetailsLabel}
        notes={supportNotes}
      />
    </div>
  );
}
