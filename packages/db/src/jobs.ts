/** Job queue names and payloads shared by the brain (workers) and the web app (producers). */
export const QUEUES = {
  caseVerify: "case-verify",
  caseAggregate: "case-aggregate",
  alertCase: "alert-case",
  alertNotice: "alert-notice",
  alertGoNow: "alert-go-now",
  dial: "dial",
  sweepLateness: "sweep-lateness",
  webhook: "webhook-aethex",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface CaseVerifyJob { caseId: string }
export interface CaseAggregateJob { caseId: string; reason: "answer" | "deadline" | "override" }
export interface AlertCaseJob { caseId: string; correction?: boolean }
export interface AlertNoticeJob { noticeId: string }
export interface AlertGoNowJob { puId: string }
export interface DialJob {
  purpose: "verify" | "case_alert" | "notice_alert" | "go_now" | "late_official" | "late_supervisor";
  personId: string;
  refId: string;
  /** verification_request id or alert id, used to tie the Aethex call back to its row */
  rowId: string;
  attempt: number;
}
export interface WebhookJob { eventId: string; type: string; payload: unknown }
