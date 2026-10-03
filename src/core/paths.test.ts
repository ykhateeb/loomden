import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { exportFile } from "./paths";

test("an export id makes a temporary HTML path, and nothing else does", () => {
  const id = "0b7c3f6e-2a41-4d8e-9c55-1f2e3d4c5b6a";
  expect(exportFile(id)).toBe(join(tmpdir(), `tenon-export-${id}.html`));
  for (const bad of [undefined, "", "../../.zshrc", `${id}/../x`, 42]) expect(() => exportFile(bad)).toThrow("Not a Tenon export");
});
