import { expect, test } from "vitest";
import { createGrants } from "./grants";

test("a path is usable only after main grants it, also if the grant comes a moment later", async () => {
  const { assertGranted, grant } = createGrants();
  await expect(assertGranted("folder", "/")).rejects.toThrow("Not a folder you picked");
  setTimeout(() => grant("folder", "/Users/me/code/app/"), 50);
  await expect(assertGranted("folder", "/Users/me/code/app")).resolves.toBe("/Users/me/code/app");
  await expect(assertGranted("file", "/Users/me/code/app")).rejects.toThrow(); // a folder grant is not a file grant
});

test("a package confirmation is good for one install", async () => {
  const { assertGranted, grant } = createGrants();
  grant("package", "install||npm:foo");
  await expect(assertGranted("package", "install||npm:foo")).resolves.toBe("install||npm:foo");
  await expect(assertGranted("package", "install||npm:foo")).rejects.toThrow("Not confirmed");
});
