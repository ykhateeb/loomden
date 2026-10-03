/** How the pages show a project trust decision. */
export const TRUST = {
  yes: { trusted: true, status: "✓ trusted", className: "text-ok" },
  no: { trusted: false, status: "✗ not trusted", className: "text-warn" },
  ask: { trusted: null, status: "not asked yet", className: "text-muted" },
} as const;

/** `null` means that the user was not asked yet. */
export function trustChoice(trusted: boolean | null) {
  if (trusted === null) return "ask";
  return trusted ? "yes" : "no";
}
