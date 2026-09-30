import type { SlashCommand } from "#protocol";
import { cx, pill, type PillTone } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";

export type Row = { value: string; label: string; description?: string; source?: SlashCommand["source"] };

const tones: Record<SlashCommand["source"], PillTone> = { extension: "orange", prompt: "ok", skill: "violet" };

/**
 * Board 2c: the list over the message box for / commands and @ files.
 * The textarea keeps focus and sends the keys (↑ ↓ tab ↵ esc); this only shows the list.
 */
export function CommandMenu({ id, title, rows, active, onPick, onHover }: { id: string; title: string; rows: Row[]; active: number; onPick: (row: Row) => void; onHover: (i: number) => void }) {
  return (
    <div className="absolute inset-x-0 bottom-full z-30 mb-2 flex flex-col gap-px rounded-xl border border-line2 bg-raised p-1.5 shadow-menu">
      <div className="flex items-center px-2.5 pt-1 pb-1.5">
        <span className="text-label font-semibold tracking-[0.6px] text-muted uppercase">{title}</span>
        <span className="ml-auto text-xs text-muted">{rows.length} · type to filter</span>
      </div>
      <div id={id} role="listbox" aria-label={title} className="flex max-h-72 flex-col gap-px overflow-auto">
        {rows.length === 0 && <div className="px-2.5 py-[7px] text-base text-dim">No match</div>}
        {rows.map((r, i) => (
          <div
            key={r.value}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => (e.preventDefault(), onPick(r))} // mousedown: the textarea keeps focus
            onMouseEnter={() => onHover(i)}
            className={cx("flex cursor-pointer items-center gap-3.5 rounded-sm px-2.5 py-[7px] text-base", i === active ? "bg-accent text-ink" : "text-fg")}
          >
            {!r.source && <Icon name="file" size={14} />}
            <span className={cx("shrink-0 truncate font-mono text-sm font-semibold", r.source ? "w-[150px]" : "min-w-0 flex-1")}>{r.label}</span>
            {r.description && <span className={cx("min-w-0 flex-1 truncate", i === active ? "text-ink" : "text-sub")}>{r.description}</span>}
            {r.source && <span className={pill(tones[r.source], cx("ml-auto h-5 text-label", i === active && "bg-ink/20 text-ink"))}>{r.source}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
