import { defineConfig } from "@playwright/test";

export default defineConfig({
  testMatch: ["e2e/*.e2e.ts", "packages/*/e2e/*.e2e.ts"],
  // .claude/ holds agent worktrees: full copies of this repo and its tests.
  // The pattern starts at this folder, so a run inside a worktree still finds its own tests.
  testIgnore: [`${import.meta.dirname}/.claude/**`],
  workers: 1,
  use: { browserName: "chromium" },
});
