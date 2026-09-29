/** "now", "14m", "2h", "tue", "Sep 3" — as in the design's lists. */
export function ago(ms: number, now = Date.now()) {
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  if (min < 24 * 60) return `${Math.round(min / 60)}h`;
  if (min < 7 * 24 * 60) return new Date(ms).toLocaleDateString(undefined, { weekday: "short" }).toLowerCase();
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Board 1's groups: Today, Yesterday, This week (the last 7 days), Older. */
export function groupOf(ms: number, now = Date.now()) {
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((day(now) - day(ms)) / 86400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? "This week" : "Older";
}
