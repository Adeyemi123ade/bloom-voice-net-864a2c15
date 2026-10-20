import { useEffect, useMemo, useRef, useState } from "react";
import { openCallSettings } from "@/lib/nativeCalls";
import { useNavigate } from "react-router-dom";
import {
  Edit3,
  Heart,
  Loader2,
  MessageSquare,
  Phone,
  Search,
  Smartphone,
  UserPlus,
  Users,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useInviteLink } from "@/hooks/useInviteLink";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDisplay } from "@/lib/phone";
import {
  DeviceContact,
  isNativePlatform,
  isWebContactPickerSupported,
  loadCachedContacts,
  loadManualContacts,
  loadNativeContacts,
  pickWebContacts,
  removeManualContact,
  saveCachedContacts,
  saveManualContacts,
} from "@/lib/deviceContacts";
import ContactActionSheet, { ContactAction } from "@/components/ContactActionSheet";
import SaveContactDialog from "@/components/SaveContactDialog";
import {
  ActiveContact,
  BATCH_SIZE,
  InviteContact,
  MatchedUser,
  inviteMessage,
  mergeContacts,
} from "@/components/contacts/contactsHelpers";
import { ActiveRow, EmptyState, InviteRow } from "@/components/contacts/ContactRows";
import { SectionList, sectionLetter } from "@/components/contacts/ContactSectionList";
import { shareChichatInvite } from "@/components/contacts/ShareInviteCard";
import { beginOutgoingCall, canStartAnotherCall } from "@/lib/callStart";
import { useLanguage } from "@/lib/i18n/context";
import { inBatches, loadMatchCache, phonesKey, saveMatchCache, type CallStat } from "@/lib/contactMatchCache";

// Long phone books: rows are added as the list is scrolled, not all at once
// (drawing every row made the screen take seconds to appear on a phone).
const FIRST_ROWS = 60;
const MORE_ROWS = 200;
// Checks against ChiChat sent at the same time (each one is up to BATCH_SIZE numbers).
const PARALLEL_CHECKS = 4;

export default function Contacts() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const myInviteLink = useInviteLink();
  const { t } = useLanguage();

  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [matched, setMatched] = useState<Map<string, MatchedUser>>(new Map());
  const [stats, setStats] = useState<Map<string, CallStat>>(new Map());
  // Fingerprint of the numbers last checked against ChiChat (see runMatch).
  const lastCheckedRef = useRef<string | null>(null);
  const matchSeq = useRef(0);
  const [inviteLimit, setInviteLimit] = useState(FIRST_ROWS);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [invitedPhones, setInvitedPhones] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [query, setQuery] = useState("");
  // Ignores repeat taps while the call is being opened.
  const startingCall = useRef(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // Asked once and refused again: Android won't show the prompt any more,
  // so the button opens ChiChat's app settings instead.
  const [deniedTwice, setDeniedTwice] = useState(false);
  const [phoneContactsError, setPhoneContactsError] = useState<string | null>(null);

  /**
   * Phone contacts (the address book on this phone), read through Android's
   * contacts provider. Independent of Google and of who uses ChiChat:
   * everyone with a phone number is listed; the ones on ChiChat are matched
   * after, the rest can be invited. Errors are shown instead of swallowed.
   */
  const loadPhoneContacts = async (): Promise<"ok" | "denied" | "error"> => {
    setSyncing(true);
    setPhoneContactsError(null);
    try {
      const list = await loadNativeContacts();
      setPermissionDenied(false);
      saveCachedContacts(list);
      const fresh = mergeContacts(list, loadManualContacts());
      setContacts(fresh);
      // Usually the same numbers as the copy already checked on opening.
      if (fresh.length) await runMatch(fresh, { onlyIfChanged: true });
      return "ok";
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      if (code === "PERMISSION_DENIED") {
        setPermissionDenied(true);
        return "denied";
      }
      setPhoneContactsError(
        code.startsWith("CONTACTS_UNAVAILABLE")
          ? t("ct.oldApp")
          : t("ct.readFailed"),
      );
      console.warn("[contacts] load failed", code);
      return "error";
    } finally {
      setSyncing(false);
    }
  };

  // Back from Android settings after allowing Contacts: load them now.
  useEffect(() => {
    if (!isNativePlatform() || !permissionDenied) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadPhoneContacts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionDenied]);
  const [actionSheet, setActionSheet] = useState<{
    title: string;
    subtitle?: string;
    actions: ContactAction[];
  } | null>(null);
  const [editTarget, setEditTarget] = useState<{ phone: string } | null>(null);

  useEffect(() => {
    document.title = "Contacts — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const cached = loadCachedContacts() ?? [];
      const manual = loadManualContacts();
      const merged = mergeContacts(cached, manual);
      setContacts(merged);
      // Who was on ChiChat last time, shown at once; checked again below.
      const saved = loadMatchCache(user.id);
      if (saved) {
        setMatched(new Map(saved.matches.map((m) => [m.phone, m])));
        setStats(new Map(saved.stats));
      }
      await Promise.all([merged.length ? runMatch(merged) : Promise.resolve(), loadInvited()]);

      // On native Android: load the phone's contacts directly.
      if (isNativePlatform()) await loadPhoneContacts();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);



  const loadInvited = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("invites")
      .select("phone")
      .eq("inviter_id", user.id);
    setInvitedPhones(new Set((data ?? []).map((r) => r.phone)));
  };

  const runMatch = async (list: DeviceContact[], opts: { onlyIfChanged?: boolean } = {}) => {
    if (!user) return;
    const allPhones = Array.from(
      new Set(list.flatMap((c) => c.phones).filter(Boolean)),
    );
    const key = phonesKey(allPhones);
    if (opts.onlyIfChanged && key === lastCheckedRef.current) return;
    const seq = ++matchSeq.current;
    setMatching(true);
    const matches = new Map<string, MatchedUser>();
    try {
      const found = await inBatches(allPhones, BATCH_SIZE, PARALLEL_CHECKS, async (batch) => {
        const { data, error } = await supabase.rpc("match_contacts_by_phone", {
          _phones: batch,
        });
        if (error) throw error;
        return (data ?? []) as MatchedUser[];
      });
      if (seq !== matchSeq.current) return; // a newer check replaced this one
      for (const m of found) matches.set(m.phone, m);
      setMatched(matches);

      const calleeIds = Array.from(matches.values()).map((m) => m.user_id);
      if (calleeIds.length) {
        const { data: statRows } = await supabase
          .from("call_stats")
          .select("callee_id, call_count, last_called_at")
          .eq("caller_id", user.id)
          .in("callee_id", calleeIds);
        if (seq !== matchSeq.current) return;
        const m = new Map<string, CallStat>();
        for (const r of statRows ?? []) {
          m.set(r.callee_id, {
            call_count: r.call_count,
            last_called_at: r.last_called_at,
          });
        }
        setStats(m);
        saveMatchCache(user.id, { phonesKey: key, matches: [...matches.values()], stats: [...m.entries()] });
      } else {
        setStats(new Map());
        saveMatchCache(user.id, { phonesKey: key, matches: [], stats: [] });
      }
      lastCheckedRef.current = key;
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("ct.matchFailedMsg");
      toast({ title: t("ct.matchFailed"), description: msg, variant: "destructive" });
    } finally {
      if (seq === matchSeq.current) setMatching(false);
    }
  };

  const refreshContacts = async () => {
    if (isNativePlatform()) {
      if ((await loadPhoneContacts()) === "ok") {
        toast({ title: t("ct.loaded", { n: loadCachedContacts()?.length ?? 0 }) });
      }
      return;
    }
    // In the browser: contacts saved here and picked from the phone.
    const merged = mergeContacts(loadCachedContacts() ?? [], loadManualContacts());
    setContacts(merged);
    if (merged.length) await runMatch(merged);
  };

  const canPickWebContacts = isWebContactPickerSupported() && !isNativePlatform();

  const importFromPhone = async () => {
    setSyncing(true);
    try {
      const picked = await pickWebContacts();
      if (!picked.length) {
        toast({ title: t("ct.noneSelected") });
        return;
      }
      const existing = loadManualContacts();
      const byPhone = new Map(existing.map((c) => [c.phones[0], c]));
      for (const c of picked) {
        const key = c.phones[0];
        if (!byPhone.has(key)) byPhone.set(key, c);
      }
      const updatedManual = Array.from(byPhone.values());
      saveManualContacts(updatedManual);
      const cached = loadCachedContacts() ?? [];
      const merged = mergeContacts(cached, updatedManual);
      setContacts(merged);
      await runMatch(merged);
      toast({
        title: picked.length === 1 ? t("ct.importedOne") : t("ct.importedMany", { n: picked.length }),
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "NOT_SUPPORTED") {
        toast({
          title: t("ct.notSupported"),
          description: t("ct.useChrome"),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("ct.importCancelled"),
          description: err instanceof Error ? err.message : t("common.tryAgain"),
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleRemoveManual = (e164: string) => {
    const updated = removeManualContact(e164);
    const cached = loadCachedContacts() ?? [];
    const merged = mergeContacts(cached, updated);
    setContacts(merged);
    runMatch(merged);
  };

  // Build active + invite lists, alphabetised.
  const { active, invite } = useMemo(() => {
    const activeList: ActiveContact[] = [];
    const inviteList: InviteContact[] = [];
    const seenUsers = new Set<string>();

    for (const c of contacts) {
      const matchedPhone = c.phones.find((p) => matched.has(p));
      if (matchedPhone) {
        const m = matched.get(matchedPhone)!;
        if (seenUsers.has(m.user_id)) continue;
        seenUsers.add(m.user_id);
        const s = stats.get(m.user_id);
        activeList.push({
          user_id: m.user_id,
          display_name: m.display_name ?? c.name,
          avatar_url: m.avatar_url,
          phone: matchedPhone,
          call_count: s?.call_count ?? 0,
          last_called_at: s?.last_called_at ?? null,
        });
      } else if (c.phones[0]) {
        inviteList.push({
          name: c.name,
          phone: c.phones[0],
          invited: invitedPhones.has(c.phones[0]),
        });
      }
    }

    activeList.sort((a, b) => a.display_name.localeCompare(b.display_name));
    inviteList.sort((a, b) => a.name.localeCompare(b.name));

    return { active: activeList, invite: inviteList };
  }, [contacts, matched, stats, invitedPhones]);

  const filteredActive = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (c) =>
        c.display_name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q),
    );
  }, [active, query]);

  const filteredInvite = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return invite;
    return invite.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    );
  }, [invite, query]);

  // Numbers added by hand (they get a remove button), read once per change
  // instead of once per row.
  const manualPhones = useMemo(
    () => new Set(loadManualContacts().map((m) => m.phones[0])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts],
  );

  // A new search starts from the top again.
  useEffect(() => setInviteLimit(FIRST_ROWS), [query]);
  const shownInvite = useMemo(
    () => filteredInvite.slice(0, inviteLimit),
    [filteredInvite, inviteLimit],
  );
  // Near the end of what's drawn: draw the next rows.
  useEffect(() => {
    const el = moreRef.current;
    if (!el || shownInvite.length >= filteredInvite.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInviteLimit((n) => n + MORE_ROWS);
      },
      // Measured against the scrolling list, so rows are drawn well before they're reached.
      { root: listRef.current, rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shownInvite.length, filteredInvite.length]);

  const callActive = async (c: ActiveContact) => {
    if (!user || startingCall.current) return;
    // During a call: the same person goes back to it, anyone else gets a
    // short note (beginOutgoingCall). Never a second call.
    startingCall.current = true;
    try {
      // The conversation is needed for the call's address; usually instant.
      const conversationId = await supabase
        .rpc("start_direct_conversation", { _other_user: c.user_id })
        .then((r) => {
          if (r.error) throw r.error;
          return r.data as string;
        });
      beginOutgoingCall(
        {
          conversationId,
          calleeId: c.user_id,
          type: "voice",
          peer: { name: c.display_name ?? t("chat.contact"), avatarUrl: c.avatar_url ?? null },
        },
        navigate,
      );
    } catch {
      toast({ title: t("ct.callFailed"), description: t("chat.checkConnection"), variant: "destructive" });
    } finally {
      startingCall.current = false;
    }
  };

  /** Open chat room — used by the message icon next to each active contact. */
  const chatActive = async (c: ActiveContact) => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc("start_direct_conversation", {
        _other_user: c.user_id,
      });
      if (error) throw error;
      navigate(`/chat/${data as string}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("ct.chatOpenFailed");
      toast({ title: t("ct.chatFailed"), description: msg, variant: "destructive" });
    }
  };

  const recordInvite = async (c: InviteContact) => {
    if (!user) return;
    await supabase.from("invites").insert({
      inviter_id: user.id,
      phone: c.phone,
      contact_name: c.name,
    });
    setInvitedPhones((prev) => new Set(prev).add(c.phone));
  };

  /** "Invite" button → native OS share sheet. Records invite if shared.
   *  If the browser blocks/lacks share + popup, fall back to the /invite page. */
  const inviteContact = async (c: InviteContact) => {
    try {
      const sent = await shareChichatInvite(inviteMessage(c.name, myInviteLink));
      if (sent) {
        await recordInvite(c);
        return;
      }
    } catch {
      /* fall through */
    }
    navigate("/invite");
  };

  const openActiveActions = (c: ActiveContact) => {
    setActionSheet({
      title: c.display_name,
      subtitle: formatDisplay(c.phone),
      actions: [
        { label: t("ct.openChat"), icon: MessageSquare, onClick: () => chatActive(c) },
        { label: t("call.voice"), icon: Phone, onClick: () => callActive(c) },
        {
          label: t("ct.editName"),
          icon: Edit3,
          onClick: () => setEditTarget({ phone: c.phone }),
        },
      ],
    });
  };

  const openInviteActions = (c: InviteContact) => {
    setActionSheet({
      title: c.name,
      subtitle: formatDisplay(c.phone),
      actions: [
        {
          label: t("ct.sendInvite"),
          icon: UserPlus,
          onClick: () => inviteContact(c),
        },
        {
          label: t("ct.callNumber"),
          icon: Phone,
          onClick: () => {
            if (canStartAnotherCall()) navigate(`/dial/${encodeURIComponent(c.phone)}`);
          },
        },
        {
          label: t("ct.editName"),
          icon: Edit3,
          onClick: () => setEditTarget({ phone: c.phone }),
        },
      ],
    });
  };

  const totalContacts = contacts.length;
  const isLoading = syncing || matching;

  return (
    <MobileFrame bottomNav="contacts">
      <div className="h-full w-full flex flex-col bg-background relative">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground flex-1">{t("ct.title")}</h1>
          {isNativePlatform() && (
            <button
              aria-label={t("ct.refresh")}
              onClick={refreshContacts}
              disabled={isLoading}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary disabled:opacity-50"
            >
              <Loader2
                className={`w-4 h-4 text-foreground ${isLoading ? "animate-spin" : "opacity-60"}`}
              />
            </button>
          )}
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto pb-6">
          {/* Search */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("ct.searchPh")}
                className="h-10 pl-9 text-sm bg-secondary/40 border-border"
              />
            </div>
          </div>

          {/* Top action card: Search ChiChat / New Group Call / New Contact / Invite a friend */}
          <div className="mx-4 mt-2 rounded-2xl bg-secondary/40 border border-border overflow-hidden">
            <ActionRow
              icon={Search}
              label={t("ct.searchChichat")}
              onClick={() => navigate("/home", { state: { openNewChat: true } })}
            />
            <Divider />
            <ActionRow
              icon={Users}
              label={t("ct.groupCall")}
              onClick={() =>
                toast({
                  title: t("ct.groupSoon"),
                  description: t("ct.groupSoonBody"),
                })
              }
            />
            <Divider />
            <ActionRow
              icon={UserPlus}
              label={t("ct.newContact")}
              onClick={() => navigate("/contacts/new")}
            />
            {canPickWebContacts && (
              <>
                <Divider />
                <ActionRow
                  icon={Smartphone}
                  label={syncing ? t("ct.importing") : t("ct.importPhone")}
                  onClick={importFromPhone}
                />
              </>
            )}
            <Divider />
            <ActionRow
              icon={Heart}
              label={t("ct.inviteFriend")}
              onClick={() => navigate("/invite")}
            />
          </div>

          {/* Contacts permission denied — Android only */}
          {permissionDenied && (
            <div className="mx-4 mt-3 p-4 rounded-xl bg-secondary border border-border text-center">
              <p className="text-sm font-semibold text-foreground">
                {t("ct.accessNeeded")}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {t("ct.accessBody")}
              </p>
              <Button
                onClick={async () => {
                  if (deniedTwice) {
                    void openCallSettings("app");
                    return;
                  }
                  const r = await loadPhoneContacts();
                  if (r === "denied") setDeniedTwice(true);
                }}
                className="mt-3 w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold"
              >
                {deniedTwice ? t("ct.openSettings") : t("ct.allowAccess")}
              </Button>
            </div>
          )}

          {phoneContactsError && (
            <div className="mx-4 mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-foreground">
              {phoneContactsError}
            </div>
          )}

          {syncing && totalContacts === 0 && (
            <p className="px-4 pt-4 text-xs text-muted-foreground text-center">
              {t("ct.loadingContacts")}
            </p>
          )}

          {/* Active contacts (on Chichat) — endless alphabetical list */}
          <div className="mt-4">
            {filteredActive.length > 0 && (
              <SectionList
                items={filteredActive}
                getKey={(c) => c.user_id}
                getSectionLabel={(c) => sectionLetter(c.display_name)}
                renderItem={(c) => (
                  <ActiveRow
                    c={c}
                    onChat={() => chatActive(c)}
                    onLongPress={() => openActiveActions(c)}
                  />
                )}
              />
            )}
            {!matching && filteredActive.length === 0 && totalContacts > 0 && !query && (
              <EmptyState
                title={t("ct.noneOnChichat")}
                hint={t("ct.inviteBelow")}
                action={{
                  label: t("ct.cantFind"),
                  onClick: () => navigate("/home", { state: { openNewChat: true } }),
                }}
              />
            )}
          </div>

          {/* Invite to ChiChat — non-app contacts */}
          {filteredInvite.length > 0 && (
            <div className="mt-6">
              <div className="px-4 py-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">{t("ct.inviteHeading")}</h2>
                <span className="text-xs text-muted-foreground">
                  {filteredInvite.length}
                </span>
              </div>
              <SectionList
                items={shownInvite}
                getKey={(c) => `${c.phone}|${c.name}`}
                getSectionLabel={(c) => sectionLetter(c.name)}
                renderItem={(c) => (
                  <InviteRow
                    c={c}
                    isManual={manualPhones.has(c.phone)}
                    onInvite={() => inviteContact(c)}
                    onRemove={() => handleRemoveManual(c.phone)}
                    onLongPress={() => openInviteActions(c)}
                  />
                )}
              />
              {shownInvite.length < filteredInvite.length && (
                <div ref={moreRef} className="h-16" aria-hidden />
              )}
            </div>
          )}

          {!isLoading && totalContacts === 0 && isNativePlatform() && (
            <EmptyState
              title={t("ct.noneFound")}
              hint={t("ct.tapRefresh")}
            />
          )}

          {query &&
            filteredActive.length === 0 &&
            filteredInvite.length === 0 && (
              <EmptyState
                title={t("common.noMatches")}
                hint={t("ct.tryOther")}
                action={{
                  label: t("ct.searchDirect"),
                  onClick: () => navigate("/home", { state: { openNewChat: true } }),
                }}
              />
            )}
        </div>
      </div>

      <ContactActionSheet
        open={!!actionSheet}
        onOpenChange={(o) => !o && setActionSheet(null)}
        title={actionSheet?.title ?? ""}
        subtitle={actionSheet?.subtitle}
        actions={actionSheet?.actions ?? []}
      />
      {editTarget && (
        <SaveContactDialog
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          phoneE164={editTarget.phone}
          onSaved={() => {
            const cached = loadCachedContacts() ?? [];
            const manual = loadManualContacts();
            setContacts(mergeContacts(cached, manual));
            setEditTarget(null);
          }}
        />
      )}
    </MobileFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Local UI bits used only by this page                                       */
/* -------------------------------------------------------------------------- */

function ActionRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/60 text-left"
    >
      <Icon className="w-5 h-5 text-primary" />
      <span className="flex-1 text-sm font-semibold text-foreground">{label}</span>
      <span className="text-muted-foreground text-lg leading-none">›</span>
    </button>
  );
}

function Divider() {
  return <div className="h-px bg-border mx-4" />;
}
