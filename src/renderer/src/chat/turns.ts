import type { AgentMessage } from "#protocol";

export type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;

/** One row of the chat: a date line, a message, or one turn of pi (its messages up to the next user message). */
export type ChatRow =
  | { kind: "day"; key: string; at: number }
  | { kind: "message"; key: string; message: AgentMessage }
  | { kind: "turn"; key: string; parts: AssistantMessage[] };

/**
 * The rows of a chat. A date line comes before a user message on a new day. pi's messages up to the next user
 * message are one turn: tool results go into the turn, and the turn keeps the key of its first message, so a card
 * that is open stays open while the turn grows.
 */
export function groupTurns(messages: readonly AgentMessage[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay = "";
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const day = new Date(m.timestamp).toDateString();
    if (m.role === "user" && day !== lastDay) rows.push({ kind: "day", key: `d${i}`, at: m.timestamp });
    if (m.role === "user") lastDay = day;
    if (m.role !== "assistant") {
      rows.push({ kind: "message", key: String(i), message: m });
      continue;
    }
    const start = i;
    const parts: AssistantMessage[] = [m];
    while (i + 1 < messages.length && (messages[i + 1].role === "assistant" || messages[i + 1].role === "toolResult")) {
      const next = messages[++i];
      if (next.role === "assistant") parts.push(next);
    }
    rows.push({ kind: "turn", key: String(start), parts });
  }
  return rows;
}
