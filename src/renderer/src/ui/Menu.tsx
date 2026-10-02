import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cx } from "./base";
import { Icon } from "./Icon";

export type MenuItem =
  | { id?: string; label: ReactNode; icon?: ReactNode; shortcut?: string; meta?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { heading: string }
  | { note: string }
  | "sep";

type Action = Extract<MenuItem, { onSelect: unknown }>;
const isAction = (i: MenuItem): i is Action => typeof i === "object" && "onSelect" in i && !i.disabled;

/**
 * A popup menu at a point (right-click, or under a button).
 * ↑ ↓ move, ↵ picks, Esc or a click outside closes. A one-letter shortcut picks its item.
 */
/** An open menu: where it shows, its items, and its name for screen readers. */
export type MenuState = { at: { x: number; y: number }; items: MenuItem[]; label: string };

/** The icon of a menu item that can be the current one: a check mark, or a space of the same width. */
export function checkMark(on: boolean): ReactNode {
  return on ? <Icon name="check" size={13} /> : <span className="w-[13px]" />;
}

export function Menu({ at, items, onClose, label = "Menu", width }: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void; label?: string; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const idBase = useId();
  const [pos, setPos] = useState(at);
  // The highlighted row is kept by id (or position), so a list that changes while open does not move it to another row.
  const keyOf = (item: MenuItem, i: number) => (typeof item === "object" && "id" in item && item.id) || String(i);
  const [activeKey, setActiveKey] = useState<string>();
  const found = items.findIndex((item, i) => isAction(item) && keyOf(item, i) === activeKey);
  const active = found >= 0 ? found : items.findIndex(isAction);
  const setActive = (i: number) => setActiveKey(keyOf(items[i], i));

  // Keep the menu inside the window, also when its list grows.
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(8, Math.min(at.x, innerWidth - r.width - 8));
    const y = Math.max(8, Math.min(at.y, innerHeight - r.height - 8));
    setPos((p) => (p.x === x && p.y === y ? p : { x, y }));
  }, [at, items.length]);

  useEffect(() => {
    box.current?.focus();
    const outside = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", outside);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const pick = (item: MenuItem) => {
    if (!isAction(item)) return;
    onClose();
    item.onSelect();
  };

  const move = (step: number) => {
    for (let i = 1; i <= items.length; i++) {
      const next = (active + step * i + items.length) % items.length;
      if (isAction(items[next])) return setActive(next);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") return onClose();
    const shortcut = items.find((i) => isAction(i) && i.shortcut?.toLowerCase() === e.key.toLowerCase());
    const keyActions: Record<string, () => unknown> = { ArrowDown: () => move(1), ArrowUp: () => move(-1), Enter: () => items[active] && pick(items[active]) };
    const run = keyActions[e.key] ?? (shortcut && (() => pick(shortcut)));
    if (!run) return;
    e.preventDefault();
    run();
  };

  return (
    <div
      ref={box}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      aria-activedescendant={active >= 0 ? `${idBase}-${active}` : undefined}
      style={{ left: pos.x, top: pos.y, width }}
      onKeyDown={onKeyDown}
      className="fixed z-30 flex min-w-[200px] flex-col gap-px rounded-xl border border-line2 bg-raised p-1.5 shadow-menu outline-none"
    >
      {items.map((item, i) =>
        item === "sep" ? (
          <div key={i} className="mx-1 my-[5px] h-px bg-line" role="separator" />
        ) : "heading" in item ? (
          <div key={i} className="px-2.5 pt-1.5 pb-1 text-label font-semibold tracking-[0.6px] text-muted uppercase">{item.heading}</div>
        ) : "note" in item ? (
          <div key={i} className="max-w-[260px] px-2.5 pt-1 pb-1.5 text-xs whitespace-normal text-muted">{item.note}</div>
        ) : (
          <button
            key={i}
            id={`${idBase}-${i}`}
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            className={cx(
              "flex w-full min-w-0 items-center gap-2.5 rounded-sm px-2.5 py-[7px] text-left text-base whitespace-nowrap disabled:text-dim",
              i !== active && (item.danger ? "text-danger" : "text-fg"),
              i === active && (item.danger ? "bg-danger text-ink-danger" : "bg-accent text-ink"),
            )}
            onMouseEnter={() => !item.disabled && setActive(i)}
            onClick={() => pick(item)}
          >
            {item.icon}
            {item.label}
            {(item.shortcut ?? item.meta) && (
              <span className={cx("ml-auto shrink-0 pl-[18px] text-meta", i === active ? "text-ink/70" : "text-muted")}>{item.shortcut ?? item.meta}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
