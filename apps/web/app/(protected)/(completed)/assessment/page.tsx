import { APP_ROUTES, getModelsForTool } from "@zootopia/shared-config";
import { BrainCircuit } from "lucide-react";

import { AssessmentStudio } from "@/components/assessment/assessment-studio";   
import { getRequestUiContext } from "@/lib/server/request-context";
import {
  getActiveDocumentForOwner,
  getAssessmentDailyCreditsSummaryForUser,
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

export default async function AssessmentPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.assessment),
    getRequestUiContext(),
  ]);
  const [documents, generations, activeDocument, credits] = await Promise.all([
    listDocumentsForUser(user.uid),
    listAssessmentGenerationsForUser(user.uid),
    getActiveDocumentForOwner(user.uid),
    getAssessmentDailyCreditsSummaryForUser({
      uid: user.uid,
      role: user.role,
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.78),rgba(241,249,247,0.62))] p-6 shadow-sm backdrop-blur-xl dark:border-white/6 dark:bg-[linear-gradient(145deg,rgba(4,12,21,0.72),rgba(3,10,18,0.56))] sm:p-8 lg:p-10">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-400/18 blur-3xl" />
        <div className="absolute -bottom-24 left-[-4rem] h-56 w-56 rounded-full bg-sky-400/12 blur-3xl" />
        
        <div className="relative z-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
              <BrainCircuit className="h-3.5 w-3.5" />
              {uiContext.messages.navAssessment}
            </span>
          </div>
          
          <h1 className="page-title max-w-3xl text-balance text-zinc-900 dark:text-white">
            {uiContext.messages.assessmentTitle}
          </h1>
          
        </div>
      </section>

      <AssessmentStudio
        locale={uiContext.locale}
        messages={uiContext.messages}
        models={getModelsForTool("assessment")}
        initialDocuments={documents}
        initialGenerations={generations}
        initialActiveDocumentId={activeDocument?.id ?? null}
        initialCreditSummary={credits}
      />
    </div>
  );
}
