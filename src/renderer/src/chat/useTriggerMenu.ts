import { useEffect, useState } from "react";
import type { SlashCommand } from "#protocol";
import { actions } from "#renderer/actions";
import type { Row } from "./CommandMenu";
import { findTrigger } from "./format";

/**
 * Board 2c: the / command and @ file list for the text at the caret.
 * `trigger` is set only while the list shows.
 */
export function useTriggerMenu({ sessionKey, cwd, text, caret }: { sessionKey: string; cwd: string; text: string; caret: number }) {
  const [commands, setCommands] = useState<SlashCommand[]>();
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false); // Esc hides the list until the next keystroke

  const trigger = closed ? undefined : findTrigger(text, caret);
  const q = trigger?.query.toLowerCase() ?? "";

  // Commands load once, on the first "/"; files load for each @ query.
  useEffect(() => {
    if (trigger?.kind === "/" && !commands) actions.commands(sessionKey).then(setCommands);
  }, [trigger?.kind, commands, sessionKey]);
  useEffect(() => {
    if (trigger?.kind !== "@") return;
    const t = setTimeout(() => actions.searchFiles(cwd, trigger.query).then(setFiles), 120);
    return () => clearTimeout(t);
  }, [trigger?.kind, trigger?.query, cwd]);

  const rows: Row[] =
    trigger?.kind === "/"
      ? (commands ?? []).filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({ value: c.name, label: `/${c.name}`, description: c.description, source: c.source }))
      : trigger?.kind === "@"
        ? files.map((f) => ({ value: f, label: f }))
        : [];
  const open = !!trigger && (trigger.kind === "@" || !!commands);
  const current = Math.min(active, Math.max(rows.length - 1, 0));

  return {
    trigger: open ? trigger : undefined,
    rows,
    current,
    setActive,
    /** Move the highlight by `step` rows, round the list. */
    move: (step: number) => setActive((current + step + rows.length) % rows.length),
    close: () => setClosed(true),
    /** Show the list again after an edit, from its first row. */
    reset: () => (setActive(0), setClosed(false)),
  };
}
