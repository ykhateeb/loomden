import { searchFiles } from "#core/attachments";
import { designList, designUrl, startDesignServer } from "#core/design";
import { addProject, assertProject, removeProject } from "#core/projects";
import { listSessions } from "#core/sessions/list";
import { setTrust, trustList } from "#core/trust";
import type { Deps, Handlers } from "./handlers";

export function projectCommands({ grants, sessions, send }: Deps) {
  return {
    "sessions.list": () => listSessions(),
    "project.add": (cmd) => addProject(grants, cmd.cwd),
    "project.remove": (cmd) => removeProject(cmd.cwd),
    "trust.list": async () => trustList((await listSessions()).projects),
    "trust.set": async (cmd) => {
      await assertProject(cmd.cwd);
      if (cmd.trusted !== null && typeof cmd.trusted !== "boolean") throw new Error("Not a trust decision");
      setTrust(cmd.cwd, cmd.trusted);
    },
    "files.search": async (cmd) => {
      await assertProject(cmd.cwd);
      return searchFiles(cmd.cwd, cmd.query);
    },
    "design.list": async (cmd) => {
      await assertProject(cmd.cwd);
      return designList(cmd.cwd);
    },
    "design.open": async (cmd) => {
      await assertProject(cmd.cwd);
      await startDesignServer(cmd, {
        prompt: (key, text) => sessions.prompt(key, text),
        build: (cwd, pack) => send({ type: "canvas.build", cwd, ...pack }),
      });
    },
    "design.url": async (cmd) => {
      await assertProject(cmd.cwd);
      return designUrl(cmd);
    },
  } satisfies Partial<Handlers>;
}
