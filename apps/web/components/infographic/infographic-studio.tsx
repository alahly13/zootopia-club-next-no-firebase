"use client";

import type {
  AiModelDescriptor,
  ApiResult,
  DocumentRecord,
  InfographicGeneration,
  InfographicRequest,
} from "@zootopia/shared-types";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import type { AppMessages } from "@/lib/messages";

import { UploadWorkspace } from "@/components/upload/upload-workspace";

type InfographicStudioProps = {
  messages: AppMessages;
  models: AiModelDescriptor[];
  initialDocuments: DocumentRecord[];
  initialGenerations: InfographicGeneration[];
};

export function InfographicStudio({
  messages,
  models,
  initialDocuments,
  initialGenerations,
}: InfographicStudioProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [generations, setGenerations] = useState(initialGenerations);
  const [request, setRequest] = useState<InfographicRequest>({
    topic: "",
    style: "balanced",
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
      const response = await fetch("/api/infographic", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as ApiResult<InfographicGeneration>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "INFOGRAPHIC_FAILED" : payload.error.message);
      }

      setGenerations((current) => [payload.data, ...current]);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Infographic generation failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="surface-card rounded-[2rem] p-6">
          <p className="section-label">{messages.infographicTitle}</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.05em]">
            {messages.infographicSubtitle}
          </h2>
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="infographic-topic" className="field-label">
                {messages.infographicTopicLabel}
              </label>
              <textarea
                id="infographic-topic"
                value={request.topic}
                required
                rows={4}
                onChange={(event) =>
                  setRequest((current) => ({
                    ...current,
                    topic: event.target.value,
                  }))
                }
                className="field-control resize-y"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="infographic-style" className="field-label">
                  {messages.infographicStyleLabel}
                </label>
                <select
                  id="infographic-style"
                  value={request.style}
                  onChange={(event) =>
                    setRequest((current) => ({
                      ...current,
                      style: event.target.value as InfographicRequest["style"],
                    }))
                  }
                  className="field-control"
                >
                  <option value="academic">{messages.styleAcademic}</option>
                  <option value="balanced">{messages.styleBalanced}</option>
                  <option value="bold">{messages.styleBold}</option>
                </select>
              </div>
              <div>
                <label htmlFor="infographic-model" className="field-label">
                  {messages.modelLabel}
                </label>
                <select
                  id="infographic-model"
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
            </div>

            <div>
              <label htmlFor="infographic-document" className="field-label">
                {messages.documentContextLabel}
              </label>
              <select
                id="infographic-document"
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

            <button type="submit" disabled={pending} className="action-button">
              {pending ? messages.loading : messages.infographicGenerate}
            </button>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </form>
        </section>

        <section className="surface-card rounded-[2rem] p-6">
          <p className="section-label">{messages.infographicLatestTitle}</p>
          {latestGeneration ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em]">
                  {latestGeneration.topic}
                </h3>
                <p className="mt-2 text-sm text-foreground-muted">{latestGeneration.modelId}</p>
              </div>
              <div className="overflow-hidden rounded-[1.5rem] border border-border bg-white p-3">
                <div
                  className="w-full overflow-auto"
                  dangerouslySetInnerHTML={{ __html: latestGeneration.imageSvg }}
                />
              </div>
            </div>
          ) : (
            <div className="empty-state">{messages.infographicEmpty}</div>
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
        <p className="section-label">{messages.infographicHistoryTitle}</p>
        <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em]">
          {messages.recentInfographicsTitle}
        </h3>
        <div className="mt-5 space-y-3">
          {generations.length === 0 ? (
            <div className="empty-state">{messages.infographicEmpty}</div>
          ) : (
            generations.map((generation) => (
              <div
                key={generation.id}
                className="rounded-2xl border border-border bg-background-strong px-4 py-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{generation.topic}</p>
                    <p className="text-sm text-foreground-muted">
                      {messages.svgBlueprintReady}
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
