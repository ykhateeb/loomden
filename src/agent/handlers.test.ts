import { expect, test } from "vitest";
import type { Command } from "#protocol";
import { createHandle, type Handlers } from "./handlers";

const handle = createHandle({ "sessions.list": () => "listed" } as unknown as Handlers);

test("runs the handler of a known command", async () => {
  expect(await handle({ type: "sessions.list" })).toBe("listed");
});

test("rejects an unknown command and keys from Object.prototype", async () => {
  for (const type of ["nope", "toString", "__proto__", "constructor"]) {
    await expect(handle({ type } as unknown as Command)).rejects.toThrow(`Unknown command ${type}`);
  }
});
