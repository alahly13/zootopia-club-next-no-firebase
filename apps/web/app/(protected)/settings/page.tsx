import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { sanitizeUserReturnTo } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { requireAuthenticatedUser } from "@/lib/server/session";

type SettingsPageProps = {
  searchParams: Promise<{
    returnTo?: string | string[];
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [resolvedSearchParams, user, uiContext] = await Promise.all([
    searchParams,
    requireAuthenticatedUser(),
    getRequestUiContext(),
  ]);
  const runtimeFlags = getRuntimeFlags();
  const requestedReturnTo = Array.isArray(resolvedSearchParams.returnTo)
    ? resolvedSearchParams.returnTo[0]
    : resolvedSearchParams.returnTo;
  const returnTo = sanitizeUserReturnTo(requestedReturnTo);

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-6 md:p-8">
        <p className="section-label">{uiContext.messages.navSettings}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.05em]">
          {uiContext.messages.settingsTitle}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-foreground-muted">
          {uiContext.messages.settingsSubtitle}
        </p>
        {user.role !== "admin" && !user.profileCompleted ? (
          <p className="mt-4 rounded-[1.25rem] border border-danger/30 bg-danger/10 px-4 py-3 text-sm leading-7 text-danger">
            {uiContext.messages.profileCompletionRequiredNotice}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          {user.role === "admin" ? (
            <section className="surface-card rounded-[2rem] p-6">
              <p className="section-label">{uiContext.messages.settingsProfileTitle}</p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em] text-foreground">
                {uiContext.messages.profileCompletionAdminExemptTitle}
              </h2>
              <p className="mt-4 text-sm leading-7 text-foreground-muted">
                {uiContext.messages.profileCompletionAdminExemptBody}
              </p>
            </section>
          ) : (
            <ProfileSettingsForm
              messages={uiContext.messages}
              initialFullName={user.fullName ?? ""}
              initialUniversityCode={user.universityCode ?? ""}
              returnTo={returnTo}
              profileCompleted={user.profileCompleted}
            />
          )}

          <section className="surface-card rounded-[2rem] p-6">
            <p className="section-label">{uiContext.messages.preferencesTitle}</p>
            <div className="mt-6 space-y-6">
              <ThemeToggle
                value={uiContext.themeMode}
                label={uiContext.messages.themeLabel}
                labels={{
                  light: uiContext.messages.themeLight,
                  dark: uiContext.messages.themeDark,
                  system: uiContext.messages.themeSystem,
                }}
              />
              <LocaleToggle
                value={uiContext.locale}
                label={uiContext.messages.localeLabel}
                labels={{
                  en: uiContext.messages.localeEnglish,
                  ar: uiContext.messages.localeArabic,
                }}
              />
            </div>
          </section>
        </div>

        <section className="surface-card rounded-[2rem] p-6">
          <p className="section-label">{uiContext.messages.runtimeStatusTitle}</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="metric-card">
              <div className="metric-value">
                {runtimeFlags.firebaseAdmin
                  ? uiContext.messages.statusOn
                  : uiContext.messages.statusOff}
              </div>
              <div className="metric-label">Firebase Admin</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">
                {runtimeFlags.datalab
                  ? uiContext.messages.statusOn
                  : uiContext.messages.statusOff}
              </div>
              <div className="metric-label">Datalab Convert</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">
                {runtimeFlags.googleAi
                  ? uiContext.messages.statusOn
                  : uiContext.messages.statusOff}
              </div>
              <div className="metric-label">Google AI</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">
                {runtimeFlags.qwen
                  ? uiContext.messages.statusOn
                  : uiContext.messages.statusOff}
              </div>
              <div className="metric-label">Qwen</div>
            </div>
          </div>
          <div className="mt-6 rounded-[1.5rem] border border-border bg-background-strong p-5">
            <p className="font-semibold text-foreground">
              {user.fullName || user.displayName || user.email || user.uid}
            </p>
            <p className="mt-2 text-sm leading-7 text-foreground-muted">
              {user.role === "admin" ? uiContext.messages.roleAdmin : uiContext.messages.roleUser}
            </p>
            <p className="mt-1 text-sm leading-7 text-foreground-muted">
              {user.status === "active"
                ? uiContext.messages.statusActive
                : uiContext.messages.statusSuspended}
            </p>
            <p className="mt-1 text-sm leading-7 text-foreground-muted">
              {user.role === "admin"
                ? uiContext.messages.profileCompletionAdminExemptTitle
                : user.profileCompleted
                  ? uiContext.messages.profileCompletionCompleteStatus
                  : uiContext.messages.profileCompletionIncompleteStatus}
            </p>
            {user.universityCode ? (
              <p className="mt-1 text-sm leading-7 text-foreground-muted">
                {uiContext.messages.settingsUniversityCodeLabel}: {user.universityCode}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
