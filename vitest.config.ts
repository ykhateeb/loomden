import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // .claude/ holds agent worktrees: full copies of this repo and its tests.
  test: { exclude: [...configDefaults.exclude, ".claude/**"] },
});
