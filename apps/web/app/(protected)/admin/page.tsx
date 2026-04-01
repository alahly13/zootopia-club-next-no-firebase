import Link from "next/link";

import { getRequestUiContext } from "@/lib/server/request-context";
import { getAdminOverviewData, listUsers } from "@/lib/server/repository";
import { getRuntimeFlags } from "@/lib/server/runtime";

export default async function AdminPage() {
  const [uiContext, overview, users] = await Promise.all([
    getRequestUiContext(),
    getAdminOverviewData(),
    listUsers(),
  ]);
  const runtimeFlags = getRuntimeFlags();

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-6 md:p-8">
        <p className="section-label">{uiContext.messages.navAdmin}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.05em]">
          {uiContext.messages.adminTitle}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-foreground-muted">
          {uiContext.messages.adminSubtitle}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card">
          <div className="metric-value">{overview.totalUsers}</div>
          <div className="metric-label">{uiContext.messages.metricUsers}</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{overview.activeUsers}</div>
          <div className="metric-label">{uiContext.messages.metricActiveUsers}</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{overview.totalDocuments}</div>
          <div className="metric-label">{uiContext.messages.metricDocuments}</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{overview.totalAssessmentGenerations}</div>
          <div className="metric-label">{uiContext.messages.metricAssessments}</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="surface-card rounded-[2rem] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-label">{uiContext.messages.adminUsersTitle}</p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em]">
                {uiContext.messages.adminUsersSubtitle}
              </h2>
            </div>
            <Link href="/admin/users" className="secondary-button">
              {uiContext.messages.navAdminUsers}
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {users.slice(0, 5).map((user) => (
              <div
                key={user.uid}
                className="rounded-2xl border border-border bg-background-strong px-4 py-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-foreground">
                      {user.fullName || user.displayName || user.email || user.uid}
                    </p>
                    <p className="mt-1 text-sm text-foreground-muted">
                      {user.email || user.uid}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="chip">
                      {user.role === "admin"
                        ? uiContext.messages.roleAdmin
                        : uiContext.messages.roleUser}
                    </span>
                    <span className="chip">
                      {user.status === "active"
                        ? uiContext.messages.statusActive
                        : uiContext.messages.statusSuspended}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card rounded-[2rem] p-6">
          <p className="section-label">{uiContext.messages.runtimeStatusTitle}</p>
          <div className="mt-5 space-y-3">
            <div className="status-note">
              Firebase Admin:{" "}
              {runtimeFlags.firebaseAdmin
                ? uiContext.messages.statusReady
                : uiContext.messages.statusPending}
            </div>
            <div className="status-note">
              Google AI:{" "}
              {runtimeFlags.googleAi
                ? uiContext.messages.statusReady
                : uiContext.messages.statusFallback}
            </div>
            <div className="status-note">
              Qwen:{" "}
              {runtimeFlags.qwen
                ? uiContext.messages.statusReady
                : uiContext.messages.statusFallback}
            </div>
            <div className="status-note">
              Datalab Convert:{" "}
              {runtimeFlags.datalab
                ? uiContext.messages.statusReady
                : uiContext.messages.statusFallback}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
