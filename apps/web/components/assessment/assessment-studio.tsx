"use client";

import type {
  AiModelDescriptor,
  ApiResult,
  AssessmentGeneration,
  AssessmentRequest,
  DocumentRecord,
} from "@zootopia/shared-types";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import type { AppMessages } from "@/lib/messages";

import { UploadWorkspace } from "@/components/upload/upload-workspace";

type AssessmentStudioProps = {
  messages: AppMessages;
  models: AiModelDescriptor[];
  initialDocuments: DocumentRecord[];
  initialGenerations: AssessmentGeneration[];
};

export function AssessmentStudio({
  messages,
  models,
  initialDocuments,
  initialGenerations,
}: AssessmentStudioProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [generations, setGenerations] = useState(initialGenerations);
  const [request, setRequest] = useState<AssessmentRequest>({
    prompt: "",
    questionCount: 6,
    difficulty: "medium",
    modelId: models[0]?.id ?? "google-balanced",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestGeneration = generations[0] ?? null;
  const documentOptions = useMemo(() => documents.slice(0, 20), [documents]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/assessment", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as ApiResult<AssessmentGeneration>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "ASSESSMENT_FAILED" : payload.error.message);
      }

      setGenerations((current) => [payload.data, ...current]);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Assessment generation failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="surface-card rounded-[2rem] p-6">
          <p className="section-label">{messages.assessmentTitle}</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.05em]">
            {messages.assessmentSubtitle}
          </h2>
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="assessment-prompt" className="field-label">
                {messages.assessmentPromptLabel}
              </label>
              <textarea
                id="assessment-prompt"
                value={request.prompt}
                required
                rows={5}
                onChange={(event) =>
                  setRequest((current) => ({
                    ...current,
                    prompt: event.target.value,
                  }))
                }
                className="field-control resize-y"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="assessment-count" className="field-label">
                  {messages.assessmentQuestionCount}
                </label>
                <select
                  id="assessment-count"
                  value={request.questionCount}
                  onChange={(event) =>
                    setRequest((current) => ({
                      ...current,
                      questionCount: Number(event.target.value),
                    }))
                  }
                  className="field-control"
                >
                  {[4, 6, 8, 10].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assessment-difficulty" className="field-label">
                  {messages.assessmentDifficulty}
                </label>
                <select
                  id="assessment-difficulty"
                  value={request.difficulty}
                  onChange={(event) =>
                    setRequest((current) => ({
                      ...current,
                      difficulty: event.target.value as AssessmentRequest["difficulty"],
                    }))
                  }
                  className="field-control"
                >
                  <option value="easy">{messages.difficultyEasy}</option>
                  <option value="medium">{messages.difficultyMedium}</option>
                  <option value="hard">{messages.difficultyHard}</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="assessment-model" className="field-label">
                  {messages.modelLabel}
                </label>
                <select
                  id="assessment-model"
                  value={request.modelId}
                  onChange={(event) =>
                    setRequest((current) => ({
                      ...current,
                      modelId: event.target.value,
                    }))
                  }
                  className="field-control"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assessment-document" className="field-label">
                  {messages.documentContextLabel}
                </label>
                <select
                  id="assessment-document"
                  value={request.documentId || ""}
                  onChange={(event) =>
                    setRequest((current) => ({
                      ...current,
                      documentId: event.target.value || undefined,
                    }))
                  }
                  className="field-control"
                >
                  <option value="">{messages.noLinkedDocument}</option>
                  {documentOptions.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.fileName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" disabled={pending} className="action-button">
              {pending ? messages.loading : messages.assessmentGenerate}
            </button>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </form>
        </section>

        <section className="surface-card rounded-[2rem] p-6">
          <p className="section-label">{messages.assessmentLatestTitle}</p>
          {latestGeneration ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em]">
                  {latestGeneration.title}
                </h3>
                <p className="mt-2 text-sm text-foreground-muted">
                  {latestGeneration.questions.length} questions
                </p>
              </div>
              <div className="space-y-3">
                {latestGeneration.questions.map((question, index) => (
                  <article
                    key={`${latestGeneration.id}-${index + 1}`}
                    className="rounded-2xl border border-border bg-background-strong p-4"
                  >
                    <p className="font-semibold text-foreground">{question.question}</p>
                    <p className="mt-2 text-sm leading-7 text-foreground-muted">
                      {question.answer}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">{messages.assessmentEmpty}</div>
          )}
        </section>
      </div>

      <UploadWorkspace
        messages={messages}
        initialDocuments={documents}
        onDocumentCreated={(document) => {
          setDocuments((current) => [document, ...current]);
          setRequest((current) => ({
            ...current,
            documentId: document.id,
          }));
        }}
        title={messages.uploadWorkspaceTitle}
        description={messages.uploadHint}
      />

      <section className="surface-card rounded-[2rem] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-label">{messages.assessmentHistoryTitle}</p>
            <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em]">
              {messages.recentAssessmentsTitle}
            </h3>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {generations.length === 0 ? (
            <div className="empty-state">{messages.assessmentEmpty}</div>
          ) : (
            generations.map((generation) => (
              <div
                key={generation.id}
                className="rounded-2xl border border-border bg-background-strong px-4 py-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{generation.title}</p>
                    <p className="text-sm text-foreground-muted">
                      {generation.questions.length} questions
                    </p>
                  </div>
                  <span className="chip">{generation.modelId}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
