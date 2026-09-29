import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AgentOut } from "../../protocol";
import { forwardEvents } from "./events";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const msg = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] }) as never;
const update = (text: string) => ({ type: "message_update", message: msg(text), assistantMessageEvent: {} }) as unknown as AgentSessionEvent;

test("many token updates → one message with the latest text", () => {
  const sent: AgentOut[] = [];
  const forward = forwardEvents("k", (m) => sent.push(m), () => {});
  forward({ type: "message_start", message: msg("") } as AgentSessionEvent);
  for (const t of ["a", "ab", "abc"]) forward(update(t));
  vi.advanceTimersByTime(60);
  expect(sent).toEqual([
    { type: "message", key: "k", message: msg(""), push: true },
    { type: "message", key: "k", message: msg("abc"), push: false },
  ]);
});

test("message_end drops the waiting update, so an old partial never replaces the final message", () => {
  const sent: AgentOut[] = [];
  const forward = forwardEvents("k", (m) => sent.push(m), () => {});
  forward(update("ab"));
  forward({ type: "message_end", message: msg("abc!") } as AgentSessionEvent);
  vi.advanceTimersByTime(60);
  expect(sent).toEqual([{ type: "message", key: "k", message: msg("abc!"), push: false }]);
});

test("other events send a fresh state", () => {
  const sendState = vi.fn();
  const forward = forwardEvents("k", () => {}, sendState);
  forward({ type: "agent_start" } as AgentSessionEvent);
  forward({ type: "queue_update", steering: [], followUp: ["x"] } as AgentSessionEvent);
  expect(sendState).toHaveBeenCalledTimes(2);
});
