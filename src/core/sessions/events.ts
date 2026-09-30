import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { Send } from "#protocol";

const UPDATE_MS = 50;

/**
 * pi events → renderer messages.
 * message_update carries the whole partial message on each token, so send at most one per UPDATE_MS.
 * Other events only change LiveState, so send a fresh state.
 */
export function forwardEvents(key: string, send: Send, sendState: () => void) {
  let pending: AgentSessionEvent | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    if (pending?.type === "message_update") send({ type: "message", key, message: pending.message, push: false });
    pending = undefined;
  };

  return (event: AgentSessionEvent) => {
    switch (event.type) {
      case "message_start":
        send({ type: "message", key, message: event.message, push: true });
        return;
      case "message_update":
        pending = event;
        timer ??= setTimeout(flush, UPDATE_MS);
        return;
      case "message_end":
        clearTimeout(timer);
        timer = undefined;
        pending = undefined;
        send({ type: "message", key, message: event.message, push: false });
        return;
      case "tool_execution_update":
      case "entry_appended":
        return;
      default:
        sendState();
    }
  };
}
