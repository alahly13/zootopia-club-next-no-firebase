import { APP_ROUTES, getModelsForTool } from "@zootopia/shared-config";

import { AssessmentStudio } from "@/components/assessment/assessment-studio";
import { getRequestUiContext } from "@/lib/server/request-context";
import {
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

export default async function AssessmentPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.assessment),
    getRequestUiContext(),
  ]);
  const [documents, generations] = await Promise.all([
    listDocumentsForUser(user.uid),
    listAssessmentGenerationsForUser(user.uid),
  ]);

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-6">
        <p className="section-label">{uiContext.messages.navAssessment}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.05em]">
          {uiContext.messages.assessmentTitle}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-foreground-muted">
          {uiContext.messages.assessmentSubtitle}
        </p>
      </section>

      <AssessmentStudio
        messages={uiContext.messages}
        models={getModelsForTool("assessment")}
        initialDocuments={documents}
        initialGenerations={generations}
      />
    </div>
  );
}
