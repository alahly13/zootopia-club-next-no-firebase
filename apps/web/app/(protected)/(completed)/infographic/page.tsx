import { APP_ROUTES, getModelsForTool } from "@zootopia/shared-config";

import { InfographicStudio } from "@/components/infographic/infographic-studio";
import { getRequestUiContext } from "@/lib/server/request-context";
import {
  listDocumentsForUser,
  listInfographicGenerationsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

export default async function InfographicPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.infographic),
    getRequestUiContext(),
  ]);
  const [documents, generations] = await Promise.all([
    listDocumentsForUser(user.uid),
    listInfographicGenerationsForUser(user.uid),
  ]);

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-6">
        <p className="section-label">{uiContext.messages.navInfographic}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.05em]">
          {uiContext.messages.infographicTitle}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-foreground-muted">
          {uiContext.messages.infographicSubtitle}
        </p>
      </section>

      <InfographicStudio
        messages={uiContext.messages}
        models={getModelsForTool("infographic")}
        initialDocuments={documents}
        initialGenerations={generations}
      />
    </div>
  );
}
