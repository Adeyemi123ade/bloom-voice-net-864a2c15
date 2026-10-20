import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, Search } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  amIAdmin,
  callMinutes,
  findUsers,
  listFeedback,
  listProblems,
  listReports,
  loadOverview,
  restoreUser,
  screenshotLink,
  setFeedbackStatus,
  setReportStatus,
  suspendUser,
  type AdminFeedback,
  type AdminReport,
  type AdminUser,
  type AppProblem,
  type CallMinutes,
  type Overview,
} from "@/lib/admin";
import NotFound from "./NotFound";

/**
 * ChiChat admin (only for admin accounts; the database checks every action).
 * Kept in English on purpose: it's a tool for the ChiChat team, not users.
 */

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";

const REASONS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment or bullying",
  inappropriate: "Inappropriate or sexual content",
  scam: "Scam or fake account",
  violence: "Threats or violence",
  other: "Something else",
};

const FEEDBACK_KINDS: Record<string, string> = {
  broken: "Something isn't working",
  calls: "Calls",
  messages: "Messages",
  idea: "Idea",
  other: "Other",
};

type SuspendTarget = { id: string; name: string };

export default function Admin() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<SuspendTarget | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    document.title = "Admin — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void amIAdmin().then(setAllowed);
  }, [user]);

  useEffect(() => {
    if (!allowed) return;
    void loadOverview().then((r) => setOverview(r.data));
  }, [allowed, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  if (allowed === false) return <NotFound />;
  if (allowed === null) {
    return (
      <MobileFrame>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-2 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          <button
            onClick={() => navigate("/settings")}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground flex-1">Admin</h1>
          <button
            onClick={refresh}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
            aria-label="Refresh"
          >
            <RefreshCw className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {overview && (
          <div className="grid grid-cols-3 gap-2 px-4 pt-4">
            <Stat label="People" value={overview.users} />
            <Stat label="New this week" value={overview.new_users_7d} />
            <Stat label="Suspended" value={overview.suspended} />
            <Stat label="Open reports" value={overview.open_reports} warn={overview.open_reports > 0} />
            <Stat label="New feedback" value={overview.new_feedback} warn={overview.new_feedback > 0} />
            <Stat label="Problems (24 h)" value={overview.errors_24h} warn={overview.errors_24h > 0} />
            <Stat label="Paid minutes today" value={overview.paid_minutes_today} />
          </div>
        )}

        <Tabs defaultValue="reports" className="px-4 py-4">
          <TabsList className="w-full grid grid-cols-5 h-auto">
            <TabsTrigger value="reports" className="text-xs px-1">Reports</TabsTrigger>
            <TabsTrigger value="people" className="text-xs px-1">People</TabsTrigger>
            <TabsTrigger value="feedback" className="text-xs px-1">Feedback</TabsTrigger>
            <TabsTrigger value="problems" className="text-xs px-1">Problems</TabsTrigger>
            <TabsTrigger value="calls" className="text-xs px-1">Calls</TabsTrigger>
          </TabsList>
          <TabsContent value="reports">
            <ReportsTab refreshKey={refreshKey} onSuspend={setSuspendTarget} onChanged={refresh} />
          </TabsContent>
          <TabsContent value="people">
            <PeopleTab refreshKey={refreshKey} myId={user?.id} onSuspend={setSuspendTarget} onChanged={refresh} />
          </TabsContent>
          <TabsContent value="feedback">
            <FeedbackTab refreshKey={refreshKey} onChanged={refresh} />
          </TabsContent>
          <TabsContent value="problems">
            <ProblemsTab refreshKey={refreshKey} />
          </TabsContent>
          <TabsContent value="calls">
            <CallsTab refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>

        <SuspendDialog
          target={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onDone={() => {
            setSuspendTarget(null);
            refresh();
          }}
        />
      </div>
    </MobileFrame>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warn ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
      <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground text-center py-10">{text}</p>;
}

function Busy() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-1.5">{children}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const bad = status === "suspended" || status === "open" || status === "new";
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        bad ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
      }`}
    >
      {status}
    </span>
  );
}

function useList<T>(load: () => Promise<{ data: T[] | null; error: { message: string } | null }>, deps: unknown[]) {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    void load().then((r) => {
      if (cancelled) return;
      if (r.error) toast({ title: "Couldn't load this list", description: "Check the connection and refresh." });
      setRows(r.data ?? []);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}

function ReportsTab({
  refreshKey,
  onSuspend,
  onChanged,
}: {
  refreshKey: number;
  onSuspend: (t: SuspendTarget) => void;
  onChanged: () => void;
}) {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const rows = useList<AdminReport>(() => listReports(onlyOpen ? "open" : ""), [onlyOpen, refreshKey]);

  const mark = async (id: string, status: AdminReport["status"]) => {
    const { error } = await setReportStatus(id, status);
    if (error) toast({ title: "Couldn't update the report" });
    else onChanged();
  };

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex gap-2">
        <Button size="sm" variant={onlyOpen ? "default" : "outline"} onClick={() => setOnlyOpen(true)}>
          Open
        </Button>
        <Button size="sm" variant={onlyOpen ? "outline" : "default"} onClick={() => setOnlyOpen(false)}>
          All
        </Button>
      </div>
      {rows === null ? (
        <Busy />
      ) : rows.length === 0 ? (
        <Empty text={onlyOpen ? "No open reports." : "No reports yet."} />
      ) : (
        rows.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground flex-1">{REASONS[r.reason] ?? r.reason}</p>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-xs text-muted-foreground">{when(r.created_at)}</p>
            <p className="text-sm text-foreground">
              <b>{r.reported_name ?? "Unknown"}</b> ({r.reported_email ?? "no email"}) · reported {r.reports_against}{" "}
              {r.reports_against === 1 ? "time" : "times"} · {r.reported_status}
            </p>
            <p className="text-xs text-muted-foreground">
              By {r.reporter_name ?? "Unknown"} ({r.reporter_email ?? "no email"}){r.also_blocked ? " · also blocked them" : ""}
            </p>
            {r.message_snapshot?.content && (
              <p className="text-sm bg-secondary rounded-lg px-3 py-2 whitespace-pre-wrap break-words" dir="auto">
                {String(r.message_snapshot.content).slice(0, 600)}
              </p>
            )}
            {r.details && (
              <p className="text-sm text-foreground whitespace-pre-wrap break-words" dir="auto">
                “{r.details}”
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {r.status === "open" && (
                <Button size="sm" variant="outline" onClick={() => void mark(r.id, "reviewed")}>
                  Mark reviewed
                </Button>
              )}
              {r.status !== "open" && (
                <Button size="sm" variant="outline" onClick={() => void mark(r.id, "open")}>
                  Reopen
                </Button>
              )}
              {r.reported_user_id && r.reported_status !== "suspended" && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onSuspend({ id: r.reported_user_id!, name: r.reported_name ?? r.reported_email ?? "this person" })}
                >
                  Suspend
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function PeopleTab({
  refreshKey,
  myId,
  onSuspend,
  onChanged,
}: {
  refreshKey: number;
  myId?: string;
  onSuspend: (t: SuspendTarget) => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const rows = useList<AdminUser>(() => findUsers(search), [search, refreshKey]);

  const restore = async (u: AdminUser) => {
    const { error } = await restoreUser(u.id);
    if (error) toast({ title: "Couldn't restore the account" });
    else {
      toast({ title: `${u.display_name ?? u.email} restored` });
      onChanged();
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim());
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email or phone" />
        <Button type="submit" size="icon" aria-label="Search">
          <Search className="w-4 h-4" />
        </Button>
      </form>
      {rows === null ? (
        <Busy />
      ) : rows.length === 0 ? (
        <Empty text="Nobody found." />
      ) : (
        rows.map((u) => (
          <Card key={u.id}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground flex-1 truncate">{u.display_name ?? "No name"}</p>
              <StatusBadge status={u.status} />
            </div>
            <p className="text-xs text-muted-foreground break-all">
              {u.email ?? "no email"} · <span dir="ltr">{u.phone ?? "no phone"}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Joined {when(u.created_at)} · last sign-in {when(u.last_sign_in_at)}
              {u.reports_against > 0 ? ` · reported ${u.reports_against}×` : ""}
            </p>
            {u.status === "suspended" && u.status_reason && (
              <p className="text-xs text-destructive">Reason: {u.status_reason}</p>
            )}
            {u.id !== myId && (
              <div className="flex gap-2 pt-1">
                {u.status === "suspended" ? (
                  <Button size="sm" variant="outline" onClick={() => void restore(u)}>
                    Restore
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onSuspend({ id: u.id, name: u.display_name ?? u.email ?? "this person" })}
                  >
                    Suspend
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

function FeedbackTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const rows = useList<AdminFeedback>(() => listFeedback(), [refreshKey]);
  const [shots, setShots] = useState<Record<string, string>>({});

  const openShot = async (f: AdminFeedback) => {
    if (!f.screenshot_path) return;
    const url = shots[f.id] ?? (await screenshotLink(f.screenshot_path));
    if (!url) {
      toast({ title: "Couldn't open the screenshot" });
      return;
    }
    setShots((s) => ({ ...s, [f.id]: url }));
    window.open(url, "_blank", "noopener");
  };

  const mark = async (id: string, status: AdminFeedback["status"]) => {
    const { error } = await setFeedbackStatus(id, status);
    if (error) toast({ title: "Couldn't update the feedback" });
    else onChanged();
  };

  if (rows === null) return <Busy />;
  if (rows.length === 0) return <Empty text="No feedback yet." />;
  return (
    <div className="flex flex-col gap-3 pt-2">
      {rows.map((f) => (
        <Card key={f.id}>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground flex-1">{FEEDBACK_KINDS[f.category] ?? f.category}</p>
            <StatusBadge status={f.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {f.display_name ?? "Unknown"} ({f.email ?? "no email"}) · {when(f.created_at)}
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words" dir="auto">
            {f.message}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {[f.device, f.platform, f.language && `language ${f.language}`, f.page && `screen ${f.page}`, f.app_build && `version ${f.app_build}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {f.screenshot_path && (
              <Button size="sm" variant="outline" onClick={() => void openShot(f)}>
                Open screenshot
              </Button>
            )}
            {f.status !== "seen" && f.status !== "done" && (
              <Button size="sm" variant="outline" onClick={() => void mark(f.id, "seen")}>
                Mark seen
              </Button>
            )}
            {f.status !== "done" && (
              <Button size="sm" variant="outline" onClick={() => void mark(f.id, "done")}>
                Done
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ProblemsTab({ refreshKey }: { refreshKey: number }) {
  const rows = useList<AppProblem>(() => listProblems(), [refreshKey]);
  const [open, setOpen] = useState<string | null>(null);
  if (rows === null) return <Busy />;
  if (rows.length === 0) return <Empty text="No problems recorded." />;
  return (
    <div className="flex flex-col gap-3 pt-2">
      {rows.map((p) => (
        <Card key={p.id}>
          <button className="text-left" onClick={() => setOpen(open === p.id ? null : p.id)}>
            <p className="text-sm font-semibold text-foreground break-words">{p.message}</p>
            <p className="text-xs text-muted-foreground">
              {p.times}× · last {when(p.last_seen_at)} · {p.platform ?? "?"} · version {p.app_build ?? "?"}
            </p>
            <p className="text-xs text-muted-foreground break-all">
              {p.user_email ?? "signed out"} · screen {p.url ?? "?"} · {p.language ?? "?"}
            </p>
          </button>
          {open === p.id && (
            <pre className="text-[10px] leading-snug bg-secondary rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {[p.stack ?? "No details", p.user_agent].filter(Boolean).join("\n\n")}
            </pre>
          )}
        </Card>
      ))}
    </div>
  );
}

function CallsTab({ refreshKey }: { refreshKey: number }) {
  const [days, setDays] = useState(1);
  const rows = useList<CallMinutes>(() => callMinutes(days), [days, refreshKey]);
  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-xs text-muted-foreground">Paid calls to phone numbers (dial pad). In-app calls aren't counted here.</p>
      <div className="flex gap-2">
        {[1, 7, 30].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            {d === 1 ? "Today" : `${d} days`}
          </Button>
        ))}
      </div>
      {rows === null ? (
        <Busy />
      ) : rows.length === 0 ? (
        <Empty text="No paid calls in this period." />
      ) : (
        rows.map((c) => (
          <Card key={c.user_id}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground flex-1 truncate">{c.display_name ?? c.email ?? "Unknown"}</p>
              <p className={`text-sm font-bold ${days === 1 && c.minutes >= 30 ? "text-destructive" : "text-foreground"}`}>
                {c.minutes} min
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.email ?? "no email"} · {c.calls} {c.calls === 1 ? "call" : "calls"}
            </p>
          </Card>
        ))
      )}
    </div>
  );
}

function SuspendDialog({
  target,
  onClose,
  onDone,
}: {
  target: SuspendTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [ban, setBan] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setReason("");
      setBan(true);
    }
  }, [target]);

  const confirm = useCallback(async () => {
    if (!target || !reason.trim()) return;
    setBusy(true);
    const { error } = await suspendUser(target.id, reason.trim(), ban);
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't suspend the account", description: "Check the connection and try again." });
      return;
    }
    toast({ title: `${target.name} suspended`, description: "They've been signed out and can't use ChiChat." });
    onDone();
  }, [target, reason, ban, onDone]);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Suspend {target?.name}?</DialogTitle>
          <DialogDescription>
            They're signed out at once and can't send messages or make calls. You can restore the account later from People.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          placeholder="Reason (only you see this)"
          rows={3}
        />
        <label className="flex items-start gap-3 text-sm text-foreground">
          <Checkbox checked={ban} onCheckedChange={(v) => setBan(v === true)} className="mt-0.5" />
          Also stop their email and phone number from being used to register again
        </label>
        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => void confirm()}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Suspend"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
