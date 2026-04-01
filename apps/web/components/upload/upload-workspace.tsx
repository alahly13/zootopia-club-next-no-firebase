"use client";

import type { ApiResult, DocumentRecord, UploadResponse } from "@zootopia/shared-types";
import { validateUploadDescriptor } from "@zootopia/shared-utils";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import type { AppMessages } from "@/lib/messages";

type UploadWorkspaceProps = {
  messages: AppMessages;
  initialDocuments: DocumentRecord[];
  onDocumentCreated?: (document: DocumentRecord) => void;
  title?: string;
  description?: string;
};

export function UploadWorkspace({
  messages,
  initialDocuments,
  onDocumentCreated,
  title,
  description,
}: UploadWorkspaceProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");

    if (!(file instanceof File)) {
      setError("Select a file before uploading.");
      return;
    }

    try {
      validateUploadDescriptor({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "This file is not supported.",
      );
      return;
    }

    setPending(true);
    setError(null);

    try {
      const requestBody = new FormData();
      requestBody.append("file", file);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: requestBody,
      });

      const payload = (await response.json()) as ApiResult<UploadResponse>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "UPLOAD_FAILED" : payload.error.message);
      }

      setDocuments((current) => [payload.data.document, ...current]);
      setWarnings(payload.data.warnings);
      onDocumentCreated?.(payload.data.document);
      event.currentTarget.reset();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface-card rounded-[2rem] p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          {title ? <p className="section-label">{title}</p> : null}
          <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em]">
            {messages.uploadLabel}
          </h3>
          <p className="mt-2 text-sm leading-7 text-foreground-muted">
            {description || messages.uploadHint}
          </p>
        </div>
      </div>

      <form className="mt-6 flex flex-col gap-4 md:flex-row" onSubmit={handleUpload}>
        <input
          name="file"
          type="file"
          className="field-control flex-1"
          accept=".pdf,.docx,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.webp"
        />
        <button type="submit" disabled={pending} className="action-button whitespace-nowrap">
          {pending ? messages.loading : messages.uploadButton}
        </button>
      </form>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {warnings.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border bg-background-strong p-4">
          <p className="text-sm font-semibold text-foreground">
            {messages.uploadNotesTitle}
          </p>
          <ul className="mt-2 space-y-2 text-sm text-foreground-muted">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {documents.length === 0 ? (
          <div className="empty-state">{messages.noDocuments}</div>
        ) : (
          documents.slice(0, 5).map((document) => (
            <div
              key={document.id}
              className="rounded-2xl border border-border bg-background-strong px-4 py-3"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-foreground">{document.fileName}</p>
                  <p className="text-sm text-foreground-muted">
                    {Math.max(1, Math.round(document.sizeBytes / 1024))} KB
                  </p>
                </div>
                <span className="chip">{document.status}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
