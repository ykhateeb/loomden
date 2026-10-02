import { useEffect, useRef, useState } from "react";
import type { BranchCard, LiveState, PreviewRow, SessionTree } from "#protocol";
import { time } from "#renderer/chat/format";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button, cx, Kbd, Pill, Spinner } from "#renderer/ui/base";
import { Checkbox, Segmented } from "#renderer/ui/controls";
import { Icon } from "#renderer/ui/Icon";
import { LabelDialog } from "./LabelDialog";

type Filter = "all" | "mine" | "labeled" | "notools";
type Pick = { kind: "row"; row: PreviewRow } | { kind: "card"; card: BranchCard };

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "labeled", label: "Labeled" },
  { value: "notools", label: "No tools" },
];
const entryId = (row: PreviewRow) => row.id.replace(/:tool$/, "");

/** Board 3: pick a message, then continue from it on a new branch — or switch to another branch. */
export function TreeView({ sessionKey, state }: { sessionKey: string; state: LiveState }) {
  const messages = useStore((s) => s.messages[sessionKey]);
  const [tree, setTree] = useState<SessionTree>();
  const [filter, setFilter] = useState<Filter>("all");
  const [pick, setPick] = useState<Pick>();
  const [summarize, setSummarize] = useState(true);
  const [labeling, setLabeling] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // The tree changes with every new message, a switch, a fork, and a label: fetch it again then.
  const stamp = useStore((s) => s.treeStamp);
  useEffect(() => {
    actions.tree(sessionKey).then((t) => t && setTree(t));
  }, [sessionKey, messages?.length, stamp]);
  useEffect(() => box.current?.focus(), []);

  if (!tree) return <div className="flex flex-1 items-center justify-center gap-2 text-muted"><Spinner />Reading the tree…</div>;

  const rows = tree.rows.filter((r) => (filter === "mine" ? r.kind === "you" : filter === "labeled" ? !!r.label : filter === "notools" ? !r.tool : true));
  const cards = (id: string) => tree.branchesAt[id] ?? [];
  const current = tree.last !== undefined ? cards(tree.last).find((c) => c.current) : undefined;
  const leaving = current?.name ?? "this branch";

  // What each action does with the pick.
  const target = pick?.kind === "card" ? pick.card.leafId : pick && entryId(pick.row);
  // pi forks from a message you wrote: the row itself, or the first one on the card's branch.
  const forkId = pick?.kind === "card" ? pick.card.forkId : pick?.kind === "row" && pick.row.kind === "you" ? entryId(pick.row) : undefined;
  const forkable = !!forkId;
  const labelId = pick?.kind === "card" ? pick.card.id : pick && entryId(pick.row);
  // pi's point can be on an entry with no row (a label, a model change): compare with its row.
  const isHere = pick?.kind === "card" ? pick.card.current && pick.card.leafId === tree.leafId : !!pick && entryId(pick.row) === tree.here;
  const busy = state.streaming || state.compacting;

  const switchTo = async () => {
    if (!target || isHere || busy) return;
    await actions.navigate(sessionKey, target, summarize && pick?.kind === "card" && !pick.card.current);
  };
  const fork = (at: boolean) => {
    const id = at ? target : forkId;
    if (id && !busy) actions.fork(sessionKey, id, at);
  };
  const labels = [...new Set([...tree.rows.map((r) => r.label), ...Object.values(tree.branchesAt).flat().map((c) => c.name)].filter((l): l is string => !!l))];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey || !pick) return;
    const k = e.key.toLowerCase();
    if (k === "enter") (e.preventDefault(), switchTo());
    if (k === "l") (e.preventDefault(), setLabeling(true));
    if (k === "c") (e.preventDefault(), fork(true));
    if (k === "f") (e.preventDefault(), fork(false));
  };

  const card = (c: BranchCard) => {
    const selected = pick?.kind === "card" && pick.card.id === c.id;
    return (
      <button
        key={c.id}
        onClick={() => setPick({ kind: "card", card: c })}
        onDoubleClick={() => (setPick({ kind: "card", card: c }), !c.current && actions.navigate(sessionKey, c.leafId, false))}
        className={cx(
          "flex w-[min(380px,calc(50%-7px))] min-w-[240px] flex-col rounded-xl border bg-panel text-left",
          c.current && "border-accent-line bg-[linear-gradient(180deg,rgba(122,168,216,.08),var(--color-panel)_70%)]",
          selected ? "border-warn-line shadow-[0_0_0_3px_var(--color-warn-bg)]" : !c.current && "border-line hover:border-line2",
        )}
      >
        <div className="flex w-full items-center gap-2 px-3.5 pt-3 text-base font-semibold">
          <span className="text-muted"><Icon name="branch" size={14} /></span>
          <span className="truncate">{c.name}</span>
          {c.current && <Pill tone="accent" className="ml-auto h-5 text-label">you are here</Pill>}
          {selected && !c.current && <Pill tone="warn" className="ml-auto h-5 text-label">selected</Pill>}
        </div>
        <div className="flex w-full flex-col gap-1.5 px-3.5 pt-2.5 pb-3.5 text-sm">
          <span className="truncate text-sub">{c.first}</span>
          {c.tools.length > 0 && (
            <span className="truncate text-muted">
              {c.tools.map((t, i) => (
                <span key={t.tool}>
                  {i > 0 && " · "}
                  <span className="font-mono text-meta font-semibold text-orange">{t.tool}</span> {t.files.length ? t.files.slice(0, 2).join(", ") : `${t.count}×`}
                  {t.added + t.removed > 0 && <> <span className="text-ok">+{t.added}</span> <span className="text-danger">−{t.removed}</span></>}
                  {t.failed > 0 && <span className="text-danger"> ✗ {t.failed} failed</span>}
                </span>
              ))}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-muted">
            {c.current && state.streaming && <Spinner size={10} />}
            {c.current ? "latest" : "last"} · {time(c.at)}{c.current && state.streaming ? " · working" : ""}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div ref={box} tabIndex={-1} onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col outline-none">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-[22px] pt-[18px]">
        <div className="flex items-center gap-2">
          <span className="text-sub">Pick a message, then continue from it on a new branch.</span>
          <span className="flex-1" />
          <Segmented label="Show" value={filter} options={FILTERS} onChange={setFilter} />
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-auto pb-4 [&>*]:shrink-0">
          {/* Branches that start before the first message (you continued from the first one). */}
          {cards("").length > 0 && <div className="flex flex-wrap gap-3.5 pb-3 pl-[34px]">{cards("").map(card)}</div>}
          {rows.map((r) => {
            const selected = pick?.kind === "row" && pick.row.id === r.id;
            const here = entryId(r) === tree.here;
            return (
              <div key={r.id} className="flex flex-col">
                <button
                  onClick={() => setPick({ kind: "row", row: r })}
                  className={cx("relative flex h-10 items-center gap-2.5 rounded-md pr-2.5 pl-[34px] text-left", selected ? "bg-accent-bg" : "hover:bg-hover")}
                >
                  <span className="absolute top-0 bottom-0 left-[14px] w-0.5 bg-line2" />
                  <span
                    className={cx("absolute left-[10px] size-2.5 rounded-full", here ? "bg-accent shadow-[0_0_0_3px_var(--color-accent-bg)]" : r.branchPoint ? "bg-warn" : "bg-muted")}
                  />
                  <Pill tone={r.kind === "you" ? "orange" : "accent"} className={cx("h-5 px-2 text-label font-semibold", r.kind === "you" && "bg-you-bg text-you")}>
                    {r.kind === "you" ? "you" : r.kind === "pi" ? "pi" : r.kind === "compacted" ? "compacted" : "summary"}
                  </Pill>
                  <span className={cx("min-w-0 truncate", r.branchPoint ? "text-fg" : "text-sub")}>
                    {r.tool && <span className="mr-1.5 font-mono text-meta font-semibold text-orange">{r.tool}</span>}
                    {r.text}
                  </span>
                  {r.label && <Pill tone="orange" className="h-5 text-label"><Icon name="flag" size={11} />{r.label}</Pill>}
                  {r.branchPoint && <Pill tone="warn" className="h-5 text-label"><Icon name="branch" size={11} />branch point</Pill>}
                  {here && <Pill tone="accent" className="h-5 text-label">you are here</Pill>}
                  <span className="ml-auto shrink-0 text-xs text-muted">{r.at ? time(r.at) : ""}</span>
                </button>
                {/* The branches that continue from here. */}
                {cards(entryId(r)).length > 0 && (
                  <div className="flex flex-wrap gap-3.5 py-3 pl-[34px]">
                    {cards(entryId(r)).map(card)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-[22px] pt-3.5 pb-[18px]">
        <div className="flex flex-col gap-3 rounded-xl border border-line2 bg-panel p-3.5 shadow-[0_8px_24px_rgba(0,0,0,.25)]">
          <div className="flex items-center gap-2">
            <span className="text-muted">Selected</span>
            <b className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
              {pick ? (pick.kind === "card" ? <><Icon name="branch" size={14} />{pick.card.name}</> : pick.row.text) : <span className="font-normal text-dim">pick a message or a branch</span>}
            </b>
            <span className="flex-1" />
            <Button variant="ghost" disabled={!labelId} onClick={() => setLabeling(true)}><Icon name="tag" size={14} />Label<Kbd>L</Kbd></Button>
            <Button variant="ghost" disabled={!target || busy} title="A new session with the history through this point" onClick={() => fork(true)}><Icon name="copy" size={14} />Clone<Kbd>C</Kbd></Button>
            <Button variant="ghost" disabled={!forkable || busy} title={forkable ? "A new session with the history before this message" : "Fork works from a message you wrote"} onClick={() => fork(false)}>
              <Icon name="branch" size={14} />Fork<Kbd>F</Kbd>
            </Button>
            <Button variant="primary" disabled={!target || isHere || busy} title={busy ? "Wait for pi to finish" : undefined} onClick={switchTo}>
              {pick?.kind === "row" ? "Continue from here" : "Switch to branch"}<Kbd onFill>↵</Kbd>
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox label="Summarize the branch you leave" on={summarize} onChange={setSummarize} />
            <span>Summarize <b className="font-semibold">{leaving}</b> when you leave it</span>
            <span className="text-muted">so pi keeps what it learned there</span>
          </label>
        </div>
      </div>

      {labeling && labelId && pick && (
        <LabelDialog
          point={pick.kind === "card" ? { name: pick.card.name, time: time(pick.card.at), text: pick.card.first } : { name: pick.row.kind === "you" ? "you" : "pi", time: pick.row.at ? time(pick.row.at) : "", text: pick.row.text }}
          current={pick.kind === "row" ? pick.row.label : pick.card.label}
          others={labels}
          onSave={(label) => actions.label(sessionKey, labelId, label)}
          onClose={() => {
            setLabeling(false);
            box.current?.focus();
          }}
        />
      )}
    </div>
  );
}
