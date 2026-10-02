import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import type { AgentMessage, LiveState } from "#protocol";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { TreeView } from "#renderer/tree/TreeView";
import { Avatar, Kbd, Spinner } from "#renderer/ui/base";
import { Composer } from "./Composer";
import { dayLabel, time } from "./format";
import { ToolCard, type ToolResult } from "./ToolCard";
import { ChatHeader } from "./ChatHeader";
import { groupTurns } from "./turns";
import { hasModifier, isTyping } from "#renderer/ui/keys";

const EMPTY: AgentMessage[] = [];

function textOf(content: string | { type: string; text?: string }[]) {
  return typeof content === "string" ? content : content.map((c) => c.text ?? "").join("\n");
}

/** pi's turn: avatar on the left, name and text on the right (board 2). */
function Turn({ meta, children }: { meta?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <b className="text-base">pi</b>
          {meta && <span className="text-xs text-muted">{meta}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Your turn: no avatar, right-aligned, a bordered bubble in the accent tint (board 2). */
function YouTurn({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[78%] flex-col items-end gap-1.5">
        <span className="text-meta text-muted">You</span>
        <div className="whitespace-pre-wrap rounded-[14px_14px_4px_14px] border border-accent-line bg-accent-bg px-3.5 py-2.5 leading-normal text-fg">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Board 1a: the message a search opened stays marked. `data-at` finds it. */
function Marked({ at, mark, children }: { at: number; mark?: number; children: ReactNode }) {
  return (
    <div data-at={at} className={at === mark ? "-mx-2 rounded-lg px-2 py-1 shadow-[0_0_0_1px_var(--color-accent-line)] bg-accent-bg" : undefined}>
      {children}
    </div>
  );
}

/** The content of one pi message, without its header. */
function AssistantParts({ m, results, running }: { m: Extract<AgentMessage, { role: "assistant" }>; results: Map<string, ToolResult>; running: Set<string> }) {
  return (
    <>
      {m.content.map((c, i) =>
        c.type === "text" ? (
          <div key={i} className="md text-sub"><Markdown>{c.text}</Markdown></div>
        ) : c.type === "thinking" ? (
          <details key={i} className="text-sm text-muted">
            <summary className="cursor-pointer">Thinking</summary>
            <div className="pt-1 whitespace-pre-wrap">{c.redacted ? "(redacted)" : c.thinking}</div>
          </details>
        ) : (
          <ToolCard key={c.id} call={c} result={results.get(c.id)} running={running.has(c.id)} />
        ),
      )}
      {m.errorMessage && <div className="text-danger">{m.errorMessage}</div>}
    </>
  );
}

function Message({ m, results, running }: { m: AgentMessage; results: Map<string, ToolResult>; running: Set<string> }) {
  switch (m.role) {
    case "user":
      return <YouTurn>{textOf(m.content)}</YouTurn>;
    case "assistant":
      return <Turn meta={`${m.model} · ${time(m.timestamp)}`}><AssistantParts m={m} results={results} running={running} /></Turn>;
    case "toolResult":
      return null; // shown in its tool card
    case "bashExecution":
      return <pre className="ml-10 rounded-md border border-line bg-code px-3 py-2.5 font-mono text-sm whitespace-pre-wrap">$ {m.command}{"\n"}{m.output}</pre>;
    case "compactionSummary":
      return <div className="text-center text-xs text-muted">compacted · {m.tokensBefore.toLocaleString()} tokens summarized</div>;
    case "branchSummary":
      return <div className="ml-10 text-xs text-muted">branch summary · {m.summary.slice(0, 160)}</div>;
    case "custom":
      return m.display ? <div className="ml-10 text-sm text-sub"><span className="font-mono font-semibold text-orange">{m.customType}</span> {textOf(m.content)}</div> : null;
    default:
      return null;
  }
}

/** "2m 10s" since the run started, updated each second. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - since) / 1000));
  return <span>{s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`}</span>;
}

/** Near the bottom (in px): new output scrolls into view. Further up: the user reads, and the chat stays. */
const FOLLOW_SCROLL_PX = 200;

export function Chat({ sessionKey, state }: { sessionKey: string; state: LiveState }) {
  const messages = useStore((s) => s.messages[sessionKey] ?? EMPTY);
  const mark = useStore((s) => (s.mark?.key === sessionKey ? s.mark.at : undefined));
  const view = useStore((s) => s.view[sessionKey] ?? "chat");
  const scroller = useRef<HTMLDivElement>(null);

  // Board 2a: T opens the session tree (and goes back to the chat), when you are not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isTreeKey = e.key.toLowerCase() === "t" && !hasModifier(e) && !isTyping(e.target);
      if (!isTreeKey) return;
      if (document.querySelector("[role=dialog],[role=menu]")) return;
      actions.setView(sessionKey, view === "tree" ? "chat" : "tree");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionKey, view]);

  const results = new Map<string, ToolResult>();
  for (const m of messages) if (m.role === "toolResult") results.set(m.toolCallId, m);
  const running = new Set(state.runningTools);
  const count = messages.filter((m) => m.role === "user" || m.role === "assistant").length;

  // A session opens at its newest message (Chat has a key per session, so this runs once for each),
  // or at the message a search opened.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useLayoutEffect(() => {
    if (mark) scroller.current?.querySelector(`[data-at="${mark}"]`)?.scrollIntoView({ block: "center" });
  }, [mark, messages.length > 0]);

  // Follow new output, unless the user scrolled up to read.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SCROLL_PX) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const rows = groupTurns(messages).map((row) => {
    if (row.kind === "day") return <div key={row.key} className="text-center text-xs text-muted">{dayLabel(row.at)}</div>;
    if (row.kind === "message")
      return <Marked key={row.key} at={row.message.timestamp} mark={mark}><Message m={row.message} results={results} running={running} /></Marked>;
    const [first] = row.parts;
    return (
      <Turn key={row.key} meta={`${first.model} · ${time(first.timestamp)}`}>
        {row.parts.map((part, j) => (
          <Marked key={j} at={part.timestamp} mark={mark}>
            <div className="flex flex-col gap-2.5"><AssistantParts m={part} results={results} running={running} /></div>
          </Marked>
        ))}
      </Turn>
    );
  });

  return (
    <main className="flex min-h-0 min-w-0 flex-col bg-bg">
      <ChatHeader sessionKey={sessionKey} state={state} view={view} messageCount={count} />

      {view === "tree" && <TreeView sessionKey={sessionKey} state={state} />}
      {/* The chat stays mounted under the tree, so the message box keeps what you typed and attached. */}
      <div className={view === "tree" ? "hidden" : "contents"}>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto px-[22px] pt-[22px] pb-4 [&>*]:shrink-0">
        {rows}
        {state.streaming && (
          <div className="flex items-center gap-2.5 pl-10 text-sm text-muted">
            <Spinner />
            <span className="text-sub">Working…</span>
            {state.runStartedAt && <Elapsed since={state.runStartedAt} />}
            <Kbd>Esc</Kbd>
            <span>to interrupt</span>
          </div>
        )}
      </div>
      <Composer sessionKey={sessionKey} state={state} />
      </div>
    </main>
  );
}
