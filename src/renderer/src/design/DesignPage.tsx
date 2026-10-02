import { useEffect, useState } from "react";
import type { DesignCanvas } from "#protocol";
import { folderName } from "#renderer/chat/format";
import { ago } from "#renderer/sessions/time";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { Segmented } from "#renderer/ui/controls";

const STATUS = {
  draft: { label: "draft", cls: "bg-raised text-sub" },
  review: { label: "in review", cls: "bg-warn-bg text-warn" },
  approved: { label: "approved", cls: "bg-ok-bg text-ok" },
} as const;

const FILTERS = [["all", "All"], ["draft", "Drafts"], ["review", "In review"], ["approved", "Approved"]] as const;

function Chip({ status }: { status: DesignCanvas["status"] }) {
  return <span className={`rounded-full px-2 py-px text-label font-medium ${STATUS[status].cls}`}>{STATUS[status].label}</span>;
}

/** The address of a canvas page, for an iframe. The session in this project (if any) gets the notes. */
function useCanvasUrl(cwd: string, canvas: string | undefined, tab?: "ds") {
  const key = useStore((s) => Object.values(s.live).find((l) => l.cwd === cwd)?.key);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    setUrl(undefined);
    if (canvas)
      actions.startDesign(cwd, key)
        .then(() => actions.designUrl(cwd, canvas, tab))
        .then(setUrl)
        .catch(() => {});
  }, [cwd, canvas, key, tab]);
  return url;
}

/** Board C1 (Canvases) and C2 (Design system): every canvas of a project, from any session. */
export function DesignPage({ cwd, canvas, tab }: { cwd: string; canvas?: string; tab: "canvases" | "system" }) {
  const project = useStore((s) => s.projects.find((p) => p.cwd === cwd));
  const data = useStore((s) => s.design[cwd]);
  const canvases = data?.canvases ?? [];
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [find, setFind] = useState("");
  const [opened, setOpened] = useState<string>();
  const selected = canvases.find((c) => c.slug === canvas) ?? canvases[0];
  const shown = canvases.filter((c) => (filter === "all" || c.status === filter) && c.title.toLowerCase().includes(find.toLowerCase()));
  const count = (f: string) => (f === "all" ? canvases.length : canvases.filter((c) => c.status === f).length);
  const openedUrl = useCanvasUrl(cwd, opened, undefined);
  const systemUrl = useCanvasUrl(cwd, tab === "system" ? canvases[0]?.slug : undefined, "ds");

  useEffect(() => setOpened(undefined), [cwd, canvas, tab]);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg" style={{ gridColumn: "2 / -1" }}>
      <div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-line px-[22px]">
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <b className="truncate text-lg font-[650]">Design · {project?.name ?? folderName(cwd)}</b>
          <span className="truncate text-xs text-muted"><span className="font-mono">.tenon/canvases/</span> · every canvas in the project, from any session</span>
        </div>
        <Segmented
          label="Design page"
          value={tab}
          onChange={(t) => actions.openDesign(cwd, canvas, t)}
          options={[{ value: "canvases", label: <>Canvases <span className="text-muted">{canvases.length}</span></> }, { value: "system", label: "Design system" }]}
        />
        <Button small variant="primary" title="Start a session in this project, then ask pi to design a screen" onClick={() => actions.open(cwd)}>
          <Icon name="plus" />New canvas
        </Button>
      </div>

      {tab === "system" ? (
        systemUrl ? <iframe title="Design system" src={systemUrl} className="min-h-0 flex-1 border-0" />
          : <p className="p-[22px] text-muted">{canvases.length ? "Loading…" : "No canvas yet, so no page to show the design system in. Ask pi in a session to design a screen, or to update the design system from code."}</p>
      ) : opened ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
            <Button small onClick={() => setOpened(undefined)}><Icon name="arrowLeft" />Canvases</Button>
            <span className="text-sub">{canvases.find((c) => c.slug === opened)?.title}</span>
          </div>
          {openedUrl && <iframe title="Design canvas" src={openedUrl} className="min-h-0 flex-1 border-0" />}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label="Canvases" className="flex min-h-0 flex-col gap-3 overflow-auto p-[22px]">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map(([f, label]) => (
                <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-md border px-2.5 py-1 text-sm ${filter === f ? "border-accent-line bg-accent-bg text-fg" : "border-line text-sub hover:text-fg"}`}>
                  {label} <span className="text-muted">{count(f)}</span>
                </button>
              ))}
              <input aria-label="Find a canvas" placeholder="Find a canvas" value={find} onChange={(e) => setFind(e.target.value)} className="ml-auto h-[30px] rounded-md border border-line bg-field px-2.5 text-sm text-fg placeholder:text-dim" />
            </div>
            {!canvases.length && <p className="text-muted">No canvas in this project yet. Ask pi in a session to design a screen.</p>}
            {shown.map((c) => (
              <button key={c.slug} aria-pressed={selected?.slug === c.slug} onClick={() => actions.openDesign(cwd, c.slug)} className={`flex flex-col gap-1 rounded-xl border p-3.5 text-left ${selected?.slug === c.slug ? "border-accent-line bg-accent-bg" : "border-line bg-panel hover:border-line2"}`}>
                <span className="flex items-center gap-2"><b className="font-[650]">{c.title}</b><Chip status={c.status} /></span>
                <span className="text-sm text-muted">{c.boards.length} board{c.boards.length === 1 ? "" : "s"} · updated {c.updated ? ago(c.updated) : "never"}{c.openNotes ? ` · ${c.openNotes} open note${c.openNotes === 1 ? "" : "s"}` : ""}</span>
              </button>
            ))}
            <p className="text-xs text-muted">A canvas belongs to the project. Any session can open it.</p>
          </section>

          <aside aria-label="Canvas details" className="flex min-h-0 flex-col gap-3 overflow-auto border-l border-line bg-side p-4">
            {selected ? (
              <>
                <div className="flex items-center gap-2"><b className="text-lg font-[650]">{selected.title}</b><Chip status={selected.status} /></div>
                <span className="font-mono text-xs text-muted">.tenon/canvases/{selected.slug}/</span>
                <ul className="flex flex-col gap-1.5">
                  {selected.boards.map((b) => (
                    <li key={b.title} className="flex items-center justify-between rounded-md border border-line px-2.5 py-1.5">
                      <span>{b.title} <span className="text-muted">rev {b.rev}</span></span>
                      <span className={b.approved === b.rev ? "text-ok" : b.approved ? "text-warn" : "text-danger"}>{b.approved === b.rev ? "approved" : b.approved ? "changed since approval" : "needs review"}</span>
                    </li>
                  ))}
                </ul>
                <Button variant="primary" onClick={() => setOpened(selected.slug)}>Open canvas</Button>
                <div className="rounded-xl border border-line bg-panel p-3">
                  <b className="text-sm font-[650]">Where it is saved</b>
                  <p className="mt-1.5 text-sm"><span className="text-ok">In git</span> · canvas.json · {selected.boards.length} board{selected.boards.length === 1 ? "" : "s"} · {selected.images} image{selected.images === 1 ? "" : "s"}</p>
                  <p className="text-sm"><span className="text-warn">This computer only</span> · history · {selected.revs} revs</p>
                  <p className="mt-1.5 text-xs text-muted">A teammate who pulls gets the boards, notes and approvals, not every rev you saved while designing.</p>
                </div>
              </>
            ) : (
              <p className="text-muted">Pick a canvas.</p>
            )}
            <div className="rounded-xl border border-line bg-panel p-3">
              <b className="text-sm font-[650]">Design system</b>
              <p className="mt-1 text-sm text-sub">{data?.system ? <>{data.system} · <span className="text-ok">.tenon/design-system/</span></> : "None yet. Boards use a plain look."}</p>
              <button className="mt-1.5 text-sm font-medium text-accent hover:text-accent2" onClick={() => actions.openDesign(cwd, canvas, "system")}>Open the Design system tab</button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
