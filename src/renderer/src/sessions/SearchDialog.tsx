import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "#protocol";
import { folderName } from "#renderer/chat/format";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { cx, Kbd, pill, Spinner } from "#renderer/ui/base";
import { Segmented } from "#renderer/ui/controls";
import { Icon } from "#renderer/ui/Icon";
import { ago } from "./time";

/** Board 1a: ⌘K. Results show the matched text; ↵ opens the session at the match, which stays marked in the chat. */
/** Wait for a short pause in typing before a search. */
const SEARCH_DEBOUNCE_MS = 150;

export function SearchDialog() {
  const projects = useStore((s) => s.projects);
  const live = useStore((s) => s.live);
  const devSearch = useStore((s) => s.devSearch);
  const [query, setQuery] = useState(devSearch ?? "");
  const [cwd, setCwd] = useState<string>();
  const [titlesOnly, setTitlesOnly] = useState<"all" | "titles">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const running = new Set(Object.values(live).filter((l) => l.streaming).map((l) => l.file));

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => before?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let current = true;
    const t = setTimeout(
      () =>
        actions.search(query, titlesOnly === "titles", cwd).then((r) => {
          if (!current) return;
          setResults(r);
          setActive(0);
          setLoading(false);
        }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [query, titlesOnly, cwd]);

  const close = () => actions.setSearching(false);
  const open = (r: SearchResult, at = r.lines[0]?.at) => actions.openAt(r.cwd, r.path, at);
  const matches = results.reduce((n, r) => n + r.total, 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return e.preventDefault(), close();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(results.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      list.current?.children[next]?.scrollIntoView({ block: "nearest" });
    }
    // Enter on a pill, the switch or a match line is that control's own; only the search field opens the highlighted result.
    if (e.key === "Enter" && e.target === input.current && results[active]) open(results[active]);
  };

  return (
    <div className="fixed inset-0 z-20 flex justify-center bg-scrim px-6 pt-[10vh] pb-6" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Search sessions" onKeyDown={onKeyDown} className="flex max-h-[600px] w-[912px] max-w-full flex-col overflow-hidden rounded-2xl border border-line2 bg-panel shadow-modal">
        <div className="flex items-center gap-3 border-b border-line px-[18px] py-3.5">
          <span className="text-muted"><Icon name="search" size={16} /></span>
          <input
            ref={input}
            aria-label="Search titles and messages"
            placeholder="Search titles and messages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xl text-fg outline-none"
          />
          {loading ? <Spinner size={12} label="searching" /> : query.trim() && <span className="text-xs text-muted">{results.length} {results.length === 1 ? "session" : "sessions"} · {matches} {matches === 1 ? "match" : "matches"}</span>}
          <Kbd>esc</Kbd>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-[18px] py-2.5">
          <span className="mr-1 text-sm text-muted">Project</span>
          {[undefined, ...projects.map((p) => p.cwd)].map((c) => (
            <button key={c ?? "all"} aria-pressed={cwd === c} className={pill(cwd === c ? "accent" : "dim", "hover:text-fg")} onClick={() => setCwd(c)}>
              {c ? folderName(c) : "All"}
            </button>
          ))}
          <span className="flex-1" />
          <Segmented label="Search in" value={titlesOnly} onChange={setTitlesOnly} options={[{ value: "all", label: "Titles and messages" }, { value: "titles", label: "Titles only" }]} />
        </div>

        <div ref={list} role="listbox" aria-label="Results" className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto px-2 py-2.5 [&>*]:shrink-0">
          {query.trim() && !loading && results.length === 0 && <div className="p-6 text-center text-muted">No session has “{query}”</div>}
          {results.map((r, i) => (
            <div
              key={r.path}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              className={cx("flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2.5", i === active && "bg-accent-bg shadow-[inset_0_0_0_1px_var(--color-accent-line)]")}
              onClick={() => open(r)}
            >
              <div className="flex items-center gap-2.5">
                {running.has(r.path) ? <Spinner size={11} /> : <span className="w-3" />}
                <b className="truncate font-semibold">{r.title}</b>
                <span className="ml-auto flex shrink-0 items-center gap-2.5 text-xs text-muted">
                  <span className="flex items-center gap-1"><Icon name="folder" size={12} />{folderName(r.cwd)}</span>
                  <span>{ago(r.modified)}</span>
                  <span className={pill(i === active ? "accent" : "dim", "h-5 text-label")}>{r.total} {r.total === 1 ? "match" : "matches"}</span>
                </span>
              </div>
              {r.lines.map((l, j) => (
                <button key={j} className="flex min-w-0 items-center gap-2.5 py-[3px] pl-[30px] text-left text-sm hover:text-fg" onClick={(e) => (e.stopPropagation(), open(r, l.at))}>
                  <b className={cx("w-6 shrink-0 font-semibold", l.who === "you" ? "text-you" : "text-accent")}>{l.who}</b>
                  <span className="truncate text-sub">
                    {l.parts[0]}
                    <mark className="rounded-[3px] bg-accent/30 px-0.5 text-fg">{l.parts[1]}</mark>
                    {l.parts[2]}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3.5 border-t border-line px-[18px] py-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>move</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd>open at the match</span>
          <span>The match stays marked in the chat.</span>
        </div>
      </div>
    </div>
  );
}
