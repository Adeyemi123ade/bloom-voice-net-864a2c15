import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";

// Public legal pages (/privacy, /terms). Both are in EXEMPT_ROUTES in
// DeviceGate.tsx and must never depend on auth state: app-store and Google
// OAuth reviewers, and signed-out visitors tapping the links on Register,
// must be able to read them.

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function LegalPage({
  title,
  lastUpdated,
  other,
  children,
}: {
  title: string;
  lastUpdated: string;
  /** The companion legal page, linked at the bottom. */
  other: { to: string; label: string };
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <header className="px-2 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
        </header>

        <article className="flex-1 px-5 py-5 space-y-6 text-sm leading-relaxed text-foreground/90">
          <p className="text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
          {children}

          <nav aria-label="Legal" className="pt-4 border-t border-border text-[13px] text-muted-foreground">
            See also our{" "}
            <Link to={other.to} className="text-primary font-semibold underline underline-offset-2">
              {other.label}
            </Link>
            . Questions:{" "}
            <a href="mailto:support@chichatapp.com" className="text-primary underline underline-offset-2">
              support@chichatapp.com
            </a>
          </nav>
        </article>
      </div>
    </MobileFrame>
  );
}
