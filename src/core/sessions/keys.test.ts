import { expect, test } from "vitest";
import { assertNewKey } from "./keys";

const key = "0b7c3f6e-2a41-4d8e-9c55-1f2e3d4c5b6a";

test("accepts a new UUID", () => {
  expect(() => assertNewKey(key, new Set())).not.toThrow();
});

test("refuses the key of an open session, and anything that is not a UUID", () => {
  expect(() => assertNewKey(key, new Set([key]))).toThrow("Not a new session key");
  for (const bad of [undefined, 42, "", "abc", `${key}x`, "__proto__"]) expect(() => assertNewKey(bad, new Set())).toThrow("Not a new session key");
});
