"use client";

import type {
  AdminAssessmentCreditMutationInput,
  AdminAssessmentCreditState,
  AdminUserAssessmentCreditsResponse,
  ApiResult,
  Locale,
  UserDocument,
  UserRole,
  UserStatus,
} from "@zootopia/shared-types";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { dispatchAssessmentCreditRefresh } from "@/lib/assessment-credit-events";
import type { AppMessages } from "@/lib/messages";

type UsersTableProps = {
  messages: AppMessages;
  locale: Locale;
  initialUsers: UserDocument[];
  currentUserId: string;
};

type CreditDraft = {
  manualAmount: string;
  manualSetAmount: string;
  dailyOverride: string;
  grantAmount: string;
  grantExpiresAt: string;
  grantReason: string;
};

const EMPTY_CREDIT_DRAFT: CreditDraft = {
  manualAmount: "1",
  manualSetAmount: "0",
  dailyOverride: "",
  grantAmount: "1",
  grantExpiresAt: "",
  grantReason: "",
};

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseNonNegativeInteger(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function buildCreditDraft(state: AdminAssessmentCreditState): CreditDraft {
  return {
    manualAmount: "1",
    manualSetAmount: String(state.account.manualCredits),
    dailyOverride:
      typeof state.account.dailyLimitOverride === "number"
        ? String(state.account.dailyLimitOverride)
        : "",
    grantAmount: "1",
    grantExpiresAt: "",
    grantReason: "",
  };
}

export function UsersTable({
  messages,
  locale,
  initialUsers,
  currentUserId,
}: UsersTableProps) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [creditsBusyUserId, setCreditsBusyUserId] = useState<string | null>(null);
  const [expandedCreditsUserId, setExpandedCreditsUserId] = useState<string | null>(null);
  const [creditsByUserId, setCreditsByUserId] = useState<
    Record<string, AdminAssessmentCreditState | undefined>
  >({});
  const [creditDraftsByUserId, setCreditDraftsByUserId] = useState<
    Record<string, CreditDraft | undefined>
  >({});
  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
  });
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  function updateCreditDraft(
    uid: string,
    updater: (draft: CreditDraft) => CreditDraft,
  ) {
    setCreditDraftsByUserId((current) => {
      const nextDraft = updater(current[uid] ?? EMPTY_CREDIT_DRAFT);
      return {
        ...current,
        [uid]: nextDraft,
      };
    });
  }

  async function patchUser(
    uid: string,
    path: "role" | "status",
    payload: { role?: UserRole; status?: UserStatus },
  ) {
    setBusyUserId(uid);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${uid}/${path}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as ApiResult<{ user: UserDocument }>;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "USER_UPDATE_FAILED" : body.error.message);
      }

      setUsers((current) =>
        current.map((user) => (user.uid === uid ? body.data.user : user)),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "User update failed.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function fetchUserCredits(uid: string) {
    setCreditsBusyUserId(uid);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${uid}/credits`, {
        method: "GET",
      });
      const body =
        (await response.json()) as ApiResult<AdminUserAssessmentCreditsResponse>;

      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "ASSESSMENT_CREDIT_LOAD_FAILED" : body.error.message);
      }

      setUsers((current) =>
        current.map((user) => (user.uid === uid ? body.data.user : user)),
      );
      setCreditsByUserId((current) => ({
        ...current,
        [uid]: body.data.state,
      }));
      setCreditDraftsByUserId((current) => ({
        ...current,
        [uid]: buildCreditDraft(body.data.state),
      }));

      return body.data.state;
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : messages.assessmentFieldGenericError,
      );
      return null;
    } finally {
      setCreditsBusyUserId(null);
    }
  }

  async function patchCredits(uid: string, mutation: AdminAssessmentCreditMutationInput) {
    setCreditsBusyUserId(uid);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${uid}/credits`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(mutation),
      });
      const body =
        (await response.json()) as ApiResult<AdminUserAssessmentCreditsResponse>;

      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "ASSESSMENT_CREDIT_UPDATE_FAILED" : body.error.message);
      }

      setUsers((current) =>
        current.map((user) => (user.uid === uid ? body.data.user : user)),
      );
      setCreditsByUserId((current) => ({
        ...current,
        [uid]: body.data.state,
      }));
      setCreditDraftsByUserId((current) => {
        const preservedDraft = current[uid] ?? EMPTY_CREDIT_DRAFT;
        return {
          ...current,
          [uid]: {
            ...buildCreditDraft(body.data.state),
            grantReason: preservedDraft.grantReason,
            grantExpiresAt: preservedDraft.grantExpiresAt,
          },
        };
      });

      dispatchAssessmentCreditRefresh();
      return body.data.state;
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : messages.assessmentFieldGenericError,
      );
      return null;
    } finally {
      setCreditsBusyUserId(null);
    }
  }

  async function toggleCreditsPanel(uid: string) {
    if (expandedCreditsUserId === uid) {
      setExpandedCreditsUserId(null);
      return;
    }

    setExpandedCreditsUserId(uid);
    if (!creditsByUserId[uid]) {
      await fetchUserCredits(uid);
    }
  }

  async function handleToggleAssessmentAccess(uid: string, nextAccess: "enabled" | "disabled") {
    await patchCredits(uid, {
      action: "set_access",
      access: nextAccess,
    });
  }

  async function handleSaveDailyOverride(uid: string) {
    const draft = creditDraftsByUserId[uid] ?? EMPTY_CREDIT_DRAFT;
    if (!draft.dailyOverride.trim()) {
      await patchCredits(uid, {
        action: "clear_daily_override",
      });
      return;
    }

    const amount = parsePositiveInteger(draft.dailyOverride);
    if (!amount) {
      setError(messages.adminAssessmentCreditsDailyOverrideInvalid);
      return;
    }

    await patchCredits(uid, {
      action: "set_daily_override",
      dailyLimitOverride: amount,
    });
  }

  async function handleManualCreditsMutation(
    uid: string,
    action: "add_manual_credits" | "subtract_manual_credits" | "set_manual_credits",
  ) {
    const draft = creditDraftsByUserId[uid] ?? EMPTY_CREDIT_DRAFT;
    const amount =
      action === "set_manual_credits"
        ? parseNonNegativeInteger(draft.manualSetAmount)
        : parsePositiveInteger(draft.manualAmount);
    if (amount === null) {
      setError(messages.adminAssessmentCreditsAmountInvalid);
      return;
    }

    await patchCredits(uid, {
      action,
      amount,
    });
  }

  async function handleGrantCredits(uid: string) {
    const draft = creditDraftsByUserId[uid] ?? EMPTY_CREDIT_DRAFT;
    const amount = parsePositiveInteger(draft.grantAmount);
    if (!amount) {
      setError(messages.adminAssessmentCreditsAmountInvalid);
      return;
    }

    const expiresAtRaw = draft.grantExpiresAt.trim();
    const expiresAtDate = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (expiresAtDate && Number.isNaN(expiresAtDate.getTime())) {
      setError(messages.adminAssessmentCreditsGrantExpiryInvalid);
      return;
    }

    await patchCredits(uid, {
      action: "grant_credits",
      amount,
      expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null,
      reason: draft.grantReason.trim() || undefined,
    });
  }

  async function handleRevokeGrant(uid: string, grantId: string) {
    await patchCredits(uid, {
      action: "revoke_grant",
      grantId,
    });
  }

  return (
    <div className="space-y-6 animate-float translate-y-0">
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-danger shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-[2rem] border border-border bg-background-elevated shadow-sm backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border bg-background-strong/50 uppercase tracking-wider text-foreground-muted">
              <tr>
                <th className="whitespace-nowrap px-6 py-5 font-semibold">{messages.tableUser}</th>
                <th className="whitespace-nowrap px-6 py-5 font-semibold">{messages.tableRole}</th>
                <th className="whitespace-nowrap px-6 py-5 font-semibold">{messages.tableStatus}</th>
                <th className="whitespace-nowrap px-6 py-5 text-end font-semibold">{messages.adminActionsTitle}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-foreground-muted">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-border-strong/10">
                        <Shield className="h-6 w-6 text-foreground-muted/40" />
                      </div>
                      <p className="text-[1.05rem] font-medium">{messages.noUsers}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const locked = user.uid === currentUserId;
                  const pending = busyUserId === user.uid;
                  const isAdmin = user.role === "admin";
                  const isActive = user.status === "active";
                  const userInitial = (user.fullName || user.displayName || user.email || user.uid || "U")
                    .charAt(0)
                    .toUpperCase();
                  const joinedLabel = dateFormatter.format(new Date(user.createdAt));
                  const universityCode = user.universityCode || "—";
                  const roleActionLabel = isAdmin
                    ? messages.adminDemoteAction
                    : messages.adminPromoteAction;
                  const statusActionLabel = isActive
                    ? messages.adminBlockAction
                    : messages.adminUnblockAction;
                  const expandedCredits = expandedCreditsUserId === user.uid;
                  const creditState = creditsByUserId[user.uid];
                  const creditDraft = creditDraftsByUserId[user.uid] ?? EMPTY_CREDIT_DRAFT;
                  const creditsPending = creditsBusyUserId === user.uid;
                  const creditsRemainingLabel = creditState?.credits.isAdminExempt
                    ? messages.roleAdmin
                    : String(creditState?.credits.remainingCount ?? "0");
                  const creditsExtraLabel = creditState
                    ? String(creditState.credits.extraCreditsAvailable)
                    : "0";
                  const creditsDailyLabel = creditState
                    ? `${creditState.credits.usedCount}/${creditState.credits.dailyLimit}`
                    : "0/0";
                  const accessEnabled =
                    (creditState?.account.assessmentAccess ?? "enabled") === "enabled";

                  return (
                    <tr key={user.uid} className="transition-colors hover:bg-background-strong/40">
                      <td className="px-6 py-5">
                        <div className="flex items-start gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 font-[family-name:var(--font-display)] text-lg font-bold text-accent shadow-sm">
                            {userInitial}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-foreground">
                                {user.fullName || user.displayName || user.email || user.uid}
                              </p>
                              {locked ? (
                                <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-accent-strong">
                                  {messages.adminCurrentUserBadge}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 font-mono text-[0.8rem] text-foreground-muted opacity-80">
                              {user.email || user.uid}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-[0.72rem] font-medium text-foreground-muted">
                              <span className="rounded-full border border-border bg-background-strong/60 px-2.5 py-1">
                                {messages.adminUserCodeLabel}: {universityCode}
                              </span>
                              <span className="rounded-full border border-border bg-background-strong/60 px-2.5 py-1">
                                {messages.adminUserJoinedLabel}: {joinedLabel}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-1 ${
                                  user.profileCompleted
                                    ? "border-accent/25 bg-accent/10 text-accent-strong"
                                    : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                }`}
                              >
                                {user.profileCompleted
                                  ? messages.adminUserProfileComplete
                                  : messages.adminUserProfileIncomplete}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                            isAdmin
                              ? "bg-gold/15 text-[#b48d3c]"
                              : "bg-foreground/5 text-foreground-muted"
                          }`}
                        >
                          {isAdmin ? (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldAlert className="h-3.5 w-3.5" />
                          )}
                          {isAdmin ? messages.roleAdmin : messages.roleUser}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                            isActive
                              ? "bg-accent/15 text-accent-strong"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          {isActive ? messages.statusActive : messages.statusSuspended}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending || locked}
                            onClick={() =>
                              void patchUser(user.uid, "role", {
                                role: isAdmin ? "user" : "admin",
                              })
                            }
                            className="min-w-[140px] bg-background-strong shadow-sm"
                          >
                            {pending ? (
                              <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
                            ) : isAdmin ? (
                              <ShieldAlert className="h-4 w-4 shrink-0 text-foreground-muted" />
                            ) : (
                              <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
                            )}
                            <span>{roleActionLabel}</span>
                          </Button>

                          <Button
                            variant={isActive ? "outline" : "default"}
                            size="sm"
                            disabled={pending || locked}
                            onClick={() =>
                              void patchUser(user.uid, "status", {
                                status: isActive ? "suspended" : "active",
                              })
                            }
                            className={`min-w-[150px] shadow-sm ${isActive ? "border-danger/30 text-danger hover:bg-danger hover:text-white" : ""}`}
                          >
                            {pending ? (
                              <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
                            ) : isActive ? (
                              <UserX className="h-4 w-4 shrink-0" />
                            ) : (
                              <UserCheck className="h-4 w-4 shrink-0" />
                            )}
                            <span>{statusActionLabel}</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={creditsPending}
                            onClick={() => {
                              void toggleCreditsPanel(user.uid);
                            }}
                            className="min-w-[170px] bg-background-strong shadow-sm"
                          >
                            {creditsPending ? (
                              <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
                            ) : expandedCredits ? (
                              <ChevronUp className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            )}
                            <span>{messages.adminAssessmentCreditsManageAction}</span>
                          </Button>
                        </div>

                        {expandedCredits ? (
                          <div className="mt-3 w-full rounded-2xl border border-border bg-background-elevated/70 p-4 text-start">
                            {creditState ? (
                              <div className="space-y-4">
                                {/* This admin panel controls server-authoritative assessment credits.
                                    Keep all mutations routed through backend APIs so access, limits, and grants remain enforceable across tabs/devices. */}
                                <div className="grid gap-2 md:grid-cols-3">
                                  <div className="rounded-xl border border-border bg-background-strong/60 px-3 py-2">
                                    <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-foreground-muted">
                                      {messages.adminAssessmentCreditsRemainingLabel}
                                    </p>
                                    <p className="mt-1 text-base font-bold text-foreground">
                                      {creditsRemainingLabel}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-border bg-background-strong/60 px-3 py-2">
                                    <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-foreground-muted">
                                      {messages.adminAssessmentCreditsDailyLabel}
                                    </p>
                                    <p className="mt-1 text-base font-bold text-foreground">
                                      {creditsDailyLabel}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-border bg-background-strong/60 px-3 py-2">
                                    <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-foreground-muted">
                                      {messages.adminAssessmentCreditsExtraLabel}
                                    </p>
                                    <p className="mt-1 text-base font-bold text-foreground">
                                      {creditsExtraLabel}
                                    </p>
                                  </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-2 rounded-xl border border-border bg-background-strong/60 p-3">
                                    <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                                      {messages.adminAssessmentCreditsAccessLabel}
                                    </p>
                                    <p className="text-sm font-semibold text-foreground">
                                      {accessEnabled
                                        ? messages.adminAssessmentCreditsAccessEnabled
                                        : messages.adminAssessmentCreditsAccessDisabled}
                                    </p>
                                    <Button
                                      type="button"
                                      variant={accessEnabled ? "outline" : "default"}
                                      size="sm"
                                      disabled={creditsPending}
                                      onClick={() => {
                                        void handleToggleAssessmentAccess(
                                          user.uid,
                                          accessEnabled ? "disabled" : "enabled",
                                        );
                                      }}
                                      className="w-full"
                                    >
                                      {accessEnabled
                                        ? messages.adminAssessmentCreditsDisableAction
                                        : messages.adminAssessmentCreditsEnableAction}
                                    </Button>
                                  </div>

                                  <div className="space-y-2 rounded-xl border border-border bg-background-strong/60 p-3">
                                    <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                                      {messages.adminAssessmentCreditsDailyOverrideLabel}
                                    </p>
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={creditDraft.dailyOverride}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          dailyOverride: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10 w-full"
                                      placeholder={messages.adminAssessmentCreditsDailyOverridePlaceholder}
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={creditsPending}
                                        onClick={() => {
                                          void handleSaveDailyOverride(user.uid);
                                        }}
                                        className="flex-1"
                                      >
                                        {messages.adminAssessmentCreditsSaveOverrideAction}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={creditsPending}
                                        onClick={() => {
                                          updateCreditDraft(user.uid, (current) => ({
                                            ...current,
                                            dailyOverride: "",
                                          }));
                                          void patchCredits(user.uid, {
                                            action: "clear_daily_override",
                                          });
                                        }}
                                        className="flex-1"
                                      >
                                        {messages.adminAssessmentCreditsClearOverrideAction}
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2 rounded-xl border border-border bg-background-strong/60 p-3">
                                  <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                                    {messages.adminAssessmentCreditsManualLabel}
                                  </p>
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={creditDraft.manualAmount}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          manualAmount: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                      placeholder={messages.adminAssessmentCreditsAmountPlaceholder}
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={creditDraft.manualSetAmount}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          manualSetAmount: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                      placeholder={messages.adminAssessmentCreditsSetAmountPlaceholder}
                                    />
                                  </div>
                                  <div className="grid gap-2 md:grid-cols-3">
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={creditsPending}
                                      onClick={() => {
                                        void handleManualCreditsMutation(
                                          user.uid,
                                          "add_manual_credits",
                                        );
                                      }}
                                    >
                                      {messages.adminAssessmentCreditsAddAction}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={creditsPending}
                                      onClick={() => {
                                        void handleManualCreditsMutation(
                                          user.uid,
                                          "subtract_manual_credits",
                                        );
                                      }}
                                    >
                                      {messages.adminAssessmentCreditsSubtractAction}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={creditsPending}
                                      onClick={() => {
                                        void handleManualCreditsMutation(
                                          user.uid,
                                          "set_manual_credits",
                                        );
                                      }}
                                    >
                                      {messages.adminAssessmentCreditsSetAction}
                                    </Button>
                                  </div>
                                </div>

                                <div className="space-y-2 rounded-xl border border-border bg-background-strong/60 p-3">
                                  <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                                    {messages.adminAssessmentCreditsGrantLabel}
                                  </p>
                                  <div className="grid gap-2 md:grid-cols-3">
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={creditDraft.grantAmount}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          grantAmount: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                      placeholder={messages.adminAssessmentCreditsGrantAmountPlaceholder}
                                    />
                                    <input
                                      type="datetime-local"
                                      value={creditDraft.grantExpiresAt}
                                      min={toLocalDateTimeInput(new Date().toISOString())}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          grantExpiresAt: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                    />
                                    <input
                                      type="text"
                                      value={creditDraft.grantReason}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          grantReason: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                      placeholder={messages.adminAssessmentCreditsGrantReasonPlaceholder}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={creditsPending}
                                    onClick={() => {
                                      void handleGrantCredits(user.uid);
                                    }}
                                    className="w-full"
                                  >
                                    {messages.adminAssessmentCreditsGrantAction}
                                  </Button>
                                </div>

                                <div className="space-y-2 rounded-xl border border-border bg-background-strong/60 p-3">
                                  <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                                    {messages.adminAssessmentCreditsGrantListLabel}
                                  </p>
                                  {creditState.grants.length === 0 ? (
                                    <p className="text-sm text-foreground-muted">
                                      {messages.adminAssessmentCreditsNoGrants}
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {creditState.grants.map((grant) => {
                                        const grantStatusLabel =
                                          grant.effectiveStatus === "active"
                                            ? messages.statusActive
                                            : grant.effectiveStatus === "revoked"
                                              ? messages.adminAssessmentCreditsGrantRevokedLabel
                                              : grant.effectiveStatus === "expired"
                                                ? messages.adminAssessmentCreditsGrantExpiredLabel
                                                : messages.adminAssessmentCreditsGrantExhaustedLabel;

                                        return (
                                          <div
                                            key={grant.id}
                                            className="rounded-xl border border-border bg-background px-3 py-2"
                                          >
                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                              <div className="min-w-0">
                                                <p className="text-sm font-semibold text-foreground">
                                                  {grant.available}/{grant.credits}
                                                </p>
                                                <p className="text-xs text-foreground-muted">
                                                  {grantStatusLabel}
                                                  {grant.expiresAt
                                                    ? ` • ${dateTimeFormatter.format(new Date(grant.expiresAt))}`
                                                    : ""}
                                                </p>
                                                {grant.reason ? (
                                                  <p className="mt-1 text-xs text-foreground-muted">
                                                    {grant.reason}
                                                  </p>
                                                ) : null}
                                              </div>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={
                                                  creditsPending || grant.effectiveStatus !== "active"
                                                }
                                                onClick={() => {
                                                  void handleRevokeGrant(user.uid, grant.id);
                                                }}
                                                className="md:min-w-[150px]"
                                              >
                                                {messages.adminAssessmentCreditsGrantRevokeAction}
                                              </Button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-foreground-muted">
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                                <span>{messages.loading}</span>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
