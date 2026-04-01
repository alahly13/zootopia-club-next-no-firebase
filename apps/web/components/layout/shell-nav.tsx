"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { Locale, SessionUser, ThemeMode } from "@zootopia/shared-types";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppMessages } from "@/lib/messages";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";

type ShellNavProps = {
  messages: AppMessages;
  user: SessionUser;
  locale: Locale;
  themeMode: ThemeMode;
};

export function ShellNav({
  messages,
  user,
  locale,
  themeMode,
}: ShellNavProps) {
  const pathname = usePathname();
  const canAccessUserWorkspace = user.role === "admin" || user.profileCompleted;
  const links = [
    ...(canAccessUserWorkspace
      ? [
          { href: APP_ROUTES.home, label: messages.navHome },
          { href: APP_ROUTES.assessment, label: messages.navAssessment },
          { href: APP_ROUTES.infographic, label: messages.navInfographic },
        ]
      : []),
    { href: APP_ROUTES.settings, label: messages.navSettings },
    ...(user.role === "admin"
      ? [
          { href: APP_ROUTES.admin, label: messages.navAdmin },
          { href: APP_ROUTES.adminUsers, label: messages.navAdminUsers },
        ]
      : []),
  ];

  return (
    <aside className="surface-card flex flex-col rounded-[2rem] p-5 xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]">
      <div className="border-b border-border pb-5">
        <p className="section-label">{messages.tagline}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.05em]">
          {messages.appName}
        </h1>
        <p className="mt-3 text-sm text-foreground-muted">{messages.signedInAs}</p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {user.fullName || user.displayName || user.email || user.uid}
        </p>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-2">
        {links.map((link) => {
          const active =
            link.href === APP_ROUTES.home
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                active
                  ? "border-transparent bg-accent text-white"
                  : "border-border bg-background-strong text-foreground-muted hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-5 border-t border-border pt-5">
        <ThemeToggle
          value={themeMode}
          label={messages.themeLabel}
          labels={{
            light: messages.themeLight,
            dark: messages.themeDark,
            system: messages.themeSystem,
          }}
        />
        <LocaleToggle
          value={locale}
          label={messages.localeLabel}
          labels={{
            en: messages.localeEnglish,
            ar: messages.localeArabic,
          }}
        />
        <div className="rounded-2xl border border-border bg-background-strong p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
            {user.role === "admin" ? messages.roleAdmin : messages.roleUser}
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            {user.status === "active" ? messages.statusActive : messages.statusSuspended}
          </p>
          {user.role !== "admin" && !user.profileCompleted ? (
            <p className="mt-2 text-sm text-danger">
              {messages.profileCompletionRequiredNotice}
            </p>
          ) : null}
        </div>
        <SignOutButton
          label={messages.logout}
          redirectTo={user.role === "admin" ? APP_ROUTES.adminLogin : APP_ROUTES.login}
        />
      </div>
    </aside>
  );
}
