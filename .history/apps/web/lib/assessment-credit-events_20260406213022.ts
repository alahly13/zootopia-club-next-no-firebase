export const ASSESSMENT_CREDIT_REFRESH_EVENT =
  "zootopia:assessment-credit-refresh";

export function dispatchAssessmentCreditRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(ASSESSMENT_CREDIT_REFRESH_EVENT));
}
