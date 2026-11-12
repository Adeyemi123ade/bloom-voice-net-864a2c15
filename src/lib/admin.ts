import { supabase } from "@/integrations/supabase/client";
import { callRpc } from "@/lib/rpc";

/** Admin tools. Every call is checked again by the database. */

export type Overview = {
  users: number;
  new_users_7d: number;
  suspended: number;
  removed?: number;
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
  status: AccountState;
  status_reason: string | null;
  reports_against: number;
  suspended_until?: string | null;
  is_test?: boolean;
  is_admin?: boolean;
  plan?: string | null;
  dial_pad?: boolean | null;
  app_calls?: boolean | null;
};

export type AccountState = "active" | "suspended" | "removed";

/** Where a report, feedback or problem came from. */
export type Origin = "live" | "preview" | "local" | "unknown";

export type PersonDetail = {
  plan: "free" | "premium";
  plan_expires_at: string | null;
  effective_plan: string;
  dial_pad_override: boolean | null;
  daily_minutes_override: number | null;
  dial_pad: boolean;
  daily_minutes: number;
  app_calls: boolean;
  is_test: boolean;
  balance_minutes: number;
  balance_in_use: boolean;
  used_today_minutes: number;
  used_30d_minutes: number;
  banned: boolean;
  plans: { id: string; dial_pad: boolean; daily_minutes: number }[];
  history: { created_at: string; action: string; details: Record<string, unknown>; admin_email: string | null }[];
  minutes_added: { created_at: string; minutes: number; note: string | null }[];
};

export type DialPadChoice = "plan" | "on" | "off";

export type CallSettings = {
  plan: "free" | "premium";
  planExpiresAt: string | null;
  dialPad: DialPadChoice;
  dailyMinutes: number | null;
  appCalls: boolean;
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
  reported_status: AccountState;
  reports_against: number;
  origin?: Origin;
  is_test?: boolean;
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
  origin?: Origin;
  is_test?: boolean;
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
  origin?: Origin;
  is_test?: boolean;
};

export async function amIAdmin(): Promise<boolean> {
  const { data, error } = await callRpc<boolean>("is_app_admin");
  return !error && data === true;
}

/**
 * The newest database migration this version of the app needs. Change it in
 * the same pull request as every new file in supabase/migrations (a test
 * checks this), and every migration records itself in app_migrations.
 */
export const EXPECTED_DB_VERSION = "20261030090000";

export type DbVersion =
  | { state: "ok"; live: string }
  | { state: "behind"; live: string | null }
  | { state: "unknown" };

/** Compares the live database's newest recorded migration with what this app needs. */
export function compareDbVersion(live: string | null, error: { message?: string; code?: string } | null): DbVersion {
  if (error) {
    // The version function itself is missing: the database is older than this app.
    const missing = error.code === "PGRST202" || /could not find the function|does not exist/i.test(error.message ?? "");
    return missing ? { state: "behind", live: null } : { state: "unknown" };
  }
  if (!live || live < EXPECTED_DB_VERSION) return { state: "behind", live };
  return { state: "ok", live };
}

export async function loadDbVersion(): Promise<DbVersion> {
  const { data, error } = await callRpc<string>("app_db_version");
  return compareDbVersion(data, error);
}

export async function loadOverview() {
  return callRpc<Overview>("admin_overview");
}
export async function findUsers(query: string) {
  return callRpc<AdminUser[]>("admin_find_users", { _query: query, _limit: 100 });
}
/** Suspend until a date (null = until restored); with ban, email and phone can't register again. */
export async function suspendUser(userId: string, reason: string, ban: boolean, until: string | null = null) {
  return callRpc<null>("admin_suspend_user", { _user: userId, _reason: reason, _ban: ban, _until: until });
}
/** Close the account for good (can't be undone). */
export async function removeUser(userId: string, reason: string) {
  return callRpc<null>("admin_remove_user", { _user: userId, _reason: reason });
}
export async function restoreUser(userId: string) {
  return callRpc<null>("admin_restore_user", { _user: userId });
}
export async function loadPerson(userId: string) {
  return callRpc<PersonDetail>("admin_user_detail", { _user: userId });
}
export async function saveCallSettings(userId: string, s: CallSettings) {
  return callRpc<null>("admin_set_call_settings", {
    _user: userId,
    _plan: s.plan,
    _plan_expires_at: s.plan === "premium" ? s.planExpiresAt : null,
    _dial_pad: s.dialPad,
    _daily_minutes: s.dailyMinutes,
    _app_calls: s.appCalls,
  });
}
/** Add minutes to the balance (negative takes minutes back). Returns the new balance. */
export async function addMinutes(userId: string, minutes: number, note: string) {
  return callRpc<number>("admin_add_minutes", { _user: userId, _minutes: minutes, _note: note });
}
export async function setTestAccount(userId: string, isTest: boolean) {
  return callRpc<null>("admin_set_test_account", { _user: userId, _is_test: isTest });
}
export async function listReports(status: "open" | "", showTest = false) {
  return callRpc<AdminReport[]>("admin_list_reports", { _status: status, _limit: 200, _show_test: showTest });
}
export async function setReportStatus(id: string, status: AdminReport["status"]) {
  return callRpc<null>("admin_set_report_status", { _report: id, _status: status });
}
export async function callMinutes(days: number, showTest = false) {
  return callRpc<CallMinutes[]>("admin_call_minutes", { _days: days, _show_test: showTest });
}
export async function listProblems(showTest = false) {
  return callRpc<AppProblem[]>("admin_list_errors", { _limit: 200, _show_test: showTest });
}
export async function listFeedback(showTest = false) {
  return callRpc<AdminFeedback[]>("admin_list_feedback", { _limit: 200, _show_test: showTest });
}
export async function setFeedbackStatus(id: string, status: AdminFeedback["status"]) {
  return callRpc<null>("admin_set_feedback_status", { _feedback: id, _status: status });
}

/** The dial pad choice an admin sees, from the saved override. */
export function dialPadChoice(override: boolean | null | undefined): DialPadChoice {
  return override === true ? "on" : override === false ? "off" : "plan";
}

/** Suspension lengths offered on the admin page. */
export const SUSPEND_FOR: { label: string; hours: number | null }[] = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
  { label: "Until restored", hours: null },
];

export function suspendUntil(hours: number | null, now = Date.now()): string | null {
  return hours == null ? null : new Date(now + hours * 3600_000).toISOString();
}

/** Plain words for an admin history entry. */
export function describeAction(a: { action: string; details: Record<string, unknown> }): string {
  const d = a.details ?? {};
  const reason = typeof d.reason === "string" && d.reason ? `: ${d.reason}` : "";
  switch (a.action) {
    case "suspend":
      return `Suspended${d.until ? ` until ${new Date(String(d.until)).toLocaleString()}` : ""}${reason}`;
    case "ban":
      return `Suspended and banned${d.until ? ` until ${new Date(String(d.until)).toLocaleString()}` : ""}${reason}`;
    case "remove":
      return `Removed${reason}`;
    case "restore":
      return "Restored";
    case "test_on":
      return "Marked as test account";
    case "test_off":
      return "Test account tag removed";
    case "minutes": {
      const m = Number(d.minutes);
      return `${m > 0 ? "Added" : "Took back"} ${Math.abs(m)} minutes${d.note ? ` (${String(d.note)})` : ""}`;
    }
    case "calls": {
      const parts = [
        `plan ${String(d.plan)}${d.until ? ` until ${new Date(String(d.until)).toLocaleDateString()}` : ""}`,
        `dial pad ${d.dial_pad === "plan" ? "follows plan" : String(d.dial_pad)}`,
        `daily minutes ${d.daily_minutes == null ? "follow plan" : String(d.daily_minutes)}`,
        `app calls ${d.app_calls === false ? "off" : "on"}`,
      ];
      return `Calls: ${parts.join(", ")}`;
    }
    default:
      return a.action;
  }
}

/** A short-lived link to a feedback screenshot. */
export async function screenshotLink(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("feedback").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Admin page wording for refusals from the database. */
export function plainAdminError(message: string): string {
  if (/cannot_change_admin|cannot_suspend_self/.test(message)) return "Admin accounts can't be changed here.";
  if (/removed_is_final/.test(message)) return "A removed account can't be restored.";
  if (/already_removed/.test(message)) return "This account was already removed.";
  if (/bad_date/.test(message)) return "Pick an end date in the future.";
  if (/bad_minutes/.test(message)) return "Check the number of minutes.";
  if (/reason_needed/.test(message)) return "Write a reason first.";
  if (/not_allowed/.test(message)) return "Your account isn't an admin.";
  if (/does not exist|PGRST202|Could not find the function/i.test(message)) return "The database update for this page hasn't been run yet.";
  return "Check the connection and try again.";
}
