import { useEffect, useMemo, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { activeCallPath, getActiveCall } from "@/lib/activeCall";
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
import {
  isGoogleConnected,
  startGoogleContactsConnect,
  syncGoogleContacts,
} from "@/lib/googleContacts";
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
import { clearPreparedCallMedia, formatCallMediaError, prepareCallMedia } from "@/lib/callMedia";

export default function Contacts() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [matched, setMatched] = useState<Map<string, MatchedUser>>(new Map());
  const [stats, setStats] = useState<
    Map<string, { call_count: number; last_called_at: string | null }>
  >(new Map());
  const [invitedPhones, setInvitedPhones] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [query, setQuery] = useState("");
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
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
      if (fresh.length) await runMatch(fresh);
      return "ok";
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      if (code === "PERMISSION_DENIED") {
        setPermissionDenied(true);
        return "denied";
      }
      setPhoneContactsError(
        code.startsWith("CONTACTS_UNAVAILABLE")
          ? "This version of the app can't read phone contacts. Install the latest build."
          : "Couldn't read your phone contacts. Pull down or tap refresh to try again.",
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
      if (merged.length) await runMatch(merged);
      await loadInvited();

      // On native Android: load device contacts directly.
      if (isNativePlatform()) {
        setGoogleConnected(true);
        await loadPhoneContacts();
        return;
      }

      try {
        const connected = await isGoogleConnected();
        setGoogleConnected(connected);
        if (connected) {
          setSyncing(true);
          try {
            const { contacts: list } = await syncGoogleContacts();
            const fresh = mergeContacts(list, loadManualContacts());
            setContacts(fresh);
            if (fresh.length) await runMatch(fresh);
          } catch {
            /* user can retry from Settings */
          } finally {
            setSyncing(false);
          }
        }
      } catch {
        setGoogleConnected(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-refresh Google contacts in the background: on tab focus and every 5
  // minutes while the page is open. Keeps contacts fresh without the user
  // tapping the refresh icon. Native uses device contacts directly so we skip.
  useEffect(() => {
    if (!user || isNativePlatform()) return;
    let cancelled = false;

    const backgroundSync = async () => {
      if (cancelled) return;
      try {
        const connected = await isGoogleConnected();
        if (!connected || cancelled) return;
        const { contacts: list } = await syncGoogleContacts();
        if (cancelled) return;
        const fresh = mergeContacts(list, loadManualContacts());
        setContacts(fresh);
        if (fresh.length) await runMatch(fresh);
      } catch {
        /* silent — user can retry via the refresh button */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void backgroundSync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const interval = window.setInterval(backgroundSync, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(interval);
    };
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

  const runMatch = async (list: DeviceContact[]) => {
    if (!user) return;
    setMatching(true);
    const allPhones = Array.from(
      new Set(list.flatMap((c) => c.phones).filter(Boolean)),
    );
    const matches = new Map<string, MatchedUser>();
    try {
      for (let i = 0; i < allPhones.length; i += BATCH_SIZE) {
        const batch = allPhones.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase.rpc("match_contacts_by_phone", {
          _phones: batch,
        });
        if (error) throw error;
        for (const m of (data ?? []) as MatchedUser[]) {
          matches.set(m.phone, m);
        }
      }
      setMatched(matches);

      const calleeIds = Array.from(matches.values()).map((m) => m.user_id);
      if (calleeIds.length) {
        const { data: statRows } = await supabase
          .from("call_stats")
          .select("callee_id, call_count, last_called_at")
          .eq("caller_id", user.id)
          .in("callee_id", calleeIds);
        const m = new Map<
          string,
          { call_count: number; last_called_at: string | null }
        >();
        for (const r of statRows ?? []) {
          m.set(r.callee_id, {
            call_count: r.call_count,
            last_called_at: r.last_called_at,
          });
        }
        setStats(m);
      } else {
        setStats(new Map());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not match contacts";
      toast({ title: "Matching failed", description: msg, variant: "destructive" });
    } finally {
      setMatching(false);
    }
  };

  const refreshContacts = async () => {
    if (isNativePlatform()) {
      if ((await loadPhoneContacts()) === "ok") {
        toast({ title: `Loaded ${loadCachedContacts()?.length ?? 0} contacts` });
      }
      return;
    }
    setSyncing(true);
    try {
      const list = isNativePlatform()
        ? await loadNativeContacts()
        : (await syncGoogleContacts()).contacts;
      if (isNativePlatform()) saveCachedContacts(list);
      const merged = mergeContacts(list, loadManualContacts());
      setContacts(merged);
      await runMatch(merged);
      toast({ title: `Loaded ${list.length} contacts` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load contacts";
      toast({ title: "Sync failed", description: msg, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const canPickWebContacts = isWebContactPickerSupported() && !isNativePlatform();

  const importFromPhone = async () => {
    setSyncing(true);
    try {
      const picked = await pickWebContacts();
      if (!picked.length) {
        toast({ title: "No contacts selected" });
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
        title: `Imported ${picked.length} contact${picked.length === 1 ? "" : "s"}`,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "NOT_SUPPORTED") {
        toast({
          title: "Not supported on this browser",
          description: "Open Chichat in Chrome on Android to import phone contacts.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Import cancelled",
          description: err instanceof Error ? err.message : "Try again.",
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  const connectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      await startGoogleContactsConnect();
    } catch (err) {
      setConnectingGoogle(false);
      const msg = err instanceof Error ? err.message : "Could not start Google sign-in";
      toast({ title: "Google sign-in failed", description: msg, variant: "destructive" });
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

  const callActive = async (c: ActiveContact) => {
    if (!user) return;
    const activeCall = getActiveCall();
    if (activeCall) {
      // Quietly back to the call in progress.
      navigate(activeCallPath(activeCall));
      return;
    }
    try {
      await prepareCallMedia(false);
    } catch (error) {
      toast({
        title: "Call permission needed",
        description: formatCallMediaError(error, false),
        variant: "destructive",
      });
      return;
    }
    try {
      const conversationId = await supabase
        .rpc("start_direct_conversation", { _other_user: c.user_id })
        .then((r) => {
          if (r.error) throw r.error;
          return r.data as string;
        });

      const roomName = `room-${conversationId}-${Date.now()}`;
      const { error: roomErr } = await supabase.functions.invoke("twilio-room", {
        body: { action: "create", roomName },
      });
      if (roomErr) {
        clearPreparedCallMedia();
        throw roomErr;
      }

      const { data: callRow, error: callErr } = await supabase
        .from("calls")
        .insert({
          conversation_id: conversationId,
          caller_id: user.id,
          callee_id: c.user_id,
          call_type: "voice",
          room_name: roomName,
          status: "ringing",
        })
        .select("id")
        .single();
      if (callErr) throw callErr;
      void supabase.functions.invoke("send-call-push", {
        body: {
          calleeId: c.user_id,
          callId: callRow.id,
          callType: "voice",
          callerName: c.display_name ?? "Someone",
          conversationId,
          roomName,
        },
      }).catch((e) => console.warn("[call-push] failed", e));
      navigate(
        `/call/${conversationId}?type=voice&callId=${callRow.id}&room=${encodeURIComponent(roomName)}&role=caller`,
        { replace: true, state: { peer: { name: c.display_name ?? "Contact", avatarUrl: c.avatar_url ?? null } } },
      );
    } catch (err) {
      clearPreparedCallMedia();
      const msg = err instanceof Error ? err.message : "Could not start call";
      toast({ title: "Call failed", description: msg, variant: "destructive" });
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
      const msg = err instanceof Error ? err.message : "Could not open chat";
      toast({ title: "Chat failed", description: msg, variant: "destructive" });
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
      const sent = await shareChichatInvite(inviteMessage(c.name));
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
        { label: "Open chat", icon: MessageSquare, onClick: () => chatActive(c) },
        { label: "Voice call", icon: Phone, onClick: () => callActive(c) },
        {
          label: "Edit name",
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
          label: "Send invite",
          icon: UserPlus,
          onClick: () => inviteContact(c),
        },
        {
          label: "Call this number",
          icon: Phone,
          onClick: () => navigate(`/dial/${encodeURIComponent(c.phone)}`),
        },
        {
          label: "Edit name",
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
          <h1 className="text-lg font-semibold text-foreground flex-1">Contacts</h1>
          {googleConnected && (
            <button
              aria-label="Refresh contacts"
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

        <div className="flex-1 overflow-y-auto pb-6">
          {/* Search */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search names or numbers"
                className="h-10 pl-9 text-sm bg-secondary/40 border-border"
              />
            </div>
          </div>

          {/* Top action card: Search ChiChat / New Group Call / New Contact / Invite a friend */}
          <div className="mx-4 mt-2 rounded-2xl bg-secondary/40 border border-border overflow-hidden">
            <ActionRow
              icon={Search}
              label="Search ChiChat"
              onClick={() => navigate("/home", { state: { openNewChat: true } })}
            />
            <Divider />
            <ActionRow
              icon={Users}
              label="New Group Call"
              onClick={() =>
                toast({
                  title: "Group calls coming soon",
                  description: "Stay tuned — we're putting the finishing touches on this.",
                })
              }
            />
            <Divider />
            <ActionRow
              icon={UserPlus}
              label="New Contact"
              onClick={() => navigate("/contacts/new")}
            />
            {canPickWebContacts && (
              <>
                <Divider />
                <ActionRow
                  icon={Smartphone}
                  label={syncing ? "Importing…" : "Import from phone"}
                  onClick={importFromPhone}
                />
              </>
            )}
            <Divider />
            <ActionRow
              icon={Heart}
              label="Invite a friend"
              onClick={() => navigate("/invite")}
            />
          </div>

          {/* Contacts permission denied — Android only */}
          {permissionDenied && (
            <div className="mx-4 mt-3 p-4 rounded-xl bg-secondary border border-border text-center">
              <p className="text-sm font-semibold text-foreground">
                Contacts access needed
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Allow ChiChat to access your contacts so you can see which friends are already on the app.
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
                {deniedTwice ? "Open settings → Permissions → Contacts" : "Allow contacts access"}
              </Button>
            </div>
          )}

          {phoneContactsError && (
            <div className="mx-4 mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-foreground">
              {phoneContactsError}
            </div>
          )}

          {/* Google connection prompt — only on web when not yet linked. */}
          {googleConnected === false && !isNativePlatform() && (
            <div className="mx-4 mt-3 p-3 rounded-xl bg-secondary border border-border">
              <p className="text-sm font-semibold text-foreground">
                Connect your Google account
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                We'll show your Google contacts here so you can message friends already on
                Chichat or invite the rest with one tap.
              </p>
              <Button
                onClick={connectGoogle}
                disabled={connectingGoogle}
                className="mt-3 w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold"
              >
                {connectingGoogle ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {connectingGoogle ? "Opening Google…" : "Connect Google"}
              </Button>
            </div>
          )}

          {syncing && totalContacts === 0 && (
            <p className="px-4 pt-4 text-xs text-muted-foreground text-center">
              Loading contacts…
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
                title="No contacts on Chichat yet"
                hint="Invite friends below to start chatting and calling."
                action={{
                  label: "Can't find someone? Search ChiChat",
                  onClick: () => navigate("/home", { state: { openNewChat: true } }),
                }}
              />
            )}
          </div>

          {/* Invite to ChiChat — non-app contacts */}
          {filteredInvite.length > 0 && (
            <div className="mt-6">
              <div className="px-4 py-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">Invite to Chichat</h2>
                <span className="text-xs text-muted-foreground">
                  {filteredInvite.length}
                </span>
              </div>
              <SectionList
                items={filteredInvite}
                getKey={(c) => `${c.phone}|${c.name}`}
                getSectionLabel={(c) => sectionLetter(c.name)}
                renderItem={(c) => {
                  const isManual = loadManualContacts().some(
                    (m) => m.phones[0] === c.phone,
                  );
                  return (
                    <InviteRow
                      c={c}
                      isManual={isManual}
                      onInvite={() => inviteContact(c)}
                      onRemove={() => handleRemoveManual(c.phone)}
                      onLongPress={() => openInviteActions(c)}
                    />
                  );
                }}
              />
            </div>
          )}

          {!isLoading && totalContacts === 0 && googleConnected && (
            <EmptyState
              title="No contacts found"
              hint="Tap refresh above to load your contacts."
            />
          )}

          {query &&
            filteredActive.length === 0 &&
            filteredInvite.length === 0 && (
              <EmptyState
                title="No matches"
                hint="Try a different name or number."
                action={{
                  label: "Search ChiChat directly",
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
