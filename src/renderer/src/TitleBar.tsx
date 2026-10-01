import { useState } from "react";
import { folderName } from "./chat/format";
import { actions } from "./actions";
import { type Tab, useStore } from "./store";
import { cx, Dot, pill, Pill, Spinner } from "./ui/base";
import { Icon, Logo } from "./ui/Icon";
import { Menu, type MenuItem } from "./ui/Menu";

const TABS: { id: Tab; label: string }[] = [
  { id: "sessions", label: "Sessions" },
  { id: "packages", label: "Packages" },
  { id: "settings", label: "Settings" },
];

/** Board 2 and 2b: logo, the three tabs, and the running / needs-you pills for every project. */
export function TitleBar() {
  const tab = useStore((s) => s.tab);
  const live = useStore((s) => s.live);
  const dialogs = useStore((s) => s.dialogs);
  const agent = useStore((s) => s.agent);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number }>();

  const running = Object.values(live).filter((l) => l.streaming);
  // A session waits for you while an extension dialog of it is open.
  const waiting = [...new Set(dialogs.map((d) => d.key).filter((k): k is string => !!k && !!live[k]))].map((k) => live[k]);

  const items: MenuItem[] = [
    { heading: "Running · every project" },
    ...running.map((l): MenuItem => ({ id: l.key, label: <span className="truncate">{l.title}</span>, icon: <Spinner size={10} />, meta: folderName(l.cwd), onSelect: () => actions.focus(l.key) })),
    ...(running.length === 0 ? [{ label: "Nothing is running", disabled: true, onSelect: () => {} }] : []),
    "sep",
    ...(waiting.length === 0
      ? [{ label: <span className="text-xs">Nothing needs you right now</span>, disabled: true, onSelect: () => {} }]
      : waiting.map((l): MenuItem => ({ id: `wait-${l.key}`, label: <span className="truncate">{l.title}</span>, icon: <Dot color="warn" />, meta: "needs you", onSelect: () => actions.focus(l.key) }))),
  ];

  return (
    // The window's traffic lights sit in the 88px on the left.
    <header className="drag flex h-12 shrink-0 items-center gap-3.5 border-b border-line bg-side pr-4 pl-[88px]">
      <div className="flex items-center gap-2 text-md font-[650] tracking-[0.2px]"><Logo /><span>Tenon</span></div>
      <nav aria-label="App" className="no-drag mx-auto flex gap-0.5 rounded-lg border border-line bg-panel p-[3px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => actions.setTab(t.id)}
            className={cx("rounded-sm px-3.5 py-[5px] text-base font-medium", tab === t.id ? "bg-raised text-fg shadow-tab" : "text-sub hover:text-fg")}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {agent === "starting" && <Pill tone="warn" className="no-drag">Starting pi…</Pill>}
      {agent === "stopped" && <Pill tone="danger" className="no-drag" title="The pi process stopped. Tenon starts it again unless it stopped at startup.">pi stopped</Pill>}
      <button
        className={pill("accent", cx("no-drag", menuAt && "shadow-open"))}
        title="Running sessions, across every project"
        aria-haspopup="menu"
        aria-expanded={!!menuAt}
        onMouseDown={(e) => e.stopPropagation()} // else the menu's click-outside closes it and this click opens it again
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenuAt(menuAt ? undefined : { x: r.right - 330, y: r.bottom + 8 });
        }}
      >
        {running.length > 0 && <Spinner size={9} />}
        {running.length} running
        <Icon name="chevronDown" size={13} />
      </button>
      {waiting.length > 0 && (
        <button className={pill("warn", "no-drag")} title="Go to the session that waits for you" onClick={() => actions.focus(waiting[0].key)}>
          <Dot color="warn" />
          {waiting.length} needs you
        </button>
      )}
      {menuAt && <Menu at={menuAt} width={330} label="Running" items={items} onClose={() => setMenuAt(undefined)} />}
    </header>
  );
}
