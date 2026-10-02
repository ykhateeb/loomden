// Surfaces of the design system: cards, callouts, the meter bar, list items, toasts, tables.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./base";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-xl border border-line bg-panel", className)}>{children}</section>;
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 px-3.5 pt-3 text-base font-semibold">{children}</div>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("px-3.5 pt-2.5 pb-3.5", className)}>{children}</div>;
}

export function Callout({ tone = "warn", icon, children }: { tone?: "warn" | "info"; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm text-sub", tone === "warn" ? "border-warn-line bg-warn-bg" : "border-accent-line bg-accent-bg")}>
      {icon && <span className={cx("flex pt-px", tone === "warn" ? "text-warn" : "text-accent")}>{icon}</span>}
      <span>{children}</span>
    </div>
  );
}

/** A thin meter, like context use. `percent` 0–100. */
export function Bar({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(percent, 100));
  return (
    <div className="relative h-1.5 rounded-[3px] bg-raised" role="meter" aria-label={label} aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <b className="absolute inset-y-0 left-0 rounded-[3px] bg-accent" style={{ width: `${p}%` }} />
    </div>
  );
}

/** A row in a side list. `meta` goes on the right (a time or a count). */
export function ListItem({ active, meta, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; meta?: ReactNode }) {
  return (
    <button
      {...props}
      aria-current={active ? "true" : undefined}
      className={cx(
        "flex w-full min-w-0 items-center gap-[9px] rounded-md px-2.5 py-[7px] text-left text-base",
        active ? "bg-accent-bg text-fg" : "text-sub hover:bg-hover hover:text-fg",
        className,
      )}
    >
      {children}
      {meta !== undefined && <span className="ml-auto flex shrink-0 items-center gap-1.5 text-meta text-muted">{meta}</span>}
    </button>
  );
}

const toastBorders = { info: "border-ok-line", warning: "border-warn-line", error: "border-danger-line" };

export function Toast({ level = "info", icon, children }: { level?: keyof typeof toastBorders; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx("flex items-center gap-2.5 rounded-xl border bg-raised px-3.5 py-2.5 text-base shadow-toast", toastBorders[level])}>
      {icon}
      {children}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full border-collapse text-base">{children}</table>;
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th className={cx("border-b border-line px-3 py-2 text-label font-semibold tracking-[0.6px] text-muted uppercase first:pl-4", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

export function Td({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <td className={cx("border-b border-line px-3 py-2.5 whitespace-nowrap text-sub first:pl-4", right && "text-right", className)}>{children}</td>;
}

/** A table row; `selected` gets the accent tint and the bar on its left. */
export function Tr({ selected, children }: { selected?: boolean; children: ReactNode }) {
  return (
    <tr
      className={cx(
        selected ? "[&>td]:bg-accent-bg [&>td]:text-fg [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:[&>td]:bg-hover",
      )}
    >
      {children}
    </tr>
  );
}
