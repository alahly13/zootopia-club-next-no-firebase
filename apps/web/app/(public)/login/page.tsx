import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/auth/login-panel";
import { PublicAuthShell } from "@/components/auth/public-auth-shell";
import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export default async function LoginPage() {
  const [user, uiContext] = await Promise.all([
    getAuthenticatedSessionUser(),
    getRequestUiContext(),
  ]);

  if (user) {
    redirect(getAuthenticatedUserRedirectPath(user));
  }

  const runtimeFlags = getRuntimeFlags();

  return (
    <PublicAuthShell
      eyebrow={uiContext.messages.loginSupportLabel}
      title={uiContext.messages.loginTitle}
      subtitle={uiContext.messages.loginSubtitle}
      imageAlt={uiContext.messages.homeTitle}
      controls={
        <>
          <ThemeToggle
            value={uiContext.themeMode}
            label={uiContext.messages.themeLabel}
            labels={{
              light: uiContext.messages.themeLight,
              dark: uiContext.messages.themeDark,
              system: uiContext.messages.themeSystem,
            }}
            variant="compact"
          />
          <LocaleToggle
            value={uiContext.locale}
            label={uiContext.messages.localeLabel}
            labels={{
              en: uiContext.messages.localeEnglish,
              ar: uiContext.messages.localeArabic,
            }}
            variant="compact"
          />
        </>
      }
    >
      <div className="flex min-w-0 items-center justify-center">
        <LoginPanel
          messages={uiContext.messages}
          locale={uiContext.locale}
          firebaseAdminReady={runtimeFlags.firebaseAdmin}
        />
      </div>
    </PublicAuthShell>
  );
}
