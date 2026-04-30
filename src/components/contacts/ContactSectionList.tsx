import { ReactNode } from "react";

/** Render rows grouped by their first-letter section header (A, B, C…). */
export function SectionList<T>({
  items,
  getKey,
  getSectionLabel,
  renderItem,
}: {
  items: T[];
  getKey: (item: T) => string;
  getSectionLabel: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  const groups: { label: string; items: T[] }[] = [];
  let current: { label: string; items: T[] } | null = null;
  for (const item of items) {
    const label = getSectionLabel(item);
    if (!current || current.label !== label) {
      current = { label, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-secondary/30 sticky top-0 z-10">
            {g.label}
          </div>
          {g.items.map((it) => (
            <div key={getKey(it)}>{renderItem(it)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** First A-Z letter of a name; non-letters bucketed under '#'. */
export function sectionLetter(name: string): string {
  const ch = (name?.trim()?.[0] ?? "").toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}
