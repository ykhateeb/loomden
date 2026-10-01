import { searchFiles } from "#core/attachments";
import { designList, designOpen } from "#core/design";
import { setTrust, trustList } from "#core/packages";
import { addProject, assertProject, listSessions, removeProject } from "#core/projects";
import type { Deps, Handlers } from "./handlers";

export function projectCommands({ grants, sessions, send }: Deps) {
  return {
    "sessions.list": () => listSessions(),
    "project.add": async (cmd) => {
      await addProject(grants, cmd.cwd);
      return listSessions();
    },
    "project.remove": async (cmd) => {
      await removeProject(cmd.cwd);
      return listSessions();
    },
    "trust.set": async (cmd) => {
      await assertProject(cmd.cwd);
      if (cmd.trusted !== null && typeof cmd.trusted !== "boolean") throw new Error("Not a trust decision");
      setTrust(cmd.cwd, cmd.trusted);
      return trustList((await listSessions()).projects);
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
      return designOpen(cmd, {
        prompt: (key, text) => sessions.prompt(key, text),
        build: (cwd, pack) => send({ type: "canvas.build", cwd, ...pack }),
      });
    },
  } satisfies Partial<Handlers>;
}
