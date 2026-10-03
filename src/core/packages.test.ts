import { expect, test } from "vitest";
import { galleryItems, isRemoteSource, packageSource, parseSource } from "./packages";

test("package sources as the board shows them", () => {
  expect(parseSource("npm:pi-prompts-review@1.4.2")).toMatchObject({ name: "pi-prompts-review", version: "1.4.2", kind: "npm" });
  expect(parseSource("npm:@orbit/pi-skills@2.0.1")).toMatchObject({ name: "@orbit/pi-skills", version: "2.0.1" });
  expect(parseSource("npm:@orbit/pi-skills")).toMatchObject({ name: "@orbit/pi-skills", version: undefined });
  expect(parseSource("git:github.com/yazan/pi-extensions@main")).toMatchObject({ name: "pi-extensions", version: "@main", kind: "git", where: "git repo · github.com/yazan/pi-extensions" });
  expect(parseSource("./local/path")).toMatchObject({ name: "path", kind: "local" });
});

test("isRemoteSource: npm, git, and URLs are remote; a path is local", () => {
  for (const s of ["npm:pi-x", "git:github.com/me/pi-x", "https://github.com/me/pi-x", "http://host/pi-x"]) expect(isRemoteSource(s)).toBe(true);
  for (const s of ["./pi-x", "/abs/pi-x", "pi-x", "ftp://host/pi-x"]) expect(isRemoteSource(s)).toBe(false);
});

test("packageSource: a string entry or an object entry with filters", () => {
  expect(packageSource("npm:pi-x")).toBe("npm:pi-x");
  expect(packageSource({ source: "./pi-x" })).toBe("./pi-x");
});

test("an npm search answer: entries with a wrong shape are dropped, a wrong body names the URL", () => {
  const body = { objects: [
    { package: { name: "pi-theme-dusk", version: "1.0.0", keywords: ["pi-package", "theme"] } },
    { package: { name: "pi-x", version: "2.0.0", description: 7, keywords: "skills" } },
    { package: { name: 42, version: "1.0.0" } },
    { package: null },
    "junk",
  ] };
  expect(galleryItems(body, "https://npm.test/search")).toEqual([
    { name: "pi-theme-dusk", version: "1.0.0", description: "", kind: "theme" },
    { name: "pi-x", version: "2.0.0", description: "", kind: "extension" },
  ]);
  expect(() => galleryItems({ error: "down" }, "https://npm.test/search")).toThrow("https://npm.test/search");
});
