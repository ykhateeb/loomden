import { useState } from "react";
import type { LiveState } from "#protocol";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Segmented } from "#renderer/ui/controls";
import { Button, cx, Kbd } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { Menu, type MenuItem } from "#renderer/ui/Menu";
import { folderName, home, plural } from "./format";

/** Board 2: the session's title, its project (and the picker to move it), the canvas button, and Chat or Tree. */
export function ChatHeader({ sessionKey, state, view, messageCount: count }: { sessionKey: string; state: LiveState; view: "chat" | "tree"; messageCount: number }) {
  const branches = useStore((s) => s.sessions.find((r) => r.path === state.file)?.branches ?? 1);
  const projects = useStore((s) => s.projects);
  const canvasOpen = useStore((s) => !!s.canvas[sessionKey]?.open);
  // Boards C3 and C4: "no canvas yet", or how many the project has.
  const canvasCount = useStore((s) => s.design[state.cwd]?.canvases.length || (s.canvas[sessionKey] ? 1 : 0));
  const inProject = useStore((s) => state.cwd !== s.noProject);
  const [pickerAt, setPickerAt] = useState<{ x: number; y: number }>();

  // Board 1.2: the projects to move this session to.
  const picker: MenuItem[] = [
    { heading: "Projects" },
    ...projects
      .filter((p) => p.cwd !== state.cwd)
      .map((p): MenuItem => ({
        id: p.cwd,
        label: <span className="flex min-w-0 flex-col"><span>{p.name}</span><span className="truncate font-mono text-label opacity-75">{home(p.cwd)}</span></span>,
        icon: <Icon name="folder" />,
        onSelect: () => actions.move(sessionKey, p.cwd),
      })),
    "sep",
    { label: "Open a folder…", icon: <Icon name="plus" />, onSelect: () => actions.moveToFolder(sessionKey) },
    { label: "Clone from a git URL…", icon: <Icon name="download" />, disabled: true, onSelect: () => {} }, // not built yet
    "sep",
    { note: "The chat stays as it is. The session moves under the project, and pi starts working in its folder." },
  ];

  return (
    <div className="flex h-[58px] shrink-0 items-center gap-2.5 border-b border-line px-[22px]">
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <b className="truncate text-lg font-[650]">{state.title}</b>
        <div className="flex items-center gap-2.5 text-xs text-muted">
          <button
            aria-haspopup="menu"
            aria-expanded={!!pickerAt}
            title={inProject ? `${state.cwd} · move to another project` : "Move this session to a project"}
            disabled={state.streaming}
            onMouseDown={(e) => e.stopPropagation()} // else the menu's click-outside closes it and this click opens it again
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPickerAt(pickerAt ? undefined : { x: r.left, y: r.bottom + 6 });
            }}
            className={cx(
              "-ml-[5px] flex h-[22px] items-center gap-1 rounded-sm whitespace-nowrap pr-[7px] pl-[5px] font-medium disabled:opacity-50",
              inProject ? "text-sub enabled:hover:bg-hover" : "bg-accent-bg text-accent2 shadow-[inset_0_0_0_1px_var(--color-accent-line)]",
            )}
          >
            <Icon name={inProject ? "folder" : "plus"} size={13} />
            {inProject ? folderName(state.cwd) : "Add to project"}
            <Icon name="chevronDown" size={12} />
          </button>
          {state.branch && <span className="flex items-center gap-1"><Icon name="branch" size={13} />{state.branch}</span>}
          <span className="whitespace-nowrap">{count} messages</span>
          <span className="whitespace-nowrap">{canvasCount ? plural(canvasCount, "canvas", "canvases") : "no canvas yet"}</span>
        </div>
      </div>
      <Button small variant={canvasOpen ? "primary" : "default"} aria-pressed={canvasOpen} title="Design canvas (⇧C)" onClick={() => actions.toggleCanvas(sessionKey)}>
        {canvasCount ? "Canvas" : "+ Canvas"}<Kbd onFill={canvasOpen}>⇧C</Kbd>
      </Button>
      <Segmented
        label="View"
        value={view}
        onChange={(v) => actions.setView(sessionKey, v)}
        options={[{ value: "chat", label: "Chat" }, { value: "tree", label: <span title="Session tree (T)">Tree <span className="text-muted">{branches}</span></span> }]}
      />
      {pickerAt && <Menu at={pickerAt} width={380} label="Add to project" items={picker} onClose={() => setPickerAt(undefined)} />}
    </div>
  );
}
