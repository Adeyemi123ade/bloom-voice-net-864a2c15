import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Edit3,
  Loader2,
  MessageCircle,
  MessageSquare,
  Phone,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDisplay } from "@/lib/phone";
import {
  DeviceContact,
  isNativePlatform,
  loadCachedContacts,
  loadManualContacts,
  loadNativeContacts,
  removeManualContact,
  saveCachedContacts,
} from "@/lib/deviceContacts";
import {
  isGoogleConnected,
  startGoogleContactsConnect,
  syncGoogleContacts,
} from "@/lib/googleContacts";
import ContactActionSheet, { ContactAction } from "@/components/ContactActionSheet";
import SaveContactDialog from "@/components/SaveContactDialog";
import { requestIgnoreBatteryOptimizations } from "@/lib/nativeCalls";
import {
  ActiveContact,
  BATCH_SIZE,
  InviteContact,
  MatchedUser,
  PRIVACY_DISMISSED_KEY,
  inviteMessage,
  mergeContacts,
} from "@/components/contacts/contactsHelpers";
import { ActiveRow, EmptyState, InviteRow } from "@/components/contacts/ContactRows";
import { ShareInviteCard } from "@/components/contacts/ShareInviteCard";

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
  const [showPrivacy, setShowPrivacy] = useState(
    () => !localStorage.getItem(PRIVACY_DISMISSED_KEY),
  );
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
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

  // Initial load: cached contacts + auto-sync.
  // On native (Android/iOS) we read directly from the device — Google OAuth is
  // not needed and avoids the in-app-browser 403. On web, we fall back to Google.
  useEffect(() => {
    if (!user) return;
    (async () => {
      // Show whatever is cached immediately
      const cached = loadCachedContacts() ?? [];
      const manual = loadManualContacts();
      const merged = mergeContacts(cached, manual);
      setContacts(merged);
      if (merged.length) await runMatch(merged);
      await loadInvited();

      if (isNativePlatform()) {
        // Native: read device contacts directly. No OAuth, no external redirects.
        setGoogleConnected(true); // Hide the "Connect Google" prompt on native.
        setSyncing(true);
        try {
          const list = await loadNativeContacts();
          saveCachedContacts(list);
          const fresh = mergeContacts(list, loadManualContacts());
          setContacts(fresh);
          if (fresh.length) await runMatch(fresh);
        } catch (err) {
          const code = err instanceof Error ? err.message : "";
          if (code === "PERMISSION_DENIED") {
            toast({
              title: "Contacts permission needed",
              description: "Allow contacts access in your phone settings to see who's on Chichat.",
              variant: "destructive",
            });
          }
          // NOT_NATIVE shouldn't happen here; ignore other errors silently.
        } finally {
          setSyncing(false);
        }
        return;
      }

      // Web: use Google as the contacts source.
      try {
        const connected = await isGoogleConnected();
        setGoogleConnected(connected);
        if (connected) {
          setSyncing(true);
          try {
            const list = await syncGoogleContacts();
            const fresh = mergeContacts(list, loadManualContacts());
            setContacts(fresh);
            if (fresh.length) await runMatch(fresh);
          } catch {
            // Silent — user can retry from Settings.
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

      // Pull call_stats for matched users only
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

  /** Pull a fresh copy of contacts — from device on native, Google on web. */
  const refreshFromGoogle = async () => {
    setSyncing(true);
    try {
      const list = isNativePlatform()
        ? await loadNativeContacts()
        : await syncGoogleContacts();
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

  /** Kick off Google OAuth from this screen so the user never hits a dead end. */
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

  const dismissPrivacy = () => {
    localStorage.setItem(PRIVACY_DISMISSED_KEY, "1");
    setShowPrivacy(false);
  };

  // Build active + invite lists
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

    activeList.sort((a, b) => {
      if (b.call_count !== a.call_count) return b.call_count - a.call_count;
      const at = a.last_called_at ? Date.parse(a.last_called_at) : 0;
      const bt = b.last_called_at ? Date.parse(b.last_called_at) : 0;
      return bt - at;
    });
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
    if (!localStorage.getItem("chichat:battery-prompt-shown")) {
      void requestIgnoreBatteryOptimizations();
      localStorage.setItem("chichat:battery-prompt-shown", "1");
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
      if (roomErr) throw roomErr;

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
      navigate(`/call/${conversationId}?type=voice&callId=${callRow.id}&room=${encodeURIComponent(roomName)}&role=caller`, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start call";
      toast({ title: "Call failed", description: msg, variant: "destructive" });
    }
  };

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

  /** Record an invite (idempotent) and mark the row as invited. */
  const recordInvite = async (c: InviteContact) => {
    if (!user) return;
    await supabase.from("invites").insert({
      inviter_id: user.id,
      phone: c.phone,
      contact_name: c.name,
    });
    setInvitedPhones((prev) => new Set(prev).add(c.phone));
  };

  const inviteViaWhatsApp = async (c: InviteContact) => {
    const text = encodeURIComponent(inviteMessage(c.name));
    // wa.me wants digits only, no leading '+'.
    const digits = c.phone.replace(/[^\d]/g, "");
    window.open(`https://wa.me/${digits}?text=${text}`, "_blank", "noopener");
    await recordInvite(c);
  };

  const inviteViaSms = async (c: InviteContact) => {
    const body = encodeURIComponent(inviteMessage(c.name));
    window.location.href = `sms:${c.phone}?body=${body}`;
    await recordInvite(c);
  };

  const openActiveActions = (c: ActiveContact) => {
    setActionSheet({
      title: c.display_name,
      subtitle: formatDisplay(c.phone),
      actions: [
        { label: "Call (in-app)", icon: Phone, onClick: () => callActive(c) },
        { label: "Open chat", icon: MessageSquare, onClick: () => chatActive(c) },
        {
          label: "Edit name",
          icon: Edit3,
          onClick: () => setEditTarget({ phone: c.phone }),
        },
        {
          label: "Remove from my contacts",
          icon: Trash2,
          destructive: true,
          onClick: () => handleRemoveManual(c.phone),
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
          label: "Invite via WhatsApp",
          icon: MessageCircle,
          onClick: () => inviteViaWhatsApp(c),
        },
        {
          label: "Invite via SMS",
          icon: MessageSquare,
          onClick: () => inviteViaSms(c),
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
        {
          label: "Remove from my contacts",
          icon: Trash2,
          destructive: true,
          onClick: () => handleRemoveManual(c.phone),
        },
      ],
    });
  };

  return (
    <MobileFrame bottomNav="contacts">
      <div className="h-full w-full flex flex-col bg-background relative">
        {/* Header — no back arrow; navigation is handled by bottom nav + system back. */}
        <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
          <h1 className="text-base font-semibold text-foreground flex-1">Contacts</h1>
          {googleConnected && (
            <button
              aria-label="Refresh contacts"
              onClick={refreshFromGoogle}
              disabled={syncing || matching}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary disabled:opacity-50"
            >
              <Loader2
                className={`w-4 h-4 text-foreground ${syncing ? "animate-spin" : "hidden"}`}
              />
              {!syncing && (
                <Send className="w-4 h-4 text-foreground rotate-45 opacity-0" />
              )}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Share invite link — anyone you send this to can join. */}
          <ShareInviteCard />

          {/* Google connection prompt — only when not yet linked. Always offers a way back. */}
          {googleConnected === false && (
            <div className="px-3 pt-3 space-y-2">
              <div className="p-3 rounded-lg bg-secondary border border-border">
                <p className="text-sm font-semibold text-foreground">
                  Connect your Google account
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  We'll show your Google contacts here so you can call friends already on
                  Chichat or invite the rest with one tap.
                </p>
                <Button
                  onClick={connectGoogle}
                  disabled={connectingGoogle}
                  className="mt-3 w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold"
                >
                  {connectingGoogle ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {connectingGoogle ? "Opening Google…" : "Connect Google"}
                </Button>
              </div>
            </div>
          )}

          {syncing && (
            <p className="px-3 pt-3 text-xs text-muted-foreground text-center">
              Loading contacts from Google…
            </p>
          )}

          {showPrivacy && googleConnected && (
            <div className="px-3 pt-3">
              <div className="relative p-3 rounded-lg bg-secondary border border-border">
                <button
                  aria-label="Dismiss"
                  onClick={dismissPrivacy}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center hover:bg-background/60"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
                <p className="text-xs text-muted-foreground leading-relaxed pr-5">
                  We use your Google contacts only to find friends already on Chichat
                  and let you invite the rest. We never share your contact list.
                </p>
              </div>
            </div>
          )}
          {/* Search */}
          <div className="px-3 pt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts"
                className="h-8 pl-8 text-xs bg-input border-border"
              />
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="active" className="px-3 pt-3 pb-4">
            <TabsList className="grid grid-cols-2 w-full h-9 bg-secondary">
              <TabsTrigger value="active" className="text-xs">
                <Users className="w-3.5 h-3.5 mr-1" />
                Active ({active.length})
              </TabsTrigger>
              <TabsTrigger value="invite" className="text-xs">
                <Send className="w-3.5 h-3.5 mr-1" />
                Invite ({invite.length})
              </TabsTrigger>
            </TabsList>

            {/* Active tab */}
            <TabsContent value="active" className="mt-3 space-y-1">
              {matching && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Checking who's on Chichat…
                </p>
              )}
              {!matching && filteredActive.length === 0 && (
                <EmptyState
                  title={
                    contacts.length === 0
                      ? "Sync to find friends"
                      : query
                        ? "No matches"
                        : "No active contacts yet"
                  }
                  hint={
                    contacts.length === 0
                      ? "Tap Sync above to see which of your contacts are on Chichat."
                      : "Invite friends from the next tab to grow your circle."
                  }
                />
              )}
              {filteredActive.map((c) => (
                <ActiveRow
                  key={c.user_id}
                  c={c}
                  onCall={() => callActive(c)}
                  onLongPress={() => openActiveActions(c)}
                />
              ))}
            </TabsContent>

            {/* Invite tab */}
            <TabsContent value="invite" className="mt-3 space-y-1">
              {!matching && filteredInvite.length === 0 && (
                <EmptyState
                  title={
                    contacts.length === 0
                      ? "No contacts loaded"
                      : query
                        ? "No matches"
                        : "Everyone is already on Chichat 🎉"
                  }
                  hint={
                    contacts.length === 0
                      ? "Sync your device contacts or add one manually."
                      : "Check back after syncing again."
                  }
                />
              )}
              {filteredInvite.map((c) => {
                const isManual = c.phone && loadManualContacts().some((m) => m.phones[0] === c.phone);
                return (
                  <InviteRow
                    key={c.phone}
                    c={c}
                    isManual={!!isManual}
                    onInvite={() => inviteViaWhatsApp(c)}
                    onRemove={() => handleRemoveManual(c.phone)}
                    onLongPress={() => openInviteActions(c)}
                  />
                );
              })}
            </TabsContent>
          </Tabs>
        </div>

        {/* Manual add removed — contacts come from Google. */}
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

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

function ActiveRow({
  c,
  onCall,
  onLongPress,
}: {
  c: ActiveContact;
  onCall: () => void;
  onLongPress: () => void;
}) {
  // Tap the row body → open action sheet (Call / Chat / …). Tap the Call
  // button → call directly.
  const lp = useLongPress(onLongPress);
  return (
    <div
      {...lp}
      onClick={onLongPress}
      className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-secondary select-none cursor-pointer"
    >
      <Avatar className="w-10 h-10">
        <AvatarImage src={c.avatar_url ?? undefined} />
        <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
          {initials(c.display_name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-foreground truncate">
            {c.display_name}
          </p>
          {c.call_count >= 3 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-semibold">
              Frequent · {c.call_count}
            </Badge>
          )}
        </div>
        <p className="text-2xs text-muted-foreground truncate">
          {formatDisplay(c.phone)}
        </p>
      </div>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onCall();
        }}
        aria-label={`Call ${c.display_name}`}
        className="h-9 w-9 p-0 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full"
      >
        <Phone className="w-4 h-4" />
      </Button>
    </div>
  );
}

function InviteRow({
  c,
  isManual,
  onInvite,
  onRemove,
  onLongPress,
}: {
  c: InviteContact;
  isManual: boolean;
  onInvite: () => void;
  onRemove: () => void;
  onLongPress: () => void;
}) {
  const lp = useLongPress(onLongPress);
  return (
    <div
      {...lp}
      onClick={onLongPress}
      className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-secondary select-none cursor-pointer"
    >
      <Avatar className="w-10 h-10">
        <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
          {initials(c.name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
        <p className="text-2xs text-muted-foreground truncate">
          {formatDisplay(c.phone)}
        </p>
      </div>
      {isManual && (
        <button
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-background"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onInvite();
        }}
        variant={c.invited ? "outline" : "default"}
        className={
          c.invited
            ? "h-9 px-3 rounded-lg text-xs border-border"
            : "h-9 px-3 bg-[#25D366] hover:bg-[#1ebe5a] text-white rounded-lg text-xs"
        }
      >
        <MessageCircle className="w-3.5 h-3.5" />
        {c.invited ? "Sent" : "WhatsApp"}
      </Button>
    </div>
  );
}

function ShareInviteCard() {
  const link = APP_INVITE_LINK;
  const text = `Join me on Chichat — high-quality calls and messages: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copied", description: "Paste it anywhere." });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  const share = async () => {
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ title: "Chichat", text, url: link });
        return;
      } catch {
        /* user cancelled — fall through */
      }
    }
    // Fallback: open WhatsApp web share.
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
  };

  const whatsapp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
  };

  return (
    <div className="mx-3 mt-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
      <div className="flex items-center gap-2">
        <Share2 className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold text-foreground">Invite anyone with a link</p>
      </div>
      <p className="text-2xs text-muted-foreground mt-1 truncate">{link}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          onClick={copy}
          className="h-9 rounded-md bg-secondary hover:bg-secondary/80 text-foreground text-2xs font-semibold inline-flex items-center justify-center gap-1"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy
        </button>
        <button
          onClick={whatsapp}
          className="h-9 rounded-md bg-[#25D366] hover:bg-[#1ebe5a] text-white text-2xs font-semibold inline-flex items-center justify-center gap-1"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          WhatsApp
        </button>
        <button
          onClick={share}
          className="h-9 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-2xs font-semibold inline-flex items-center justify-center gap-1"
        >
          <Share2 className="w-3.5 h-3.5" />
          Share
        </button>
      </div>
    </div>
  );
}

function mergeContacts(a: DeviceContact[], b: DeviceContact[]): DeviceContact[] {
  const byPhone = new Map<string, DeviceContact>();
  for (const c of [...a, ...b]) {
    const key = c.phones[0];
    if (!key) continue;
    const existing = byPhone.get(key);
    if (existing) {
      if (!existing.name && c.name) existing.name = c.name;
    } else {
      byPhone.set(key, { name: c.name, phones: [...c.phones] });
    }
  }
  return Array.from(byPhone.values());
}
