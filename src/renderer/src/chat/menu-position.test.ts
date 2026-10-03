import { describe, expect, test } from "vitest";
import { MENU_MAX_HEIGHT, menuAbove, menuHeight } from "./menu-position";

describe("menuAbove", () => {
  const button = { left: 300, top: 700 };

  test("a menu with 3 rows ends above the button", () => {
    const { x, y } = menuAbove(button, 3);
    expect(x).toBe(300);
    expect(y + menuHeight(3)).toBeLessThan(button.top);
  });

  test("a menu with more rows than the cap fits is as high as the cap", () => {
    expect(menuHeight(1000)).toBe(MENU_MAX_HEIGHT);
    expect(menuAbove(button, 1000).y + MENU_MAX_HEIGHT).toBeLessThan(button.top);
  });
});
