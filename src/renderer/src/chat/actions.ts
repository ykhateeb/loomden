import type { Command, ModelChoice, SlashCommand, ThinkingLevel } from "#protocol";
import { call } from "#renderer/port";
import { notice, report, set } from "#renderer/store";

export type Behavior = Extract<Command, { type: "session.prompt" }>["behavior"];

export const chatActions = {
  /** `onAccepted` runs when pi accepted the message. The run itself may still fail later, as a notice. */
  prompt: ({ key, text, behavior, images, onAccepted }: { key: string; text: string; behavior?: Behavior; images?: string[]; onAccepted?: () => void }) =>
    call({ type: "session.prompt", key, text, behavior, images }).then(onAccepted, report),
  /** Remove the text pi gave back for the message box (after a switch or fork). Read it in `drafts` first. */
  clearDraft: (key: string) => set((s) => ({ drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== key)) })),
  commands: (key: string) => call({ type: "session.commands", key }).catch((e) => (report(e), [] as SlashCommand[])),
  models: (key: string) => call({ type: "session.models", key }).catch((e) => (report(e), [] as ModelChoice[])),
  setModel: (key: string, provider: string, id: string) => call({ type: "session.model", key, provider, id }).catch(report),
  thinking: (key: string, level: ThinkingLevel) => call({ type: "session.thinking", key, level }).catch(report),
  /** Remove the queued messages. Read them from the live state first, to edit them. */
  dequeue: (key: string) => call({ type: "session.dequeue", key }).catch(report),
  abort: (key: string) => call({ type: "session.abort", key }).catch(report),
  compact: (key: string) => call({ type: "session.compact", key }).catch(report),
  reload: (key: string) =>
    call({ type: "session.reload", key })
      .then(() => notice("Context reloaded", "info"))
      .catch(report),
  setTools: (key: string, names: string[]) => call({ type: "session.tools", key, names }).catch(report),
  searchFiles: (cwd: string, query: string) => call({ type: "files.search", cwd, query }).catch(() => [] as string[]),
};
