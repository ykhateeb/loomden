import type { ModelChoice, SlashCommand } from "#protocol";
import { call } from "#renderer/port";
import { getState, notice, report, set } from "#renderer/store";

export const chatActions = {
  /** True when pi accepted it (the run itself may still fail later, as a notice). */
  prompt: (key: string, text: string, behavior?: "steer" | "followUp", images?: string[]) =>
    call({ type: "session.prompt", key, text, behavior, images }).then(
      () => true,
      (e) => (report(e), false),
    ),
  /** The text pi gave back for the message box (after a switch or fork), once. */
  takeDraft: (key: string) => {
    const text = getState().drafts[key];
    if (text !== undefined) set((s) => ({ drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== key)) }));
    return text;
  },
  commands: (key: string) => call<SlashCommand[]>({ type: "session.commands", key }).catch((e) => (report(e), [] as SlashCommand[])),
  models: (key: string) => call<ModelChoice[]>({ type: "session.models", key }).catch((e) => (report(e), [] as ModelChoice[])),
  setModel: (key: string, provider: string, id: string) => call({ type: "session.model", key, provider, id }).catch(report),
  thinking: (key: string, level: string) => call({ type: "session.thinking", key, level }).catch(report),
  /** Remove the queued messages. Read them from the live state first, to edit them. */
  dequeue: (key: string) => call({ type: "session.dequeue", key }).catch(report),
  abort: (key: string) => call({ type: "session.abort", key }).catch(report),
  compact: (key: string) => call({ type: "session.compact", key }).catch(report),
  reload: (key: string) =>
    call({ type: "session.reload", key })
      .then(() => notice("Context reloaded", "info"))
      .catch(report),
  setTools: (key: string, names: string[]) => call({ type: "session.tools", key, names }).catch(report),
  searchFiles: (cwd: string, query: string) => call<string[]>({ type: "files.search", cwd, query }).catch(() => [] as string[]),
};
