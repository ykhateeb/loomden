// A menu opens above its button, so its height is estimated before it renders.
const ROW_HEIGHT = 34;
const MENU_PADDING = 16;
const GAP = 8;
export const MENU_MAX_HEIGHT = 360;

/** The height of a menu with `rows` rows: the same cap as the menu, which scrolls past it. */
export function menuHeight(rows: number) {
  return Math.min(rows * ROW_HEIGHT + MENU_PADDING, MENU_MAX_HEIGHT);
}

/** Where a menu with `rows` rows starts, so that it ends just above the button. */
export function menuAbove(button: { left: number; top: number }, rows: number) {
  return { x: button.left, y: button.top - menuHeight(rows) - GAP };
}
