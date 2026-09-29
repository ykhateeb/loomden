export const time = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** "Today · 03:12", "Yesterday · 18:40", "Mon, Sep 21 · 09:05". */
export function dayLabel(ts: number, now = Date.now()) {
  const day = (t: number) => new Date(t).toDateString();
  const name =
    day(ts) === day(now) ? "Today" : day(ts) === day(now - 86400_000) ? "Yesterday" : new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${name} · ${time(ts)}`;
}

/** pi's display diff: "+19 new line", "-21 old line", " 20 context". */
export function diffCounts(diff: string) {
  const lines = diff.split("\n");
  return { added: lines.filter((l) => l.startsWith("+")).length, removed: lines.filter((l) => l.startsWith("-")).length };
}

export type Trigger = { kind: "/" | "@"; query: string; start: number; end: number };

/**
 * What the caret is typing: "/name" at the start of the message (a command), or "@path" anywhere (a file).
 * start/end cover the typed token, so a pick can replace it.
 */
export function findTrigger(text: string, caret: number): Trigger | undefined {
  const before = text.slice(0, caret);
  const slash = /^\/(\S*)$/.exec(before);
  if (slash) return { kind: "/", query: slash[1], start: 0, end: caret };
  const at = /(^|\s)@(\S*)$/.exec(before);
  if (at) return { kind: "@", query: at[2], start: caret - at[2].length - 1, end: caret };
  return undefined;
}

/** Replace the typed token with the pick, and a space after it. Returns the new text and caret. */
export function applyPick(text: string, t: Trigger, pick: string) {
  const insert = `${t.kind}${pick} `;
  const rest = text.slice(t.end).replace(/^\S*/, ""); // the rest of a token the caret was inside
  return { text: text.slice(0, t.start) + insert + rest.replace(/^ /, ""), caret: t.start + insert.length };
}

export type DiffLine = { kind: "add" | "del" | "ctx" | "skip"; n?: number; text: string };

/**
 * Parse pi's diff string (one "<+|-| ><padded line number> <text>" line per row; a skip row is
 * " <padding> ...") into structured rows for the design system's 3-column Diff grid.
 */
export function parseDiff(diff: string): DiffLine[] {
  return diff.split("\n").map((line) => {
    const m = /^([+\- ])(\s*\d*)\s(.*)$/.exec(line);
    if (!m) return { kind: "ctx", text: line };
    const [, sign, numStr, text] = m;
    const n = numStr.trim() ? Number(numStr) : undefined;
    const kind = sign === "+" ? "add" : sign === "-" ? "del" : n === undefined && text === "..." ? "skip" : "ctx";
    return { kind, n, text };
  });
}
