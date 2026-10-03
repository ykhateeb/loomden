type Typable = { tagName?: string; isContentEditable?: boolean };

/** True when the key goes to a field, so a single-key shortcut must not fire. */
export function isTypingTarget(target: EventTarget | Typable | null) {
  // A target that is not an element (window, document) has neither field, so it reads as not typing.
  const t = target as Typable | null;
  return !!t && (!!t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? ""));
}
