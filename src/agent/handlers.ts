import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Grants } from "#core/grants";
import type { Dialogs } from "#core/sessions/extension-ui";
import type { createRegistry } from "#core/sessions/registry";
import type { AgentOut, Command, Replies, Send } from "#protocol";

/** One handler for each window command. tsc fails if a command has no handler, or if a handler returns a different reply. */
export type Handlers = { [K in Command["type"]]: (cmd: Extract<Command, { type: K }>) => Replies[K] | Promise<Replies[K]> };

/** The agent state that the handlers use. `src/agent/index.ts` makes each part once. */
export interface Deps {
  send: Send;
  modelRuntime: ModelRuntime;
  grants: Grants;
  dialogs: Dialogs;
  sessions: ReturnType<typeof createRegistry>;
}

export function createHandle(handlers: Handlers) {
  return async (cmd: Command): Promise<unknown> => {
    // The window shows model output, so treat what it sends as untrusted.
    // Only an own key: a type like "toString" must not find a function on Object.prototype.
    if (!Object.hasOwn(handlers, cmd.type)) throw new Error(`Unknown command ${String(cmd.type)}`);
    return (handlers[cmd.type] as (cmd: Command) => unknown)(cmd);
  };
}

/** The reply to a failed command. A handler can throw a value that is not an Error, and the reply needs a string. */
export function errorReply(rid: number, e: unknown) {
  return { type: "reply", rid, ok: false, error: e instanceof Error ? e.message : String(e) } satisfies AgentOut;
}
