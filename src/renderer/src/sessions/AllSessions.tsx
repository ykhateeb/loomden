import { useEffect, useMemo, useRef, useState } from "react";
import type { PreviewRow, SessionRow } from "../../../protocol";
import { actions, useStore } from "../store";
import { Button, cx, Dot, IconButton, Kbd, Label, pill, Pill, Spinner } from "../ui/base";
import { Segmented } from "../ui/controls";
import { SearchInput } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Card, Table, Td, Th, Tr } from "../ui/surfaces";
import { useSessionMenus } from "./menus";
import { ago, groupOf } from "./time";

type Filter = "all" | "mine" | "labeled" | "notools";
const GROUPS = ["Today", "Yesterday", "This week", "Older"];
const typing = (e: React.KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

/** Board 1: every session in every project. Pick one to see it on the right; ↵ resumes it. */
export function AllSessions() {
  const sessions = useStore((s) => s.sessions);
  const projects = useStore((s) => s.projects);
  const live = useStore((s) => s.live);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const menus = useSessionMenus();
  const table = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => screen.current?.focus(), []); // so ↑ ↓ ↵ N O work at once

  const running = new Set(Object.values(live).filter((l) => l.streaming).map((l) => l.file));
  const q = query.toLowerCase();
  const shown = useMemo(
    () => sessions.filter((s) => (!project || s.cwd === project) && (!q || s.title.toLowerCase().includes(q) || s.text.toLowerCase().includes(q))),
    [sessions, project, q],
  );
  const current = shown.find((s) => s.path === selected) ?? shown[0];
  const projectName = (cwd: string) => cwd.split("/").pop() ?? cwd;

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Only keys pressed on the screen itself or on a session title: not in a dialog, a menu, a field or another button.
    const from = e.target as HTMLElement;
    if (from !== e.currentTarget && !from.hasAttribute("data-row")) return;
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = current ? shown.indexOf(current) : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = shown[Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) setSelected(next.path);
      table.current?.querySelector(`[data-path="${CSS.escape(next?.path ?? "")}"]`)?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter" && current) actions.open(current.cwd, current.path);
    if (e.key.toLowerCase() === "n") newSession();
    if (e.key.toLowerCase() === "o") actions.addProject();
  };

  // A new session goes in the picked project, else in the project of the picked session.
  const newCwd = project ?? current?.cwd ?? projects[0]?.cwd;
  const newSession = () => newCwd && actions.open(newCwd);

  return (
    <div ref={screen} tabIndex={-1} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_440px] outline-none" onKeyDown={onKeyDown}>
      <main className="flex min-h-0 flex-col gap-4 px-[26px] pt-[22px]">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[22px] font-[650]">All sessions</h1>
            <span className="text-muted">{sessions.length} sessions · {projects.length} projects</span>
          </div>
          <span className="flex-1" />
          <Button variant="ghost" onClick={actions.addProject}><Icon name="folder" size={14} />Add project<Kbd>O</Kbd></Button>
          <Button variant="primary" disabled={!newCwd} title={newCwd ? `New session in ${projectName(newCwd)}` : "Add a project first"} onClick={newSession}>
            <Icon name="plus" size={14} />New session<Kbd onFill>N</Kbd>
          </Button>
        </div>

        {/* This box filters the table; ⌘K opens the search with the matched text (board 1a). */}
        <SearchInput className="h-10" icon={<Icon name="search" />} hint={<Kbd>⌘K</Kbd>} aria-label="Search session titles and message text" placeholder="Search session titles and message text…" value={query} onChange={(e) => setQuery(e.target.value)} />

        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Project">
          <span className="mr-1 text-muted">Project</span>
          {[undefined, ...projects.map((p) => p.cwd)].map((cwd) => (
            <button key={cwd ?? "all"} role="radio" aria-checked={project === cwd} className={pill(project === cwd ? "accent" : "dim", "hover:text-fg")} onClick={() => setProject(cwd)}>
              {cwd ? projectName(cwd) : "All"}
            </button>
          ))}
        </div>

        <div ref={table} className="min-h-0 flex-1 overflow-auto pb-5">
          <Card className="overflow-hidden">
            {shown.length === 0 && <div className="p-6 text-center text-muted">{sessions.length ? "No session matches" : "No sessions yet. Add a project, then start a session."}</div>}
            {GROUPS.map((g) => {
              const rows = shown.filter((s) => groupOf(s.modified) === g);
              if (!rows.length) return null;
              return (
                <section key={g}>
                  <Label className="block px-4 pt-3 pb-1">{g}</Label>
                  <Table fixed>
                    <thead>
                      <tr><Th width="40%">Session</Th><Th width="18%">Project</Th><Th width="21%">Model</Th><Th width="9%" right>Msgs</Th><Th width="12%" right>Updated</Th></tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <Row key={s.path} s={s} selected={s === current} running={running.has(s.path)} onSelect={() => setSelected(s.path)} onMenu={(e) => menus.sessionMenu(e, s)} />
                      ))}
                    </tbody>
                  </Table>
                </section>
              );
            })}
          </Card>
        </div>
      </main>
      {current ? <Preview s={current} onMore={(e) => menus.sessionMenu(e, current, { x: e.currentTarget.getBoundingClientRect().right - 230, y: e.currentTarget.getBoundingClientRect().bottom + 4 })} /> : <aside className="border-l border-line bg-side" />}
      {menus.ui}
    </div>
  );
}

function Row({ s, selected, running, onSelect, onMenu }: { s: SessionRow; selected: boolean; running: boolean; onSelect: () => void; onMenu: (e: React.MouseEvent) => void }) {
  return (
    <Tr selected={selected} onClick={onSelect}>
      <Td className="whitespace-normal">
        <div className="flex min-w-0 items-center gap-2" data-path={s.path} onContextMenu={onMenu}>
          {running ? <Spinner size={11} label="running" /> : s.parent ? <span className="text-muted"><Icon name="branch" size={13} /></span> : <span className="w-3 shrink-0" />}
          <button data-row className={cx("truncate text-left text-fg", selected ? "font-semibold" : "font-medium")} onClick={onSelect} onDoubleClick={() => actions.open(s.cwd, s.path)}>
            {s.title}
          </button>
          {s.branches > 1 && <Pill tone="dim" className="h-5 text-label">{s.branches} branches</Pill>}
          {s.parent && <Pill tone="warn" className="h-5 text-label">forked</Pill>}
        </div>
      </Td>
      <Td><span className="flex items-center gap-1.5 truncate"><Icon name="folder" size={13} />{s.cwd.split("/").pop()}</span></Td>
      <Td className="truncate font-mono text-xs">{s.model ?? "—"}</Td>
      <Td right>{s.messageCount}</Td>
      <Td right className="text-muted">{ago(s.modified)}</Td>
    </Tr>
  );
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "labeled", label: "Labeled" },
  { value: "notools", label: "No tools" },
];

/** Board 1, right: a short view of the session's current branch, and how to continue it. */
function Preview({ s, onMore }: { s: SessionRow; onMore: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const [rows, setRows] = useState<PreviewRow[]>();
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);
  const command = `pi --session "${s.path}"`;

  useEffect(() => {
    let current = true;
    setRows(undefined);
    const t = setTimeout(() => actions.preview(s.path).then((r) => current && setRows(r)), 80); // arrow keys move fast
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [s]); // a new row object comes with each list refresh (labels and names change without a new message)

  const shown = (rows ?? []).filter((r) => (filter === "mine" ? r.kind === "you" : filter === "labeled" ? !!r.label : filter === "notools" ? !r.tool : true));

  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-side">
      <div className="flex flex-col gap-1 border-b border-line px-[18px] pt-[18px] pb-3.5">
        <div className="flex items-center gap-2">
          <b className="truncate text-lg font-[650]">{s.title}</b>
          <span className="flex-1" />
          <IconButton bare size={28} label="More actions" onClick={onMore}><Icon name="more" /></IconButton>
        </div>
        <div className="flex items-center gap-2.5 text-xs text-muted">
          <span className="flex items-center gap-1"><Icon name="folder" size={12} />{s.cwd.split("/").pop()}</span>
          {s.branches > 1 && <span>{s.branches} branches</span>}
          <span>{s.messageCount} messages</span>
          {s.model && <span>{s.model}</span>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-[18px] py-3.5">
        <div className="mb-2 self-start"><Segmented label="Show" value={filter} options={FILTERS} onChange={setFilter} /></div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto [&>*]:shrink-0">
          {!rows && <span className="flex items-center gap-2 text-sm text-muted"><Spinner size={11} />Reading the session…</span>}
          {rows && shown.length === 0 && <span className="text-sm text-muted">Nothing to show</span>}
          {shown.map((r) =>
            r.kind === "compacted" || r.kind === "summary" ? (
              <div key={r.id} className="flex min-h-6 items-center gap-2 rounded-sm bg-raised px-2 py-0.5 text-xs text-muted">
                <Icon name={r.kind === "compacted" ? "list" : "branch"} size={12} />
                <span className="truncate">{r.text}</span>
                <span className="ml-auto shrink-0">{r.at ? ago(r.at) : ""}</span>
              </div>
            ) : (
              <div key={r.id} className="flex min-h-6 items-center gap-2 text-sm">
                <Dot color={r.branchPoint ? "warn" : "muted"} />
                <b className={cx("w-[26px] shrink-0 font-semibold", r.kind === "you" ? "text-you" : "text-accent")}>{r.kind === "you" ? "you" : "pi"}</b>
                <span className="min-w-0 truncate text-sub">
                  {r.tool && <span className="mr-1.5 font-mono text-meta font-semibold text-orange">{r.tool}</span>}
                  {r.text}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5 text-meta">
                  {r.label && <span className="flex items-center gap-1 text-orange"><Icon name="flag" size={11} />{r.label}</span>}
                  {r.branchPoint && <span className="text-warn">branch point</span>}
                </span>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line px-[18px] py-3.5">
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => actions.open(s.cwd, s.path)}>Resume<Kbd onFill>↵</Kbd></Button>
          <Button title="Open the session tree to pick the point" onClick={() => actions.openTree(s.cwd, s.path)}><Icon name="branch" size={14} />Fork from here</Button>
          <Button onClick={() => actions.clone(s.cwd, s.path)}><Icon name="copy" size={14} />Clone</Button>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-line bg-code py-1.5 pr-1.5 pl-3 font-mono text-xs text-sub">
          <span className="text-muted">$</span>
          <span className="min-w-0 flex-1 truncate" title={command}>{command}</span>
          <Button
            small
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => navigator.clipboard.writeText(command).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </aside>
  );
}
