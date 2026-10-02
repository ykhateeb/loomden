import { useEffect, useRef, useState } from "react";
import type { BranchCard, LiveState, PreviewRow, SessionTree } from "#protocol";
import { time } from "#renderer/chat/format";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button, cx, Kbd, Pill, Spinner } from "#renderer/ui/base";
import { Checkbox, Segmented } from "#renderer/ui/controls";
import { Icon } from "#renderer/ui/Icon";
import { BranchCardView } from "./BranchCardView";
import { LabelDialog } from "./LabelDialog";
import { entryId, type Picked, pickTargets } from "./pick";
import { hasModifier, isTyping } from "#renderer/ui/keys";

type Filter = "all" | "mine" | "labeled" | "notools";
/** The rows each filter shows. */
const SHOWS: Record<Filter, (r: PreviewRow) => boolean> = { all: () => true, mine: (r) => r.kind === "you", labeled: (r) => !!r.label, notools: (r) => !r.tool };

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "labeled", label: "Labeled" },
  { value: "notools", label: "No tools" },
];

/** Board 3: pick a message, then continue from it on a new branch — or switch to another branch. */
export function TreeView({ sessionKey, state }: { sessionKey: string; state: LiveState }) {
  const messages = useStore((s) => s.messages[sessionKey]);
  const [tree, setTree] = useState<SessionTree>();
  const [filter, setFilter] = useState<Filter>("all");
  const [pick, setPick] = useState<Picked>();
  const [summarize, setSummarize] = useState(true);
  const [labeling, setLabeling] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // The tree changes with every new message, a switch, a fork, and a label: fetch it again then.
  const stamp = useStore((s) => s.treeStamp);
  useEffect(() => {
    actions.loadTree(sessionKey).then((t) => t && setTree(t));
  }, [sessionKey, messages?.length, stamp]);
  useEffect(() => box.current?.focus(), []);

  if (!tree) return <div className="flex flex-1 items-center justify-center gap-2 text-muted"><Spinner />Reading the tree…</div>;

  const rows = tree.rows.filter(SHOWS[filter]);
  const cards = (id: string) => tree.branchesAt[id] ?? [];
  const current = tree.last !== undefined ? cards(tree.last).find((c) => c.current) : undefined;
  const leaving = current?.name ?? "this branch";

  const { target, forkId, labelId, isHere, leavesBranch } = pickTargets(pick, tree);
  const forkable = !!forkId;
  const busy = state.streaming || state.compacting;

  const switchTo = async () => {
    if (!target || isHere || busy) return;
    await actions.navigate(sessionKey, target, summarize && leavesBranch);
  };
  const forkHere = () => {
    if (forkId && !busy) actions.fork(sessionKey, forkId);
  };
  const cloneHere = () => {
    if (target && !busy) actions.cloneAt(sessionKey, target);
  };
  const labels = [...new Set([...tree.rows.map((r) => r.label), ...Object.values(tree.branchesAt).flat().map((c) => c.name)].filter((l): l is string => !!l))];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTyping(e.target) || hasModifier(e) || !pick) return;
    const keyActions: Record<string, () => unknown> = { enter: switchTo, l: () => setLabeling(true), c: cloneHere, f: forkHere };
    const run = keyActions[e.key.toLowerCase()];
    if (!run) return;
    e.preventDefault();
    run();
  };

  const card = (c: BranchCard) => (
    <BranchCardView
      key={c.id}
      card={c}
      selected={pick?.kind === "card" && pick.card.id === c.id}
      streaming={state.streaming}
      onPick={() => setPick({ kind: "card", card: c })}
      onOpen={() => {
        setPick({ kind: "card", card: c });
        if (!c.current) actions.navigate(sessionKey, c.leafId, false);
      }}
    />
  );

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
                    {r.kind}
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
            <Button variant="ghost" disabled={!target || busy} title="A new session with the history through this point" onClick={cloneHere}><Icon name="copy" size={14} />Clone<Kbd>C</Kbd></Button>
            <Button variant="ghost" disabled={!forkable || busy} title={forkable ? "A new session with the history before this message" : "Fork works from a message you wrote"} onClick={forkHere}>
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
          onSave={(label) => actions.setLabel(sessionKey, labelId, label)}
          onClose={() => {
            setLabeling(false);
            box.current?.focus();
          }}
        />
      )}
    </div>
  );
}
