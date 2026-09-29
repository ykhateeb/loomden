import { execFileSync } from "node:child_process";

/**
 * A macOS app opened from Finder does not get the PATH from .zshrc, so bash, npm and nvm fail.
 * Read PATH one time from a login shell.
 */
export function shellEnv(): NodeJS.ProcessEnv {
  if (process.platform === "win32") return process.env;
  try {
    const out = execFileSync(process.env.SHELL || "/bin/zsh", ["-ilc", 'printf "__TAU_PATH__%s" "$PATH"'], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const path = out.split("__TAU_PATH__").pop();
    return path ? { ...process.env, PATH: path } : process.env;
  } catch {
    return process.env;
  }
}
