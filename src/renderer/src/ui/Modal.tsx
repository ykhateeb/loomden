import { type ReactNode, useEffect, useId, useRef } from "react";
import { cx } from "./base";
import { hasModifier, isTyping } from "./keys";

const FOCUSABLE = 'button:not(:disabled), input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])';

/** A dialog on a scrim: Esc closes, Tab stays inside, focus goes back to where it was. */
export function Modal(props: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** One-letter keys for the footer buttons, as in the boards (D delete, T trust…). Not while typing in a field. */
  keys?: Record<string, () => void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Read during the first render, before an autoFocus child takes focus: this is where focus goes back to.
  const before = useRef(document.activeElement as HTMLElement | null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  const keys = useRef(props.keys);
  keys.current = props.keys;

  useEffect(() => {
    const el = box.current;
    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    // On the document, so Esc and the Tab trap also work after a click on plain text moves focus to <body>.
    const onKey = (e: KeyboardEvent) => {
      if (!box.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return onClose.current();
      }
      const isLetterKey = !isTyping(e.target) && !hasModifier(e);
      const action = isLetterKey ? keys.current?.[e.key.toLowerCase()] : undefined;
      if (action) {
        e.preventDefault();
        return action();
      }
      if (e.key !== "Tab") return;
      const all = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const inside = box.current.contains(document.activeElement);
      // Tab stays in the dialog: from the last field to the first, and back with ⇧Tab.
      const wrapsBack = !inside || (e.shiftKey && document.activeElement === all[0]);
      const wrapsForward = !e.shiftKey && document.activeElement === all.at(-1);
      if (!wrapsBack && !wrapsForward) return;
      e.preventDefault();
      (wrapsBack ? all.at(-1) : all[0])?.focus();
    };
    document.addEventListener("keydown", onKey, true);
    const back = before.current;
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (back?.isConnected) back.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-scrim" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => e.stopPropagation()} // keys in a dialog are the dialog's, not the screen's behind it
        style={{ width: props.width ?? 520 }}
        className="flex max-h-[calc(100vh-64px)] max-w-[calc(100vw-32px)] flex-col rounded-2xl border border-line2 bg-panel shadow-modal outline-none"
      >
        <div className="flex items-center gap-3 px-5 pt-[18px]">
          {props.icon}
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={titleId} className="text-xl font-[650]">{props.title}</h2>
            {props.subtitle && <span className="text-sm text-muted">{props.subtitle}</span>}
          </div>
          {props.aside && <span className="ml-auto flex items-center gap-2">{props.aside}</span>}
        </div>
        {props.children && <div className="flex flex-col gap-3 overflow-auto px-5 pt-3.5 pb-[18px] text-sub">{props.children}</div>}
        {props.footer && <div className="flex items-center gap-2 rounded-b-2xl border-t border-line bg-[rgba(0,0,0,.08)] px-5 py-3.5">{props.footer}</div>}
      </div>
    </div>
  );
}

/** The round icon at the start of a dialog title. */
export function ModalIcon({ tone, children }: { tone: "danger" | "warn" | "accent"; children: ReactNode }) {
  const tones = { danger: "bg-danger-bg text-danger", warn: "bg-warn-bg text-warn", accent: "bg-accent-bg text-accent" };
  return <span className={cx("inline-flex size-[34px] shrink-0 items-center justify-center rounded-lg", tones[tone])}>{children}</span>;
}
