import { expect, test } from "vitest";
import { isTypingTarget } from "./keys";

test("fields and editable elements are typing targets, other elements are not", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(isTypingTarget({ tagName })).toBe(true);
  expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
  expect(isTypingTarget({ tagName: "BUTTON", isContentEditable: false })).toBe(false);
  expect(isTypingTarget({})).toBe(false);
  expect(isTypingTarget(null)).toBe(false);
});
