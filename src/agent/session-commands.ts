import { mkdirSync } from "node:fs";
import { NO_PROJECT_DIR, sessionFile } from "#core/paths";
import { assertProject } from "#core/projects";
import { listSessions } from "#core/sessions/list";
import { searchSessions } from "#core/sessions/search";
import type { Deps, Handlers } from "./handlers";

/** An extension command: it runs at once, with no model call (a new canvas then asks pi to draft it). */
function canvasCommand(title?: string) {
  return title ? `/canvas auto ${title.replace(/\s+/g, " ").trim()}` : "/canvas";
}

export function sessionCommands({ sessions, dialogs }: Deps) {
  return {
    "session.open": async (cmd) => {
      await assertProject(cmd.cwd); // a folder becomes a project only through the folder picker
      if (cmd.cwd === NO_PROJECT_DIR) mkdirSync(NO_PROJECT_DIR, { recursive: true });
      await sessions.open({ key: cmd.key, cwd: cmd.cwd, path: cmd.path && sessionFile(cmd.path) });
    },
    "session.move": async (cmd) => {
      await assertProject(cmd.cwd); // NO_PROJECT_DIR too: Undo moves a session back
      await sessions.move(cmd.key, cmd.cwd);
    },
    "session.prompt": (cmd) => sessions.prompt(cmd.key, cmd.text, cmd.behavior, cmd.images),
    "session.canvas": (cmd) => sessions.prompt(cmd.key, canvasCommand(cmd.title)),
    "session.commands": (cmd) => sessions.commands(cmd.key),
    "session.models": (cmd) => sessions.models(cmd.key),
    "session.model": (cmd) => sessions.setModel(cmd.key, cmd.provider, cmd.id),
    "session.dequeue": (cmd) => sessions.dequeue(cmd.key),
    "sessions.search": async (cmd) => searchSessions((await listSessions()).sessions, cmd.query, cmd.titlesOnly, cmd.cwd),
    "session.tree": (cmd) => sessions.tree(cmd.key),
    "session.navigate": (cmd) => sessions.navigate(cmd.key, cmd.id, cmd.summarize),
    "session.label": (cmd) => sessions.label(cmd.key, cmd.id, cmd.label),
    "session.fork": (cmd) => sessions.fork({ key: cmd.key, id: cmd.id, position: cmd.position === "at" ? "at" : undefined }),
    "session.compact": (cmd) => sessions.compact(cmd.key),
    "session.reload": (cmd) => sessions.reload(cmd.key),
    "session.tools": (cmd) => sessions.setTools(cmd.key, cmd.names),
    "session.abort": (cmd) => sessions.abort(cmd.key),
    "session.thinking": (cmd) => sessions.setThinking(cmd.key, cmd.level),
    "session.rename": (cmd) => sessions.rename(sessionFile(cmd.path), cmd.name),
    "session.clone": async (cmd) => {
      await assertProject(cmd.cwd);
      await sessions.clone({ key: cmd.key, cwd: cmd.cwd, path: sessionFile(cmd.path) });
    },
    "session.export": async (cmd) => {
      await assertProject(cmd.cwd);
      await sessions.exportHtml({ id: cmd.id, cwd: cmd.cwd, path: sessionFile(cmd.path) });
    },
    "session.close": (cmd) => sessions.close(sessionFile(cmd.path)),
    "ui.answer": (cmd) => dialogs.answer(cmd.id, cmd.value),
  } satisfies Partial<Handlers>;
}
