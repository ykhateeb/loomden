import { expect, test } from "vitest";
import { ago } from "./time";

test("list times as in the design", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  expect(ago(now - 20_000, now)).toBe("now");
  expect(ago(now - 14 * 60_000, now)).toBe("14m");
  expect(ago(now - 2 * 3600_000, now)).toBe("2h");
  expect(ago(now - 3 * 86400_000, now)).toMatch(/^[a-z]{3}/); // a weekday, like "sat"
  expect(ago(now - 30 * 86400_000, now)).not.toMatch(/^[a-z]{3}$/); // a date
});

import { groupOf } from "./time";

test("board 1 groups", () => {
  const now = new Date(2026, 8, 29, 9, 0).getTime();
  expect(groupOf(new Date(2026, 8, 29, 0, 5).getTime(), now)).toBe("Today");
  expect(groupOf(new Date(2026, 8, 28, 23, 50).getTime(), now)).toBe("Yesterday");
  expect(groupOf(new Date(2026, 8, 23, 12, 0).getTime(), now)).toBe("This week");
  expect(groupOf(new Date(2026, 8, 20, 12, 0).getTime(), now)).toBe("Older");
});
