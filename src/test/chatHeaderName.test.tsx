import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatHeader from "@/components/chat/room/ChatHeader";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import type { Profile } from "@/lib/chat/chatRoomData";

const noop = vi.fn();
function renderHeader(other: Profile | null, peer: { name: string | null; avatarUrl: string | null } | null = null) {
  return render(
    <LanguageProvider>
      <ChatHeader
        showBackArrow={false}
        goBack={noop}
        other={other}
        peer={peer}
        otherTyping={false}
        startCall={noop}
        setContactInfoOpen={noop}
        setSearchOpen={noop}
        setClearChatOpen={noop}
        setBlockOpen={noop}
        blockedByMe={false}
        setReport={noop}
      />
    </LanguageProvider>,
  );
}

const loaded = (name: string | null): Profile =>
  ({ id: "u1", display_name: name, avatar_url: null, is_online: false, last_seen_at: new Date(0).toISOString(), show_last_seen: false }) as Profile;

describe("Chat header name", () => {
  it("shows the tapped person's name at once while the chat loads", () => {
    renderHeader(null, { name: "Tunde Bakare", avatarUrl: null });
    expect(screen.getByText("Tunde Bakare")).toBeInTheDocument();
    expect(screen.queryByText("ChiChat user")).not.toBeInTheDocument();
  });

  it("shows a loading bar, never 'ChiChat user', while nothing is known yet", () => {
    renderHeader(null);
    expect(screen.getByTestId("chat-name-loading")).toBeInTheDocument();
    expect(screen.queryByText("ChiChat user")).not.toBeInTheDocument();
  });

  it("shows the real name once loaded", () => {
    renderHeader(loaded("Tunde Bakare"), { name: "Tunde", avatarUrl: null });
    expect(screen.getByText("Tunde Bakare")).toBeInTheDocument();
  });

  it("keeps 'ChiChat user' only for a loaded chat whose person can't be shown", () => {
    renderHeader(loaded(null));
    expect(screen.getByText("ChiChat user")).toBeInTheDocument();
  });
});
