import { useEffect, useState } from "react";
import type { SlashCommand } from "#protocol";
import { actions } from "#renderer/actions";
import type { Row } from "./CommandMenu";
import { findTrigger, type Trigger } from "./format";

/** Wait for a short pause in typing before the @ menu searches files. */
const FILE_SEARCH_DEBOUNCE_MS = 120;

/**
 * Board 2c: the / and @ menu of the message box: what the caret types, the rows to pick from, and the active row.
 * Commands load once, on the first "/"; files load for each @ query.
 */
export function useCompletion({ text, caret, sessionKey, cwd }: { text: string; caret: number; sessionKey: string; cwd: string }) {
  const [commands, setCommands] = useState<SlashCommand[]>();
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false); // Esc hides the list until the next keystroke
  const trigger = closed ? undefined : findTrigger(text, caret);

  useEffect(() => {
    if (trigger?.kind === "/" && !commands) actions.commands(sessionKey).then(setCommands);
  }, [trigger?.kind, commands, sessionKey]);
  useEffect(() => {
    if (trigger?.kind !== "@") return;
    const t = setTimeout(() => actions.searchFiles(cwd, trigger.query).then(setFiles), FILE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [trigger?.kind, trigger?.query, cwd]);

  const rows = rowsFor(trigger, commands, files);
  const listOpen = !!trigger && (trigger.kind === "@" || !!commands);
  return {
    trigger,
    rows,
    listOpen,
    /** The active row, kept inside the list when it gets shorter. */
    current: Math.min(active, Math.max(rows.length - 1, 0)),
    setActive,
    /** Esc: hide the list until the next keystroke. */
    close: () => setClosed(true),
    /** A keystroke or an edit: the list shows again, from its first row. */
    reopen: () => {
      setActive(0);
      setClosed(false);
    },
  };
}

function rowsFor(trigger: Trigger | undefined, commands: SlashCommand[] | undefined, files: string[]): Row[] {
  if (trigger?.kind === "@") return files.map((f) => ({ value: f, label: f }));
  if (trigger?.kind !== "/") return [];
  const q = trigger.query.toLowerCase();
  return (commands ?? []).filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({ value: c.name, label: `/${c.name}`, description: c.description, source: c.source }));
}
