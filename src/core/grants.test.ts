import { expect, test } from "vitest";
import { createGrants, importCodeItems, importGrant } from "./grants";

test("a path is usable only after main grants it, also if the grant comes a moment later", async () => {
  const { assertGranted, grant } = createGrants();
  await expect(assertGranted("folder", "/")).rejects.toThrow("Not a folder you picked");
  setTimeout(() => grant("folder", "/Users/me/code/app/"), 50);
  await expect(assertGranted("folder", "/Users/me/code/app")).resolves.toBe("/Users/me/code/app");
  await expect(assertGranted("file", "/Users/me/code/app")).rejects.toThrow(); // a folder grant is not a file grant
});

test("a package confirmation is good for one install", async () => {
  const { consumePackageGrant, grant } = createGrants();
  grant("package", "install||npm:foo");
  await expect(consumePackageGrant("install||npm:foo")).resolves.toBeUndefined();
  await expect(consumePackageGrant("install||npm:foo")).rejects.toThrow("Not confirmed");
});

test("main and the agent build the same import key, in any order of the picked items", () => {
  // main gets the window's picks as unknown values; the agent gets checked ImportItems
  expect(importGrant(["packages", "settings", "files"])).toBe(importGrant(["files", "packages"]));
  expect(importGrant(["packages", "files"])).toBe("import||files,packages");
  expect(importCodeItems(["settings", "keys", 42])).toEqual([]);
});
