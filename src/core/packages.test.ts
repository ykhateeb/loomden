import { expect, test } from "vitest";
import { parseSource } from "./packages";

test("package sources as the board shows them", () => {
  expect(parseSource("npm:pi-prompts-review@1.4.2")).toMatchObject({ name: "pi-prompts-review", version: "1.4.2", kind: "npm" });
  expect(parseSource("npm:@orbit/pi-skills@2.0.1")).toMatchObject({ name: "@orbit/pi-skills", version: "2.0.1" });
  expect(parseSource("npm:@orbit/pi-skills")).toMatchObject({ name: "@orbit/pi-skills", version: undefined });
  expect(parseSource("git:github.com/yazan/pi-extensions@main")).toMatchObject({ name: "pi-extensions", version: "@main", kind: "git", where: "git repo · github.com/yazan/pi-extensions" });
  expect(parseSource("./local/path")).toMatchObject({ name: "path", kind: "local" });
});
