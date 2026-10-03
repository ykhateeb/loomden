import type { LiveState } from "#protocol";
import { IconButton, Pill } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";

/** Board 2: the messages that wait for the end of the run. The first row takes them all back to edit. */
export function QueueList({ queued, onTakeBack }: { queued: LiveState["queued"]; onTakeBack: () => void }) {
  return queued.map((m, i) => (
    <div key={i} className="flex items-center gap-2 px-3 pt-2.5">
      <Pill tone="warn" className="h-[22px]">Queued</Pill>
      <span className="min-w-0 flex-1 truncate text-sm text-sub">{m.text || `${m.images.length} image(s)`}</span>
      {i === 0 && (
        <IconButton bare size={24} label="Take the queued messages back to edit them" onClick={onTakeBack}>
          <Icon name="x" size={14} />
        </IconButton>
      )}
    </div>
  ));
}
