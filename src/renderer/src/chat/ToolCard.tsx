import { useState } from "react";
import type { AgentMessage } from "#protocol";
import { cx, Pill, Spinner } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { diffCounts, parseDiff } from "./format";
import { plural } from "./format";

type Assistant = Extract<AgentMessage, { role: "assistant" }>;
export type ToolCall = Extract<Assistant["content"][number], { type: "toolCall" }>;
export type ToolResult = Extract<AgentMessage, { role: "toolResult" }>;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** What the header says after the tool name: a path, a command, a pattern. */
function summary(args: Record<string, unknown>) {
  return str(args.path) ?? str(args.file_path) ?? str(args.command) ?? str(args.pattern) ?? JSON.stringify(args).slice(0, 120);
}


/** Board 2: read / edit / bash cards. An edit shows its diff; other output opens from the header. */
export function ToolCard({ call, result, running }: { call: ToolCall; result?: ToolResult; running: boolean }) {
  const diff = str((result?.details as { diff?: unknown } | undefined)?.diff);
  const text = result?.content.map((c) => (c.type === "text" ? c.text : "[image]")).join("\n") ?? "";
  const [open, setOpen] = useState(false);
  const counts = diff ? diffCounts(diff) : undefined;
  const lines = text ? text.replace(/\n$/, "").split("\n").length : 0;

  const status = !result ? (
    running && <Spinner label="running" />
  ) : result.isError ? (
    <Pill tone="danger" className="h-[22px]"><Icon name="x" size={12} />failed</Pill>
  ) : counts ? (
    <span className="font-mono text-xs"><span className="text-ok">+{counts.added}</span> <span className="text-danger">−{counts.removed}</span></span>
  ) : call.name === "bash" ? (
    <Pill tone="ok" className="h-[22px]"><Icon name="check" size={12} />done</Pill>
  ) : (
    <span className="text-xs text-muted">{plural(lines, "line")}</span>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <button
        className={cx("flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm", !diff && text && "hover:bg-hover")}
        aria-expanded={diff ? undefined : open}
        disabled={!!diff || !text}
        onClick={() => setOpen(!open)}
      >
        <span className="font-mono text-meta font-semibold text-orange">{call.name}</span>
        <span className="truncate font-mono text-xs text-sub">{summary(call.arguments)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {status}
          {!diff && text && <span className="text-muted"><Icon name={open ? "chevronDown" : "chevron"} size={13} /></span>}
        </span>
      </button>
      {diff ? (
        // The design system's Diff grid: a dim right-aligned line-number gutter, a sign column, then the code.
        <div className="max-h-80 overflow-auto border-t border-line py-1 font-mono text-xs leading-[1.65]">
          {parseDiff(diff).map((line, i) => (
            <div
              key={i}
              className={cx("grid grid-cols-[40px_18px_1fr] whitespace-pre pr-3", line.kind === "add" && "bg-add-bg text-add", line.kind === "del" && "bg-del-bg text-del")}
            >
              <span className="pr-2.5 text-right text-dim">{line.n ?? ""}</span>
              <span>{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}</span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      ) : (
        open && (
          <pre className="max-h-80 overflow-auto border-t border-line px-3 py-1.5 font-mono text-xs leading-[1.65] whitespace-pre-wrap text-sub">
            {text.length > 8000 ? `${text.slice(0, 8000)}\n…` : text}
          </pre>
        )
      )}
    </div>
  );
}
