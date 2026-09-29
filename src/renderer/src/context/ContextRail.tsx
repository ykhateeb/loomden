import { useEffect, useState } from "react";
import type { LiveState, SessionTree } from "../../../protocol";
import { actions, useStore } from "../store";
import { cx, LinkButton, Pill, type PillTone, Spinner } from "../ui/base";
import { Switch } from "../ui/controls";
import { Icon, type IconName } from "../ui/Icon";
import { Card, CardBody, CardHeader } from "../ui/surfaces";

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const kinds: Record<LiveState["resources"][number]["kind"], { icon: IconName; tone: PillTone; label: string }> = {
  file: { icon: "fileText", tone: "dim", label: "file" },
  system: { icon: "fileText", tone: "dim", label: "system" },
  skills: { icon: "star", tone: "violet", label: "skills" },
  extension: { icon: "bolt", tone: "orange", label: "extension" },
};

/** Board 2, right: usage and auto-compact, what is in context, which tools pi may use. */
export function ContextRail({ state }: { state: LiveState }) {
  const ctx = state.context;
  const active = state.tools.filter((t) => t.active);
  const pct = (n: number) => (ctx ? Math.min(100, (n / ctx.contextWindow) * 100) : 0);

  // Board 2's small tree: the last shared rows and the branches after them. Fetched again with each new message.
  const messages = useStore((s) => s.messages[state.key]); // a new list after each message and each switch
  const stamp = useStore((s) => s.treeStamp); // labels and forks
  const [tree, setTree] = useState<SessionTree>();
  useEffect(() => {
    actions.tree(state.key).then(setTree);
  }, [state.key, messages, stamp]);
  const branches = tree && tree.last !== undefined ? (tree.branchesAt[tree.last] ?? []) : [];

  const toggle = (name: string, on: boolean) =>
    actions.setTools(state.key, on ? [...active.map((t) => t.name), name] : active.map((t) => t.name).filter((n) => n !== name));

  return (
    <aside className="flex flex-col gap-3 overflow-auto border-l border-line bg-side p-3.5 [&>*]:shrink-0">
      <Card>
        <CardHeader>Usage<span className="ml-auto font-medium text-muted">${state.cost.toFixed(2)}</span></CardHeader>
        <CardBody className="flex flex-col gap-2">
          {ctx && (
            <>
              <div className="flex items-baseline gap-2">
                <b className="text-[20px] font-[650]">{ctx.tokens === null ? "—" : k(ctx.tokens)}</b>
                <span className="text-muted">/ {k(ctx.contextWindow)} tokens</span>
              </div>
              <div className="relative h-1.5 rounded-[3px] bg-raised" role="meter" aria-label="Context used" aria-valuenow={Math.round(ctx.percent ?? 0)} aria-valuemin={0} aria-valuemax={100}>
                <b className="absolute inset-y-0 left-0 rounded-[3px] bg-accent" style={{ width: `${Math.min(ctx.percent ?? 0, 100)}%` }} />
                {state.compactAt && <i className="absolute -top-[3px] h-3 w-0.5 rounded-[1px] bg-warn" style={{ left: `${pct(state.compactAt)}%` }} title="auto-compact starts here" />}
              </div>
            </>
          )}
          <div className="flex items-center text-xs text-muted">
            <span>in {k(state.tokensIn)} · out {k(state.tokensOut)}</span>
            <span className="ml-auto">{state.compactAt ? `auto-compact ~${k(state.compactAt)}` : "auto-compact off"}</span>
          </div>
          {state.compacting ? (
            <span className="flex items-center gap-2 text-xs text-sub"><Spinner size={10} />Compacting…</span>
          ) : (
            <LinkButton className="self-start text-sm" disabled={state.streaming} title={state.streaming ? "Wait for pi to finish" : "Summarize older messages to free context"} onClick={() => actions.compact(state.key)}>
              Compact now
            </LinkButton>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Context<LinkButton className="ml-auto" onClick={() => actions.reload(state.key)}>Reload</LinkButton></CardHeader>
        <CardBody className="flex flex-col gap-1.5 text-sm">
          {state.resources.length === 0 && <span className="text-muted">No context files, skills or extensions</span>}
          {state.resources.map((r, i) => (
            <div key={i} className="flex min-w-0 items-center gap-2">
              <span className="text-muted"><Icon name={kinds[r.kind].icon} size={14} /></span>
              <span className="truncate text-sub">{r.name}</span>
              <Pill tone={kinds[r.kind].tone} className="ml-auto h-5 text-label">{kinds[r.kind].label}</Pill>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Tools<span className="ml-auto font-medium text-muted">{active.length} of {state.tools.length}</span></CardHeader>
        <CardBody className="grid grid-cols-2 gap-x-3.5 gap-y-2 text-sm">
          {state.tools.map((t) => (
            <label key={t.name} className={`flex min-w-0 cursor-pointer items-center gap-2 ${t.active ? "" : "text-muted"}`}>
              <Switch label={t.name} on={t.active} onChange={(on) => toggle(t.name, on)} />
              <span className="truncate">{t.name}</span>
            </label>
          ))}
        </CardBody>
      </Card>

      {tree && (
        <Card>
          <CardHeader>Session tree<LinkButton className="ml-auto" onClick={() => actions.setView(state.key, "tree")}>Open</LinkButton></CardHeader>
          <CardBody className="flex flex-col gap-1 text-sm">
            {tree.rows.slice(-3).map((r, i) => (
              <div key={r.id} className="flex min-w-0 items-center gap-2" style={{ paddingLeft: Math.min(i, 2) * 12 }}>
                <span className={cx("size-[7px] shrink-0 rounded-full", r.branchPoint ? "bg-warn" : "bg-muted")} />
                <span className="truncate text-sub">{r.label ?? r.text}</span>
              </div>
            ))}
            {branches.map((c) => (
              <div key={c.id} className={cx("flex min-w-0 items-center gap-2 pl-6", c.current && "font-semibold")}>
                {c.current ? <span className="size-[7px] shrink-0 rounded-full bg-accent shadow-[0_0_0_3px_var(--color-accent-bg)]" /> : <span className="text-muted"><Icon name="branch" size={12} /></span>}
                <span className={cx("truncate", c.current ? "text-fg" : "text-sub")}>{c.name}</span>
                {c.current ? <span className="ml-auto shrink-0 text-meta font-normal text-accent">you are here</span> : <Pill tone="warn" className="ml-auto h-[18px] text-[10.5px]">branch</Pill>}
              </div>
            ))}
            {!branches.length && <span className="text-xs text-muted">One branch so far</span>}
          </CardBody>
        </Card>
      )}
    </aside>
  );
}
