/** The user types text here: a field, a text area, a select, or editable content. A one-letter key of the app must not fire. */
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** ⌘, Ctrl or ⌥ is down: the key is a shortcut, not a one-letter key of the app. */
export function hasModifier(e: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}
