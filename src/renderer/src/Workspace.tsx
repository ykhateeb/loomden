import { useState } from "react";
import { Chat } from "./chat/Chat";
import { AllSessions } from "./sessions/AllSessions";
import { ContextRail } from "./context/ContextRail";
import { Sidebar } from "./sessions/Sidebar";
import { useStore } from "./store";

const WIDTH = { base: 280, min: 220, max: 480 };
const KEY = "tau.sidebarWidth";

function savedWidth() {
  try {
    const n = Number(localStorage.getItem(KEY));
    return n >= WIDTH.min && n <= WIDTH.max ? n : WIDTH.base;
  } catch {
    return WIDTH.base;
  }
}

/** Board 2 and 2b: sessions pane, chat, context rail. Drag the pane border to resize it; double-click resets it. */
export function Workspace() {
  const active = useStore((s) => s.active);
  const state = useStore((s) => (s.active ? s.live[s.active] : undefined));
  const [width, setWidthRaw] = useState(savedWidth);
  const [dragging, setDragging] = useState(false);

  // Board 1: with no session open, the Sessions tab is the full-width list (no sidebar).
  if (!active || !state) return <AllSessions />;

  const setWidth = (w: number) => {
    const next = Math.round(Math.max(WIDTH.min, Math.min(w, WIDTH.max)));
    setWidthRaw(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // a per-viewer convenience only
    }
  };

  return (
    <div className="relative grid min-h-0 flex-1" style={{ gridTemplateColumns: `${width}px minmax(0,1fr) 320px` }}>
      <Sidebar />
      <Chat key={active} sessionKey={active} state={state} />
      <ContextRail state={state} />

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Sessions pane width"
        aria-valuenow={width}
        aria-valuemin={WIDTH.min}
        aria-valuemax={WIDTH.max}
        tabIndex={0}
        title="Drag to resize · double-click resets"
        style={{ left: width - 3 }}
        className="absolute inset-y-0 z-10 w-1.5 cursor-col-resize outline-none hover:bg-accent-line focus-visible:bg-accent-line data-[on=true]:bg-accent"
        data-on={dragging}
        onDoubleClick={() => setWidth(WIDTH.base)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth(width - 16);
          if (e.key === "ArrowRight") setWidth(width + 16);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => dragging && setWidth(e.clientX - e.currentTarget.parentElement!.getBoundingClientRect().left)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onLostPointerCapture={() => setDragging(false)}
      />
      {dragging && (
        <span className="pointer-events-none absolute top-3 z-[35] rounded-md bg-tip px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-tip-fg shadow-tip" style={{ left: width + 10 }}>
          Sessions pane · {width}px · double-click resets
        </span>
      )}
    </div>
  );
}
