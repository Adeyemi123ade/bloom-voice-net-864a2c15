import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  SUSPEND_FOR,
  addMinutes,
  describeAction,
  dialPadChoice,
  loadPerson,
  plainAdminError,
  removeUser,
  restoreUser,
  saveCallSettings,
  setTestAccount,
  suspendUntil,
  suspendUser,
  type AdminUser,
  type CallSettings,
  type DialPadChoice,
  type PersonDetail,
} from "@/lib/admin";

/**
 * Admin page: everything about one person. Account (suspend, ban, remove,
 * restore), calls (plan, dial pad, daily minutes, app calls, balance), the
 * test account tag, and the history of admin actions. English only: a tool
 * for the ChiChat team. The database checks every action again.
 */

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";

/** yyyy-mm-dd for a date input, from an ISO time. */
const dateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
/** End of the chosen day (UTC) as an ISO time, or null. */
const endOfDay = (d: string) => (d ? new Date(`${d}T23:59:59Z`).toISOString() : null);

const nameOf = (u: AdminUser) => u.display_name ?? u.email ?? "this person";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Button key={o.value} type="button" size="sm" variant={value === o.value ? "default" : "outline"} onClick={() => onChange(o.value)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export default function PersonDialog({
  person,
  myId,
  onClose,
  onChanged,
}: {
  person: AdminUser | null;
  myId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallSettings | null>(null);
  const [minutesText, setMinutesText] = useState("");
  const [addText, setAddText] = useState("");
  const [addNote, setAddNote] = useState("");
  const [mode, setMode] = useState<"view" | "suspend" | "remove">("view");

  const reload = useCallback(async () => {
    if (!person) return;
    setLoadFailed(false);
    const { data, error } = await loadPerson(person.id);
    if (error || !data) {
      setLoadFailed(true);
      return;
    }
    setDetail(data);
    setCalls({
      plan: data.plan,
      planExpiresAt: data.plan_expires_at,
      dialPad: dialPadChoice(data.dial_pad_override),
      dailyMinutes: data.daily_minutes_override,
      appCalls: data.app_calls,
    });
    setMinutesText(data.daily_minutes_override == null ? "" : String(data.daily_minutes_override));
  }, [person]);

  useEffect(() => {
    setDetail(null);
    setCalls(null);
    setMode("view");
    setAddText("");
    setAddNote("");
    if (person) void reload();
  }, [person, reload]);

  if (!person) return null;
  const isMe = person.id === myId;
  const protectedAccount = isMe || !!person.is_admin;
  const removed = person.status === "removed";

  const run = async (label: string, fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(label);
    const { error } = await fn();
    setBusy(null);
    if (error) {
      toast({ title: "Couldn't save that", description: plainAdminError(error.message) });
      return false;
    }
    toast({ title: ok });
    onChanged();
    await reload();
    return true;
  };

  const saveCalls = async () => {
    if (!calls) return;
    const trimmed = minutesText.trim();
    const minutes = trimmed === "" ? null : Number(trimmed);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 600)) {
      toast({ title: "Daily minutes must be a whole number from 0 to 600, or empty to follow the plan" });
      return;
    }
    await run("calls", () => saveCallSettings(person.id, { ...calls, dailyMinutes: minutes }), "Call settings saved");
  };

  const add = async () => {
    const n = Number(addText.trim());
    if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 100000) {
      toast({ title: "Enter whole minutes, for example 60 (or -10 to take back)" });
      return;
    }
    const ok = await run("minutes", () => addMinutes(person.id, n, addNote.trim()), n > 0 ? `${n} minutes added` : `${-n} minutes taken back`);
    if (ok) {
      setAddText("");
      setAddNote("");
    }
  };

  return (
    <Dialog open={!!person} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">{nameOf(person)}</DialogTitle>
          <DialogDescription className="break-all">
            {person.email ?? "no email"} · <span dir="ltr">{person.phone ?? "no phone"}</span>
          </DialogDescription>
        </DialogHeader>

        {mode === "suspend" ? (
          <SuspendForm
            name={nameOf(person)}
            onCancel={() => setMode("view")}
            onConfirm={async (reason, ban, hours) => {
              const ok = await run(
                "suspend",
                () => suspendUser(person.id, reason, ban, suspendUntil(hours)),
                `${nameOf(person)} suspended`,
              );
              if (ok) setMode("view");
            }}
            busy={busy === "suspend"}
          />
        ) : mode === "remove" ? (
          <RemoveForm
            person={person}
            onCancel={() => setMode("view")}
            onConfirm={async (reason) => {
              const ok = await run("remove", () => removeUser(person.id, reason), `${nameOf(person)} removed`);
              if (ok) setMode("view");
            }}
            busy={busy === "remove"}
          />
        ) : !detail ? (
          loadFailed ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <p className="text-sm text-muted-foreground">Couldn't load this person.</p>
              <Button size="sm" variant="outline" onClick={() => void reload()}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <Section title="Account">
              <p className="text-sm text-foreground">
                {removed
                  ? "Removed. Can't sign in, can't be messaged or called. Their earlier messages stay in other people's chats."
                  : person.status === "suspended"
                    ? `Suspended${person.suspended_until ? ` until ${when(person.suspended_until)}` : " until restored"}${detail.banned ? ", email and phone banned" : ""}.`
                    : "Active."}
              </p>
              {person.status_reason && <p className="text-xs text-destructive">Reason: {person.status_reason}</p>}
              <p className="text-xs text-muted-foreground">
                Joined {when(person.created_at)} · last sign in {when(person.last_sign_in_at)}
                {person.reports_against > 0 ? ` · reported ${person.reports_against}×` : ""}
              </p>
              {protectedAccount ? (
                <p className="text-xs text-muted-foreground">
                  {isMe ? "This is your account." : "Admin account."} It can't be suspended, removed or changed here.
                </p>
              ) : removed ? null : (
                <div className="flex flex-wrap gap-2">
                  {person.status === "suspended" ? (
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run("restore", () => restoreUser(person.id), `${nameOf(person)} restored`)}>
                      Restore
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => setMode("suspend")}>
                      Suspend or ban
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-destructive" disabled={!!busy} onClick={() => setMode("remove")}>
                    Remove account
                  </Button>
                </div>
              )}
            </Section>

            {!protectedAccount && !removed && calls && (
              <Section title="Calls">
                <p className="text-xs text-muted-foreground">Plan</p>
                <Choice
                  value={calls.plan}
                  options={detail.plans.map((p) => ({
                    value: p.id as CallSettings["plan"],
                    label: `${p.id === "premium" ? "Premium" : "Free"} (dial pad ${p.dial_pad ? "on" : "off"}, ${p.daily_minutes} min)`,
                  }))}
                  onChange={(plan) => setCalls({ ...calls, plan })}
                />
                {calls.plan === "premium" && (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    Premium until
                    <Input
                      type="date"
                      className="w-auto"
                      value={dateInput(calls.planExpiresAt)}
                      onChange={(e) => setCalls({ ...calls, planExpiresAt: endOfDay(e.target.value) })}
                    />
                    <span className="text-xs text-muted-foreground">(empty = no end)</span>
                  </label>
                )}
                <p className="text-xs text-muted-foreground pt-1">Calls to phone numbers (dial pad)</p>
                <Choice<DialPadChoice>
                  value={calls.dialPad}
                  options={[
                    { value: "plan", label: "Follow plan" },
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                  onChange={(dialPad) => setCalls({ ...calls, dialPad })}
                />
                <label className="flex items-center gap-2 text-sm text-foreground pt-1">
                  Minutes a day
                  <Input
                    inputMode="numeric"
                    className="w-24"
                    value={minutesText}
                    placeholder="plan"
                    onChange={(e) => setMinutesText(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm text-foreground pt-1">
                  <span>
                    App to app calls
                    <span className="block text-xs text-muted-foreground">Switch off only for abuse.</span>
                  </span>
                  <Switch checked={calls.appCalls} onCheckedChange={(v) => setCalls({ ...calls, appCalls: v })} />
                </label>
                <p className="text-xs text-muted-foreground">
                  Now: dial pad {detail.dial_pad ? "on" : "off"}, {detail.daily_minutes} min a day ({detail.used_today_minutes} used today,{" "}
                  {detail.used_30d_minutes} in 30 days)
                  {detail.dial_pad_override === true ? ". Switched on, so the 24 hour wait for new accounts doesn't apply." : "."}
                </p>
                <Button size="sm" disabled={!!busy} onClick={() => void saveCalls()}>
                  {busy === "calls" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save call settings"}
                </Button>
              </Section>
            )}

            {!protectedAccount && !removed && (
              <Section title="Minute balance">
                <p className="text-sm text-foreground">{detail.balance_minutes} minutes</p>
                <p className="text-xs text-muted-foreground">
                  {detail.balance_in_use
                    ? "Dial pad calls use this balance, each started minute counted."
                    : "Not used yet: calls are limited by the daily minutes only. Kept ready for selling minutes."}
                </p>
                <div className="flex gap-2">
                  <Input inputMode="numeric" className="w-24" placeholder="60" value={addText} onChange={(e) => setAddText(e.target.value.replace(/[^\d-]/g, "").slice(0, 7))} />
                  <Input placeholder="Note, e.g. paid 5,000 NGN" value={addNote} onChange={(e) => setAddNote(e.target.value.slice(0, 200))} />
                </div>
                <Button size="sm" variant="outline" disabled={!!busy || !addText.trim()} onClick={() => void add()}>
                  {busy === "minutes" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add minutes"}
                </Button>
                {detail.minutes_added.length > 0 && (
                  <ul className="text-xs text-muted-foreground">
                    {detail.minutes_added.slice(0, 5).map((m) => (
                      <li key={m.created_at}>
                        {when(m.created_at)}: {m.minutes > 0 ? "+" : ""}
                        {m.minutes}
                        {m.note ? ` (${m.note})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            <Section title="Test account">
              <label className="flex items-center justify-between gap-2 text-sm text-foreground">
                <span>
                  Test account
                  <span className="block text-xs text-muted-foreground">
                    Their reports, feedback, problems and call minutes are hidden unless "Show test data" is on.
                  </span>
                </span>
                <Switch
                  checked={detail.is_test}
                  disabled={!!busy}
                  onCheckedChange={(v) =>
                    void run("test", () => setTestAccount(person.id, v), v ? "Marked as test account" : "Test account tag removed")
                  }
                />
              </label>
            </Section>

            <Section title="History">
              {detail.history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No admin actions yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {detail.history.map((h, i) => (
                    <li key={`${h.created_at}-${i}`} className="text-xs text-foreground">
                      <span className="text-muted-foreground">{when(h.created_at)}</span> · {describeAction(h)}
                      {h.admin_email ? <span className="text-muted-foreground"> · by {h.admin_email}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SuspendForm({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, ban: boolean, hours: number | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [ban, setBan] = useState(false);
  const [hours, setHours] = useState<number | null>(24 * 7);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">Suspend {name}?</p>
      <p className="text-xs text-muted-foreground">
        They're signed out at once and can't send messages or make calls until the suspension ends or you restore them.
      </p>
      <div className="flex flex-wrap gap-2">
        {SUSPEND_FOR.map((o) => (
          <Button key={o.label} type="button" size="sm" variant={hours === o.hours ? "default" : "outline"} onClick={() => setHours(o.hours)}>
            {o.label}
          </Button>
        ))}
      </div>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} placeholder="Reason (only admins see this)" rows={3} />
      <label className="flex items-start gap-3 text-sm text-foreground">
        <Checkbox checked={ban} onCheckedChange={(v) => setBan(v === true)} className="mt-0.5" />
        Ban: also stop their email and phone number from being used to register again
      </label>
      <DialogFooter className="gap-2">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim(), ban, hours)}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : ban ? "Suspend and ban" : "Suspend"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function RemoveForm({
  person,
  busy,
  onCancel,
  onConfirm,
}: {
  person: AdminUser;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  // Typing the email (or the name when there is no email) confirms it: there is no undo.
  const expected = (person.email ?? person.display_name ?? "").trim().toLowerCase();
  const matches = expected !== "" && typed.trim().toLowerCase() === expected;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">Remove {nameOf(person)} for good?</p>
      <p className="text-xs text-muted-foreground">
        They can't sign in again, can't be messaged or called, and aren't found from contacts. Their email and phone can't register again.
        Their earlier messages stay in other people's chats under their name. This can't be undone.
      </p>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} placeholder="Reason (only admins see this)" rows={3} />
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Type {person.email ? "their email" : "their name"} to confirm
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={person.email ?? person.display_name ?? ""} autoComplete="off" />
      </label>
      <DialogFooter className="gap-2">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={busy || !reason.trim() || !matches} onClick={() => onConfirm(reason.trim())}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remove account"}
        </Button>
      </DialogFooter>
    </div>
  );
}
