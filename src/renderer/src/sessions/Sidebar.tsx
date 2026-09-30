import { type ReactNode, useState } from "react";
import type { DesignCanvas, LiveState, SessionRow } from "#protocol";
import { actions, useStore } from "#renderer/store";
import { Dot, IconButton, Kbd, Label, Spinner } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { ListItem } from "#renderer/ui/surfaces";
import { useSessionMenus } from "./menus";
import { ago } from "./time";


/** Board 1, 2a, 2f: New session, projects and their sessions, sessions with no project, right-click menus, forked sessions under their parent. */
export function Sidebar() {
  const projects = useStore((s) => s.projects);
  const sessions = useStore((s) => s.sessions);
  const noProject = useStore((s) => s.noProject);
  const live = useStore((s) => s.live);
  const active = useStore((s) => s.active);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const menus = useSessionMenus();

  const liveByFile = new Map(Object.values(live).map((l) => [l.file, l]));
  const activeFile = active ? live[active]?.file : undefined;
  const shown = sessions;
  const byPath = new Map(sessions.map((s) => [s.path, s]));
  const design = useStore((s) => s.design);
  const page = useStore((s) => s.designPage);
  const designRows = (cwd: string, canvases: DesignCanvas[]): ReactNode[] => [
    <ListItem key={`${cwd}#design`} active={page?.cwd === cwd && !page.canvas} onClick={() => actions.openDesign(cwd)} meta={canvases.length}>
      <span className="ml-[22px] text-muted"><Icon name="palette" size={14} /></span>
      <span>Design</span>
    </ListItem>,
    ...canvases.map((c) => (
      <ListItem key={`${cwd}#${c.slug}`} active={page?.cwd === cwd && page.canvas === c.slug} style={{ paddingLeft: 44 }} onClick={() => actions.openDesign(cwd, c.slug)} meta={ago(c.updated)}>
        <span className="truncate">{c.title}</span>
      </ListItem>
    )),
  ];

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
        <ListItem className="mb-0.5 border border-line2 bg-panel font-medium text-fg" meta={<Kbd>⌘N</Kbd>} onClick={actions.newSession}>
          <Icon name="plus" />New session
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
            // Board C1: the project's canvases, from any session.
            ...(open && design[p.cwd]?.canvases.length ? designRows(p.cwd, design[p.cwd].canvases) : []),
          ];
        })}

        <ListItem className="text-muted" onClick={actions.addProject}>
          <Icon name="plus" />
          Add project…
        </ListItem>

        {/* Board 1.1: chats you started with New session. "Add to project" in the chat header moves one to a project. */}
        {sessions.some((s) => s.cwd === noProject) && (
          <>
            <div className="px-1.5 pt-3 pb-1.5"><Label>No project</Label></div>
            {sessions.filter((s) => s.cwd === noProject).map((s) => row(s, 0, liveByFile.get(s.path)))}
          </>
        )}
      </nav>

      <div className="flex items-center gap-2 border-t border-line px-2 pt-2.5 text-xs text-muted">
        <Icon name="box" size={14} />
        <span>Loomden 0.1 · pi 0.87</span>
        <span className="flex-1" />
        <span className="text-dim">unofficial</span>
      </div>

      {menus.ui}
    </aside>
  );
}
