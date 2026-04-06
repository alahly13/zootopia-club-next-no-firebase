import type {
  AssessmentCreditAccountAccess,
  AssessmentCreditAccountRecord,
  AssessmentCreditGrantAdminView,
  AssessmentDailyCreditsSummary,
} from "./assessment";
import type { UserDocument } from "./user";

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  totalDocuments: number;
  totalAssessmentGenerations: number;
  totalInfographicGenerations: number;
}

export interface AdminUsersResponse {
  users: UserDocument[];
}

export type AdminIdentifierType = "email" | "username";
export type AdminIdentifierResolutionSource = "allowlisted_email" | "username_alias";

export interface AdminIdentifierResolution {
  email: string;
  identifierType: AdminIdentifierType;
  resolutionSource: AdminIdentifierResolutionSource;
}

export type AdminAssessmentCreditMutationAction =
  | "set_access"
  | "set_daily_override"
  | "clear_daily_override"
  | "add_manual_credits"
  | "subtract_manual_credits"
  | "set_manual_credits"
  | "grant_credits"
  | "revoke_grant";

export interface AdminAssessmentCreditMutationInput {
  action: AdminAssessmentCreditMutationAction;
  amount?: number;
  dailyLimitOverride?: number | null;
  access?: AssessmentCreditAccountAccess;
  expiresAt?: string | null;
  reason?: string;
  note?: string;
  grantId?: string;
}

export interface AdminAssessmentCreditState {
  ownerUid: string;
  account: AssessmentCreditAccountRecord;
  credits: AssessmentDailyCreditsSummary;
  grants: AssessmentCreditGrantAdminView[];
}

export interface AdminUserAssessmentCreditsResponse {
  user: UserDocument;
  state: AdminAssessmentCreditState;
}
