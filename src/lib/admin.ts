import { supabase } from "@/integrations/supabase/client";
import { callRpc } from "@/lib/rpc";

/** Admin tools. Every call is checked again by the database. */

export type Overview = {
  users: number;
  new_users_7d: number;
  suspended: number;
  open_reports: number;
  new_feedback: number;
  errors_24h: number;
  paid_minutes_today: number;
};

export type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  status: "active" | "suspended";
  status_reason: string | null;
  reports_against: number;
};

export type AdminReport = {
  id: string;
  created_at: string;
  status: "open" | "reviewed" | "actioned";
  reason: string;
  details: string | null;
  also_blocked: boolean;
  message_snapshot: { content?: string; created_at?: string } | null;
  reporter_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  reported_user_id: string | null;
  reported_name: string | null;
  reported_email: string | null;
  reported_status: "active" | "suspended";
  reports_against: number;
};

export type CallMinutes = { user_id: string; display_name: string | null; email: string | null; calls: number; minutes: number };

export type AppProblem = {
  id: string;
  kind: string;
  message: string;
  stack: string | null;
  url: string | null;
  app_build: string | null;
  platform: string | null;
  user_agent: string | null;
  language: string | null;
  times: number;
  first_seen_at: string;
  last_seen_at: string;
  user_id: string | null;
  user_email: string | null;
};

export type AdminFeedback = {
  id: string;
  created_at: string;
  status: "new" | "seen" | "done";
  category: string;
  message: string;
  screenshot_path: string | null;
  app_build: string | null;
  platform: string | null;
  device: string | null;
  language: string | null;
  page: string | null;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
};

export async function amIAdmin(): Promise<boolean> {
  const { data, error } = await callRpc<boolean>("is_app_admin");
  return !error && data === true;
}

export async function loadOverview() {
  return callRpc<Overview>("admin_overview");
}
export async function findUsers(query: string) {
  return callRpc<AdminUser[]>("admin_find_users", { _query: query, _limit: 100 });
}
export async function suspendUser(userId: string, reason: string, ban: boolean) {
  return callRpc<null>("admin_suspend_user", { _user: userId, _reason: reason, _ban: ban });
}
export async function restoreUser(userId: string) {
  return callRpc<null>("admin_restore_user", { _user: userId });
}
export async function listReports(status: "open" | "") {
  return callRpc<AdminReport[]>("admin_list_reports", { _status: status, _limit: 200 });
}
export async function setReportStatus(id: string, status: AdminReport["status"]) {
  return callRpc<null>("admin_set_report_status", { _report: id, _status: status });
}
export async function callMinutes(days: number) {
  return callRpc<CallMinutes[]>("admin_call_minutes", { _days: days });
}
export async function listProblems() {
  return callRpc<AppProblem[]>("admin_list_errors", { _limit: 200 });
}
export async function listFeedback() {
  return callRpc<AdminFeedback[]>("admin_list_feedback", { _limit: 200 });
}
export async function setFeedbackStatus(id: string, status: AdminFeedback["status"]) {
  return callRpc<null>("admin_set_feedback_status", { _feedback: id, _status: status });
}

/** A short-lived link to a feedback screenshot. */
export async function screenshotLink(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("feedback").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
