import { type ReactNode, useState } from "react";
import type { LiveState, SessionRow } from "../../../protocol";
import { actions, useStore } from "../store";
import { Dot, IconButton, Kbd, Label, Spinner } from "../ui/base";
import { Icon } from "../ui/Icon";
import { ListItem } from "../ui/surfaces";
import { useSessionMenus } from "./menus";
import { ago } from "./time";


/** Board 2, 2a, 2f: projects and their sessions, right-click menus, forked sessions under their parent. */
export function Sidebar() {
  const projects = useStore((s) => s.projects);
  const sessions = useStore((s) => s.sessions);
  const live = useStore((s) => s.live);
  const active = useStore((s) => s.active);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const menus = useSessionMenus();

  const liveByFile = new Map(Object.values(live).map((l) => [l.file, l]));
  const activeFile = active ? live[active]?.file : undefined;
  const shown = sessions;
  const byPath = new Map(sessions.map((s) => [s.path, s]));

  const toggle = (cwd: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(cwd)) next.add(cwd);
      return next;
    });

  const row = (s: SessionRow, depth: number, l?: LiveState) => {
    const forked = depth > 0;
    const parent = s.parent && byPath.get(s.parent);
    return (
      <ListItem
        key={s.path}
        active={s.path === activeFile}
        style={forked ? { paddingLeft: 22 + 22 * depth } : undefined}
        title={l?.streaming ? "pi is working" : parent ? `forked from ${parent.title}` : undefined}
        onClick={() => actions.open(s.cwd, s.path)}
        onContextMenu={(e) => menus.sessionMenu(e, s)}
        meta={l?.streaming ? "now" : forked ? <span className="text-warn">forked</span> : ago(s.modified)}
      >
        {forked ? <span className="text-muted"><Icon name="branch" size={14} /></span> : l?.streaming ? <span className="ml-[22px]"><Spinner label="running" /></span> : <span className="ml-[22px] w-3 shrink-0" />}
        <span className="truncate">{s.title}</span>
      </ListItem>
    );
  };

  return (
    <aside className="flex min-h-0 flex-col gap-3.5 overflow-hidden border-r border-line bg-side px-3 py-3.5">
      <button className="flex h-[34px] shrink-0 items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-base text-muted hover:border-line2 hover:text-sub" onClick={() => actions.setSearching(true)}>
        <Icon name="search" />
        Search sessions
        <span className="ml-auto"><Kbd>⌘K</Kbd></span>
      </button>

      <nav aria-label="Sessions" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto [&>*]:shrink-0">
        {/* Part 7 opens the All sessions screen here. */}
        <ListItem meta={sessions.length} onClick={actions.showAll}>
          <span className="text-muted"><Icon name="list" /></span>All sessions
        </ListItem>
        <div className="flex items-center px-1.5 pt-3 pb-1.5">
          <Label className="flex-1">Projects</Label>
          <IconButton bare size={24} label="Add project" onClick={actions.addProject}><Icon name="plus" /></IconButton>
        </div>

        {projects.map((p) => {
          const rows = shown.filter((s) => s.cwd === p.cwd);
          const open = !collapsed.has(p.cwd);
          const runningHere = rows.some((s) => liveByFile.get(s.path)?.streaming);
          // Forked sessions go under their parent, at any depth, when the parent is in the list.
          const roots = rows.filter((s) => !s.parent || !rows.some((r) => r.path === s.parent));
          const tree = (s: SessionRow, depth: number): ReactNode[] => [
            row(s, depth, liveByFile.get(s.path)),
            // ponytail: depth limit in case session files point at each other; deeper forks are not shown.
            ...(depth < 8 ? rows.filter((c) => c.parent === s.path && c.path !== s.path).flatMap((c) => tree(c, depth + 1)) : []),
          ];
          return [
            <ListItem
              key={p.cwd}
              title={p.cwd}
              aria-expanded={open}
              className={open ? "font-semibold text-fg" : undefined}
              onClick={() => toggle(p.cwd)}
              onContextMenu={(e) => menus.projectMenu(e, p, sessions.filter((s) => s.cwd === p.cwd).length)}
              meta={<>{!open && runningHere && <Dot color="accent" />}{rows.length}</>}
            >
              <Icon name={open ? "chevronDown" : "chevron"} size={14} />
              <span className="text-muted"><Icon name="folder" /></span>
              <span className="truncate">{p.name}</span>
            </ListItem>,
            ...(open ? roots.flatMap((s) => tree(s, 0)) : []),
          ];
        })}

        <ListItem className="text-muted" onClick={actions.addProject}>
          <Icon name="plus" />
          Add project…
        </ListItem>
      </nav>

      <div className="flex items-center gap-2 border-t border-line px-2 pt-2.5 text-xs text-muted">
        <Icon name="box" size={14} />
        <span>Tau 0.1 · pi 0.87</span>
        <span className="flex-1" />
        <span className="text-dim">unofficial</span>
      </div>

      {menus.ui}
    </aside>
  );
}
