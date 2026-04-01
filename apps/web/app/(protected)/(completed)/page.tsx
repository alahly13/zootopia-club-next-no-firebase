import { APP_ROUTES } from "@zootopia/shared-config";
import Link from "next/link";

import { UploadWorkspace } from "@/components/upload/upload-workspace";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import {
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
  listInfographicGenerationsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

export default async function HomePage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.home),
    getRequestUiContext(),
  ]);
  const [documents, assessments, infographics] = await Promise.all([
    listDocumentsForUser(user.uid),
    listAssessmentGenerationsForUser(user.uid),
    listInfographicGenerationsForUser(user.uid),
  ]);
  const runtimeFlags = getRuntimeFlags();

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="section-label">{uiContext.messages.homeSectionLabel}</p>
            <h1 className="page-title max-w-3xl">{uiContext.messages.homeTitle}</h1>
            <p className="page-subtitle mt-5">{uiContext.messages.homeSubtitle}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="metric-card">
              <div className="metric-value">{documents.length}</div>
              <div className="metric-label">{uiContext.messages.recentDocumentsTitle}</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{assessments.length}</div>
              <div className="metric-label">{uiContext.messages.recentAssessmentsTitle}</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{infographics.length}</div>
              <div className="metric-label">{uiContext.messages.recentInfographicsTitle}</div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <Link href={APP_ROUTES.assessment} className="surface-strong rounded-[1.7rem] p-5">
            <p className="section-label">{uiContext.messages.navAssessment}</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em]">
              {uiContext.messages.assessmentTitle}
            </h2>
            <p className="mt-3 text-sm leading-7 text-foreground-muted">
              {uiContext.messages.assessmentSubtitle}
            </p>
          </Link>
          <Link href={APP_ROUTES.infographic} className="surface-strong rounded-[1.7rem] p-5">
            <p className="section-label">{uiContext.messages.navInfographic}</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em]">
              {uiContext.messages.infographicTitle}
            </h2>
            <p className="mt-3 text-sm leading-7 text-foreground-muted">
              {uiContext.messages.infographicSubtitle}
            </p>
          </Link>
          <Link href={APP_ROUTES.settings} className="surface-strong rounded-[1.7rem] p-5">
            <p className="section-label">{uiContext.messages.navSettings}</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em]">
              {uiContext.messages.settingsTitle}
            </h2>
            <p className="mt-3 text-sm leading-7 text-foreground-muted">
              {uiContext.messages.settingsSubtitle}
            </p>
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <span className="chip">
            Firebase Admin{" "}
            {runtimeFlags.firebaseAdmin
              ? uiContext.messages.statusReady
              : uiContext.messages.statusPending}
          </span>
          <span className="chip">
            Google AI{" "}
            {runtimeFlags.googleAi
              ? uiContext.messages.statusReady
              : uiContext.messages.statusFallback}
          </span>
          <span className="chip">
            Qwen{" "}
            {runtimeFlags.qwen
              ? uiContext.messages.statusReady
              : uiContext.messages.statusFallback}
          </span>
          <span className="chip">
            Datalab{" "}
            {runtimeFlags.datalab
              ? uiContext.messages.statusReady
              : uiContext.messages.statusFallback}
          </span>
        </div>
      </section>

      <UploadWorkspace
        messages={uiContext.messages}
        initialDocuments={documents}
        title={uiContext.messages.uploadWorkspaceTitle}
        description={uiContext.messages.uploadHint}
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card rounded-[2rem] p-6">
          <p className="section-label">{uiContext.messages.recentAssessmentsTitle}</p>
          <div className="mt-5 space-y-3">
            {assessments.length === 0 ? (
              <div className="empty-state">{uiContext.messages.assessmentEmpty}</div>
            ) : (
              assessments.slice(0, 4).map((generation) => (
                <div
                  key={generation.id}
                  className="rounded-2xl border border-border bg-background-strong px-4 py-3"
                >
                  <p className="font-semibold text-foreground">{generation.title}</p>
                  <p className="mt-2 text-sm text-foreground-muted">
                    {generation.questions.length} questions
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="surface-card rounded-[2rem] p-6">
          <p className="section-label">{uiContext.messages.recentInfographicsTitle}</p>
          <div className="mt-5 space-y-3">
            {infographics.length === 0 ? (
              <div className="empty-state">{uiContext.messages.infographicEmpty}</div>
            ) : (
              infographics.slice(0, 4).map((generation) => (
                <div
                  key={generation.id}
                  className="rounded-2xl border border-border bg-background-strong px-4 py-3"
                >
                  <p className="font-semibold text-foreground">{generation.topic}</p>
                  <p className="mt-2 text-sm text-foreground-muted">{generation.modelId}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
