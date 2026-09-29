import type { SearchResult, SessionRow } from "../../protocol";
import { readEntries, visibleBranch } from "./summary";

const MAX_SESSIONS = 40;
const MAX_LINES = 3;

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c?.type === "text" && typeof c.text === "string" ? c.text : "")).join("\n");
}

/** The words around the first match in `s`, on one line: [before, match, after]. */
export function snippet(s: string, query: string): [string, string, string] | undefined {
  const flat = s.replace(/\s+/g, " ").trim();
  const i = flat.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return undefined;
  let start = Math.max(0, i - 50);
  let end = Math.min(flat.length, i + query.length + 90);
  if (start > 0) start = flat.indexOf(" ", start) + 1 || start; // start and end on a word
  if (end < flat.length) end = flat.lastIndexOf(" ", end) > i + query.length ? flat.lastIndexOf(" ", end) : end;
  return [(start > 0 ? "…" : "") + flat.slice(start, i), flat.slice(i, i + query.length), flat.slice(i + query.length, end) + (end < flat.length ? "…" : "")];
}

/** Board 1a: sessions whose title (or messages) contain the query, with the matching lines. */
export function searchSessions(sessions: SessionRow[], query: string, titlesOnly: boolean, cwd?: string): SearchResult[] {
  // Whitespace counts as one space everywhere: "foo bar" finds "foo\nbar".
  const q = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (!q) return [];
  const results: SearchResult[] = [];
  for (const s of sessions) {
    if (cwd && s.cwd !== cwd) continue;
    const inTitle = s.title.toLowerCase().includes(q);
    if (!inTitle && (titlesOnly || !s.text.replace(/\s+/g, " ").toLowerCase().includes(q))) continue; // the quick check before a file read
    const lines: SearchResult["lines"] = [];
    let total = inTitle ? 1 : 0;
    if (!titlesOnly) {
      try {
        // Only what the chat shows, so "open at the match" finds the message.
        for (const e of visibleBranch(readEntries(s.path))) {
          const m = e.type === "message" ? e.message : undefined;
          if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
          const hit = snippet(text(m.content), q);
          if (!hit) continue;
          total++;
          if (lines.length < MAX_LINES) lines.push({ who: m.role === "user" ? "you" : "pi", at: m.timestamp ?? 0, parts: hit });
        }
      } catch {
        // a file pi lists but cannot parse: the title match still counts
      }
    }
    if (total) results.push({ path: s.path, cwd: s.cwd, title: s.title, modified: s.modified, total, lines });
    if (results.length >= MAX_SESSIONS) break;
  }
  return results;
}
