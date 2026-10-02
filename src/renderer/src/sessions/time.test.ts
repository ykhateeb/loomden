import { expect, test } from "vitest";
import { ago, agoText } from "./time";

test("list times as in the design", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  expect(ago(now - 20_000, now)).toBe("now");
  expect(ago(now - 14 * 60_000, now)).toBe("14m");
  expect(ago(now - 2 * 3600_000, now)).toBe("2h");
  expect(ago(now - 3 * 86400_000, now)).toMatch(/^[a-z]{3}/); // a weekday, like "sat"
  expect(ago(now - 30 * 86400_000, now)).not.toMatch(/^[a-z]{3}$/); // a date
});


test("a time in a sentence: just now, or how long ago", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  expect(agoText(now - 10_000, now)).toBe("just now");
  expect(agoText(now - 5 * 60_000, now)).toBe(`${ago(now - 5 * 60_000, now)} ago`);
});
