// Small parts of the design system: buttons, key hints, pills, dots, spinners, labels.
import type { ButtonHTMLAttributes, ComponentProps, CSSProperties, ReactNode } from "react";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know the theme's own text sizes, or it takes text-meta for a color and drops text-muted.
const merge = extendTailwindMerge({ extend: { theme: { text: ["label", "meta", "body"] } } });

/** Join class names; false/undefined parts drop out, and a later class wins over an earlier one of the same kind. */
export const cx = (...parts: (string | false | null | undefined)[]) => merge(parts.filter(Boolean).join(" "));

const buttonVariants = {
  default: "border-line2 bg-raised text-fg enabled:hover:bg-hover",
  primary: "border-accent bg-accent font-semibold text-ink enabled:hover:border-accent2 enabled:hover:bg-accent2",
  ghost: "border-line2 bg-transparent text-fg enabled:hover:bg-hover",
  danger: "border-danger-line bg-transparent text-danger enabled:hover:bg-danger-bg",
  dangerFill: "border-danger bg-danger font-semibold text-ink-danger",
};

export function Button({ variant = "default", small, className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants; small?: boolean }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex shrink-0 items-center gap-[7px] rounded-md border px-3 text-base font-medium whitespace-nowrap disabled:opacity-50",
        small ? "h-[30px]" : "h-8",
        buttonVariants[variant],
        className,
      )}
    />
  );
}

/** A small accent text button, like "Compact now" or "Reload" in a card header. */
export function LinkButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cx("text-xs font-medium text-accent enabled:hover:text-accent2 enabled:hover:underline disabled:text-dim", className)} />;
}

/** A square icon button. `label` is its accessible name and its tooltip. */
export function IconButton({ label, bare, size = 32, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; bare?: boolean; size?: number }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={props.title ?? label}
      style={{ width: size, height: size, ...props.style }}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-md border text-sub enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-50", bare ? "border-transparent" : "border-line", className)}
    />
  );
}

/** A key hint, like esc or ⌘K. `onFill` for a key on a primary or danger button. */
export function Kbd({ children, onFill }: { children: ReactNode; onFill?: boolean }) {
  return (
    <span className={cx("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border px-[5px] text-label font-medium", onFill ? "border-ink/25 text-ink/75" : "border-line2 text-muted")}>
      {children}
    </span>
  );
}

export const pillTones = {
  accent: "bg-accent-bg text-accent2",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  dim: "border border-line bg-raised text-sub",
  orange: "bg-orange-bg text-orange",
  violet: "bg-violet-bg text-violet",
  danger: "bg-danger-bg text-danger",
};
export type PillTone = keyof typeof pillTones;

/** Classes of a pill, for a <button> that looks like one. */
export const pill = (tone: PillTone, className?: string) =>
  cx("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", pillTones[tone], className);

export function Pill({ tone, className, style, title, children }: { tone: PillTone; className?: string; style?: CSSProperties; title?: string; children: ReactNode }) {
  return <span className={pill(tone, className)} style={style} title={title}>{children}</span>;
}

/** A small file or command reference, like @refresh.ts. */
export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-sm bg-orange-bg px-[7px] py-px font-mono text-xs font-medium text-orange">{children}</span>;
}

/** A status dot. `color` is a theme color name: ok, warn, accent… */
export function Dot({ color }: { color: string }) {
  return <span className="inline-block size-[7px] shrink-0 rounded-full" style={{ background: `var(--color-${color})` }} />;
}

export function Spinner({ size = 12, label }: { size?: number; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      className="inline-block shrink-0 animate-spin rounded-full border-2 border-accent-line border-t-accent"
      style={{ width: size, height: size }}
    />
  );
}

/** The uppercase section label. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("text-label font-semibold tracking-label text-muted uppercase", className)}>{children}</span>;
}

/** The square avatar in the chat: Y for you, π for pi. */
export function Avatar({ you }: { you?: boolean }) {
  return (
    <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-[9px] text-xs font-bold", you ? "bg-you-bg text-you" : "bg-accent-bg text-accent")}>
      {you ? "Y" : "π"}
    </span>
  );
}
