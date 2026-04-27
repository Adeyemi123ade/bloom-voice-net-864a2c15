import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit3,
  Grid3x3,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { toE164, formatDisplay } from "@/lib/phone";
import {
  DeviceContact,
  addManualContact,
  clearContactsCache,
  isNativePlatform,
  loadCachedContacts,
  loadManualContacts,
  loadNativeContacts,
  removeManualContact,
  saveCachedContacts,
} from "@/lib/deviceContacts";
import Dialpad from "@/components/Dialpad";
import ContactActionSheet, { ContactAction } from "@/components/ContactActionSheet";
import SaveContactDialog from "@/components/SaveContactDialog";
import { useLongPress } from "@/hooks/useLongPress";

interface MatchedUser {
  phone: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ActiveContact {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  phone: string;
  call_count: number;
  last_called_at: string | null;
}

interface InviteContact {
  name: string;
  phone: string;
  invited: boolean;
}

const APP_INVITE_LINK = "https://bloom-voice-net.lovable.app";
const BATCH_SIZE = 200;
const PRIVACY_DISMISSED_KEY = "chichat:contacts:privacy-dismissed";

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function inviteMessage(name: string) {
  return `Hey ${name}, I've been using Chichat for high-quality calls and messages. Join me here so we can call for free: ${APP_INVITE_LINK} Download now!`;
}

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
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [missingOwnPhone, setMissingOwnPhone] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);
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

  // Initial load: cached contacts + manual + matching
  useEffect(() => {
    if (!user) return;
    (async () => {
      // Warn if the user hasn't set their own phone yet
      const { data: me } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .maybeSingle();
      setMissingOwnPhone(!(me as { phone?: string | null } | null)?.phone);

      const cached = loadCachedContacts() ?? [];
      const manual = loadManualContacts();
      const merged = mergeContacts(cached, manual);
      setContacts(merged);
      if (merged.length) await runMatch(merged);
      await loadInvited();
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

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (isNativePlatform()) {
        const list = await loadNativeContacts();
        if (!list.length) {
          toast({ title: "No contacts found on device" });
        }
        const manual = loadManualContacts();
        const merged = mergeContacts(list, manual);
        saveCachedContacts(list);
        setContacts(merged);
        await runMatch(merged);
        toast({ title: `Synced ${list.length} contacts` });
      } else {
        toast({
          title: "Device sync runs in the mobile app",
          description: "On the web you can add contacts manually below.",
        });
        setAddOpen(true);
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "PERMISSION_DENIED") {
        toast({
          title: "Permission denied",
          description: "Allow contacts access in your phone settings to sync.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sync failed",
          description: code || "Try again.",
          variant: "destructive",
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleRefresh = async () => {
    clearContactsCache();
    await handleSync();
  };

  const handleAddManual = () => {
    const e164 = toE164(addPhone.trim());
    if (!e164) {
      toast({
        title: "Invalid phone number",
        description: "Use international format like +234 801 234 5678",
        variant: "destructive",
      });
      return;
    }
    const updated = addManualContact(addName.trim() || e164, e164);
    const cached = loadCachedContacts() ?? [];
    const merged = mergeContacts(cached, updated);
    setContacts(merged);
    setAddName("");
    setAddPhone("");
    setAddOpen(false);
    runMatch(merged);
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
    try {
      const conversationId = await supabase
        .rpc("start_direct_conversation", { _other_user: c.user_id })
        .then((r) => {
          if (r.error) throw r.error;
          return r.data as string;
        });

      const roomName = `room-${conversationId}-${Date.now()}`;
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
      navigate(`/call/${callRow.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start call";
      toast({ title: "Call failed", description: msg, variant: "destructive" });
    }
  };

  const inviteContact = async (c: InviteContact) => {
    if (!user) return;
    const body = encodeURIComponent(inviteMessage(c.name));
    // Open the device's native SMS composer — zero cost, fully user-initiated.
    const url = `sms:${c.phone}?body=${body}`;
    window.location.href = url;
    // Record the invite (idempotent thanks to unique index)
    await supabase.from("invites").insert({
      inviter_id: user.id,
      phone: c.phone,
      contact_name: c.name,
    });
    setInvitedPhones((prev) => new Set(prev).add(c.phone));
  };

  const openActiveActions = (c: ActiveContact) => {
    setActionSheet({
      title: c.display_name,
      subtitle: formatDisplay(c.phone),
      actions: [
        { label: "Call (in-app)", icon: Phone, onClick: () => callActive(c) },
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
          label: "Call this number",
          icon: Phone,
          onClick: () => navigate(`/dial/${encodeURIComponent(c.phone)}`),
        },
        {
          label: c.invited ? "Re-invite to ChiChat" : "Invite to ChiChat",
          icon: Send,
          onClick: () => inviteContact(c),
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
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background">
        {/* Header */}
        <div className="px-3 pt-4 pb-3 border-b border-border flex items-center gap-2">
          <button
            aria-label="Back"
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <h1 className="text-sm font-semibold text-foreground flex-1">Contacts</h1>
          <button
            aria-label="Refresh"
            onClick={handleRefresh}
            disabled={syncing || matching}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 text-foreground ${syncing ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {missingOwnPhone && (
            <div className="mx-3 mt-3 p-3 rounded-lg bg-accent/10 border border-accent/30">
              <p className="text-[11px] text-foreground">
                Add your phone number on your profile so friends can find you when
                they sync their contacts.
              </p>
              <Button
                onClick={() => navigate("/profile")}
                className="mt-2 h-8 px-3 text-[11px] bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                Add phone number
              </Button>
            </div>
          )}

          {/* Sync section */}
          <div className="px-3 pt-3 space-y-2">
            <Button
              onClick={handleSync}
              disabled={syncing}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
              {syncing
                ? "Syncing contacts from your phone…"
                : isNativePlatform()
                  ? "Sync contacts"
                  : "Sync contacts"}
            </Button>

            {syncing && (
              <p className="text-[10.5px] text-muted-foreground text-center">
                This may take a few seconds.
              </p>
            )}

            {/* Manual add is a fallback only when device sync isn't available (web). */}
            {!isNativePlatform() && (
              <Button
                onClick={() => setAddOpen(true)}
                variant="outline"
                className="w-full h-9 rounded-lg text-[11px] border-border"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add a contact manually
              </Button>
            )}

            {showPrivacy && (
              <div className="relative p-3 rounded-lg bg-secondary border border-border">
                <button
                  aria-label="Dismiss"
                  onClick={dismissPrivacy}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center hover:bg-background/60"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
                <p className="text-[10.5px] text-muted-foreground leading-relaxed pr-5">
                  We access your contacts only to help you call and invite friends.
                  We never store your full contact list.
                </p>
              </div>
            )}
          </div>

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
              <TabsTrigger value="active" className="text-[11px]">
                <Users className="w-3.5 h-3.5 mr-1" />
                Active ({active.length})
              </TabsTrigger>
              <TabsTrigger value="invite" className="text-[11px]">
                <Send className="w-3.5 h-3.5 mr-1" />
                Invite ({invite.length})
              </TabsTrigger>
            </TabsList>

            {/* Active tab */}
            <TabsContent value="active" className="mt-3 space-y-1">
              {matching && (
                <p className="text-[11px] text-muted-foreground text-center py-3">
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
                    onInvite={() => inviteContact(c)}
                    onRemove={() => handleRemoveManual(c.phone)}
                    onLongPress={() => openInviteActions(c)}
                  />
                );
              })}
            </TabsContent>
          </Tabs>
        </div>

        {/* Manual add dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-[320px] bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-sm">Add a contact</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-name" className="text-[11px] text-muted-foreground">
                  Name
                </Label>
                <Input
                  id="add-name"
                  autoFocus
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Jane Doe"
                  className="h-9 text-xs bg-input border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-phone" className="text-[11px] text-muted-foreground">
                  Phone number
                </Label>
                <Input
                  id="add-phone"
                  type="tel"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="+234 801 234 5678"
                  className="h-9 text-xs bg-input border-border"
                />
              </div>
              <Button
                onClick={handleAddManual}
                className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs"
              >
                Add contact
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MobileFrame>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
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
