import { basename } from "node:path";
import type { AgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import type { AgentMessage, LiveState, ThinkingLevel } from "#protocol";
import { resourceName } from "#core/packages";

export type Session = AgentSessionRuntime["session"];

/** An open session: pi's runtime, and what Tenon tracks about it. */
export type OpenSession = {
  rt: AgentSessionRuntime;
  unsubscribe?: () => void;
  runningTools: Set<string>;
  branch?: string;
  runStartedAt?: number;
  /** What the user queued, as typed and with image paths (pi keeps only the expanded text). */
  queued: { text: string; images: string[] }[];
};

const TITLE_MAX_LENGTH = 80;

/**
 * pi took queued messages into the run: drop them from the front of ours. pi reports a new message before
 * prompt() adds it to ours, so `stillQueued` can be more than we hold: then we keep all.
 * ponytail: assumes pi delivers in the order they were queued; mixed steer/follow-up can differ.
 */
export function trimQueued(queued: OpenSession["queued"], stillQueued: number) {
  return queued.slice(Math.max(0, queued.length - stillQueued));
}

/** The level comes from the window: accept only one the model of the session has. */
export function assertThinkingLevel(level: ThinkingLevel, available: readonly ThinkingLevel[]) {
  if (!available.includes(level)) throw new Error(`Thinking level "${level}" is not available for this model`);
}

/** Everything the window shows about an open session, except its messages. */
export function liveState(key: string, { rt, runningTools, branch, runStartedAt, queued }: OpenSession): LiveState {
  const s = rt.session;
  const stats = s.getSessionStats();
  const active = new Set(s.getActiveToolNames());
  return {
    key,
    cwd: rt.cwd,
    file: s.sessionFile,
    title: s.sessionName ?? firstUserText(s.messages) ?? "New session",
    branch,
    streaming: s.isStreaming,
    runStartedAt,
    model: s.model?.id,
    provider: s.model?.provider,
    thinking: s.thinkingLevel,
    thinkingLevels: s.supportsThinking() ? s.getAvailableThinkingLevels() : [],
    cost: stats.cost,
    tokensIn: stats.tokens.input + stats.tokens.cacheRead,
    tokensOut: stats.tokens.output,
    context: s.getContextUsage(),
    compactAt: compactAt(s),
    compacting: s.isCompacting,
    resources: resources(s),
    tools: s.getAllTools().map((t) => ({ name: t.name, active: active.has(t.name) })),
    runningTools: [...runningTools],
    queued,
  };
}

function compactAt(s: Session) {
  const window = s.model?.contextWindow;
  if (!window || !s.autoCompactionEnabled) return undefined;
  return window - s.settingsManager.getCompactionSettings(s.model).reserveTokens;
}

function resources(s: Session): LiveState["resources"] {
  const loader = s.resourceLoader;
  const skills = loader.getSkills().skills.map((k) => k.name);
  const system = loader.getSystemPromptSource();
  return [
    ...loader.getAgentsFiles().agentsFiles.map((f) => ({ name: basename(f.path), kind: "file" as const })),
    ...(system ? [{ name: basename(system.path), kind: "system" as const }] : []),
    ...(skills.length ? [{ name: skills.join(" · "), kind: "skills" as const }] : []),
    ...loader.getExtensions().extensions.filter((e) => !e.hidden).map((e) => ({ name: resourceName("extensions", e.path), kind: "extension" as const })),
  ];
}

function firstUserText(messages: readonly AgentMessage[]): string | undefined {
  const m = messages.find((m) => m.role === "user");
  if (!m || m.role !== "user") return undefined;
  const text = typeof m.content === "string" ? m.content : m.content.find((c) => c.type === "text")?.text;
  return text?.split("\n")[0].slice(0, TITLE_MAX_LENGTH);
}
