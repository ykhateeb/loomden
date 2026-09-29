import { expect, test, vi } from "vitest";
import type { AgentOut } from "../../protocol";
import { answer, resendPending, uiContextFor } from "./extension-ui";

function setup() {
  const sent: AgentOut[] = [];
  const ui = uiContextFor("k", (m) => sent.push(m));
  const lastRequest = () => {
    const r = sent.filter((m) => m.type === "ui.request").at(-1);
    if (r?.type !== "ui.request") throw new Error("no request");
    return r.request;
  };
  return { sent, ui, lastRequest };
}

test("confirm resolves with the answer and closes the dialog", async () => {
  const { sent, ui, lastRequest } = setup();
  const result = ui.confirm("Run bash?", "git commit");
  const request = lastRequest();
  expect(request).toMatchObject({ key: "k", method: "confirm", message: "git commit" });
  answer(request.id, true);
  expect(await result).toBe(true);
  expect(sent.at(-1)).toEqual({ type: "ui.done", id: request.id });
});

test("cancel → the safe default (confirm false, select undefined)", async () => {
  const { ui, lastRequest } = setup();
  const confirm = ui.confirm("Run bash?", "rm -rf /");
  answer(lastRequest().id, undefined);
  expect(await confirm).toBe(false);
  const select = ui.select("Pick", ["a", "b"]);
  answer(lastRequest().id, undefined);
  expect(await select).toBeUndefined();
});

test("timeout resolves with the default and the dialog closes", async () => {
  vi.useFakeTimers();
  const { sent, ui } = setup();
  const result = ui.confirm("Run bash?", "ls", { timeout: 1000 });
  vi.advanceTimersByTime(1001);
  expect(await result).toBe(false);
  expect(sent.at(-1)?.type).toBe("ui.done");
  vi.useRealTimers();
});

test("a reloaded window gets open dialogs again", () => {
  const { ui, lastRequest } = setup();
  void ui.input("Name?");
  const again: AgentOut[] = [];
  resendPending((m) => again.push(m));
  expect(again).toContainEqual({ type: "ui.request", request: lastRequest() });
  answer(lastRequest().id, "x");
});
