import type { BranchCard } from "#protocol";
import { time } from "#renderer/chat/format";
import { cx, Pill, Spinner } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";

/** Board 3: a branch as a card: its name, its first message, what its tools did, and when it last changed. */
export function BranchCardView({ card: c, selected, streaming, onPick, onOpen }: {
  card: BranchCard;
  selected: boolean;
  /** pi works on the current branch now. */
  streaming: boolean;
  onPick: () => void;
  /** A double-click: switch to the branch. */
  onOpen: () => void;
}) {
  const working = c.current && streaming;
  return (
    <button
      onClick={onPick}
      onDoubleClick={onOpen}
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
          {working && <Spinner size={10} />}
          {c.current ? "latest" : "last"} · {time(c.at)}{working ? " · working" : ""}
        </span>
      </div>
    </button>
  );
}
