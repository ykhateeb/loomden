import { expect, test } from "vitest";
import { trimQueued } from "./live-state";

const q = (...texts: string[]) => texts.map((text) => ({ text, images: [] }));

test("a new message that pi reports before we add it keeps all of ours", () => {
  // Third message queued: pi holds a, b, c; we hold a, b until prompt() adds c.
  expect(trimQueued(q("a", "b"), 3)).toEqual(q("a", "b"));
});

test("messages pi took into the run go from the front", () => {
  expect(trimQueued(q("a", "b", "c"), 1)).toEqual(q("c"));
  expect(trimQueued(q("a", "b"), 0)).toEqual([]);
});
