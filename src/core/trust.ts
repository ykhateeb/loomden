// Project trust: whether pi may load a project's own .pi files (extensions, skills, prompts).
import { realpathSync } from "node:fs";
import { getAgentDir, ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import type { Project } from "#protocol";

/** Settings › Project trust: trust, do not trust, or ask again (null). */
export function setTrust(cwd: string, trusted: boolean | null): void {
  new ProjectTrustStore(getAgentDir()).set(cwd, trusted);
}

/** Board 4, right: what pi decided for each project's own files. */
export function trustList(projects: Project[]) {
  const store = new ProjectTrustStore(getAgentDir());
  // A decision can come from a parent folder; "Ask" only removes the project's own decision.
  return projects.map((p) => {
    const entry = store.getEntry(p.cwd);
    let own = p.cwd;
    try {
      own = realpathSync(p.cwd); // pi keeps real paths (/tmp is /private/tmp)
    } catch {
      // the folder is gone: compare as it is
    }
    return { cwd: p.cwd, name: p.name, trusted: store.get(p.cwd), from: entry && entry.path !== own && entry.path !== p.cwd ? entry.path : undefined };
  });
}
