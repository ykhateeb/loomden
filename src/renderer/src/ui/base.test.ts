import { expect, test } from "vitest";
import { cx } from "./base";
test("a later class wins, and theme text sizes are not taken for colors", () => {
  expect(cx("h-6 text-xs text-muted", "h-5")).toBe("text-xs text-muted h-5");
  expect(cx("text-xs text-sub", "text-meta font-mono")).toBe("text-sub text-meta font-mono");
  expect(cx("rounded-full h-6", "h-7 rounded-md")).toBe("h-7 rounded-md");
  expect(cx("px-2.5 text-muted", "pl-[30px] text-fg")).toBe("px-2.5 pl-[30px] text-fg");
  expect(cx("text-label text-muted", false, "text-ink/75")).toBe("text-label text-ink/75");
});
