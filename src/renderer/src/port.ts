// The window's port to the agent process: commands out, replies and agent messages in.
import type { AgentOut, Command } from "#protocol";

/** An agent message that is not a reply to a command. */
export type AgentMessageOut = Exclude<AgentOut, { type: "reply" }>;

let port: MessagePort | undefined;
let nextRid = 1;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

/** Send a command; the promise settles with the agent's reply. */
export function call<T = unknown>(cmd: Command): Promise<T> {
  if (!port) return Promise.reject(new Error("Not connected to the agent process"));
  const rid = nextRid++;
  port.postMessage({ ...cmd, rid });
  return new Promise<T>((resolve, reject) => waiting.set(rid, { resolve: resolve as (v: unknown) => void, reject }));
}

/** Main posts each new agent port to the page, and tells it when the agent stopped. */
export function listenForAgent(on: { connect: () => void; message: (msg: AgentMessageOut) => void; exit: () => void }) {
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data === "tenon:agent-exit") {
      dropPort("pi stopped");
      return on.exit();
    }
    if (e.data !== "tenon:agent-port" || !e.ports[0]) return;
    dropPort("The window got a new connection to pi");
    port = e.ports[0];
    port.onmessage = (m) => {
      const msg = m.data as AgentOut;
      if (msg.type === "reply") settle(msg);
      else on.message(msg);
    };
    on.connect();
  });
}

function settle(reply: Extract<AgentOut, { type: "reply" }>) {
  const w = waiting.get(reply.rid);
  waiting.delete(reply.rid);
  if (reply.ok) w?.resolve(reply.data);
  else w?.reject(new Error(reply.error));
}

function dropPort(reason: string) {
  for (const w of waiting.values()) w.reject(new Error(reason));
  waiting.clear();
  port?.close();
  port = undefined;
}
