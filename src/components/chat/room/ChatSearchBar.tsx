import type React from "react";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/lib/i18n/context";

/** Search field shown in place of the chat header. */
export interface ChatSearchBarProps {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function ChatSearchBar({
  searchQuery,
  setSearchQuery,
  setSearchOpen,
}: ChatSearchBarProps) {
  const { t } = useLanguage();
  return (
    <div
      className="px-2 pt-4 pb-3 flex items-center gap-1 border-b border-border bg-card"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        aria-label={t("chat.closeSearch")}
        onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary shrink-0"
      >
        <ArrowLeft className="w-5 h-5 text-foreground" />
      </button>
      <Input
        autoFocus
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t("chat.searchHere")}
        className="h-9 text-xs bg-input border-border flex-1"
      />
    </div>
  );
}
