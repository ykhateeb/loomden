import { cloneElement, type ReactElement, type ReactNode, useId, useRef, useState } from "react";

/** Shows `text` under the child after a short hover, or at once on keyboard focus. The child must be one element. */
export function Tooltip({ text, children }: { text: ReactNode; children: ReactElement<{ "aria-describedby"?: string }> }) {
  const [at, setAt] = useState<{ x: number; y: number }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();

  const show = (el: HTMLElement, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      setAt({ x: Math.min(r.left, innerWidth - 320), y: r.bottom + 6 });
    }, delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setAt(undefined);
  };

  return (
    <span className="inline-flex min-w-0" onMouseEnter={(e) => show(e.currentTarget, 450)} onMouseLeave={hide} onFocus={(e) => show(e.currentTarget, 0)} onBlur={hide}>
      {/* The description goes on the focusable child, so a screen reader reads it with the child. */}
      {cloneElement(children, { "aria-describedby": at ? id : undefined })}
      {at && (
        <span id={id} role="tooltip" style={{ left: at.x, top: at.y }} className="pointer-events-none fixed z-[35] rounded-md bg-tip px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-tip-fg shadow-tip">
          {text}
        </span>
      )}
    </span>
  );
}
