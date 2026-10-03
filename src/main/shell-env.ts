import { execFileSync } from "node:child_process";

/** A login shell that hangs (a slow .zshrc) must not stop the app from starting. */
const SHELL_TIMEOUT_MS = 5000;

/**
 * A macOS app opened from Finder does not get the PATH from .zshrc, so bash, npm and nvm fail.
 * Read PATH one time from a login shell.
 */
export function shellEnv(): NodeJS.ProcessEnv {
  if (process.platform === "win32") return process.env;
  try {
    const out = execFileSync(process.env.SHELL || "/bin/zsh", ["-ilc", 'printf "__TENON_PATH__%s" "$PATH"'], {
      encoding: "utf8",
      timeout: SHELL_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const path = out.split("__TENON_PATH__").pop();
    return path ? { ...process.env, PATH: path } : process.env;
  } catch {
    return process.env;
  }
}
