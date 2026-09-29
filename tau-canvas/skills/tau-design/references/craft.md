# Craft

- Design the real screen, not a wireframe. Use real copy, real numbers, and real states (empty, filled, error).
- Match the running app. If code exists, read the screen it replaces before you draw.
- Use the design system by token name. If a value is missing, say so and propose a token. Do not invent a hex.
- One idea per board. Split a long flow into boards, one screen each, linked in order.
- Touch targets are at least 44px high. Text contrast passes AA. Every input has a `<label>`.
- Keep the HTML small and plain. No framework, no script. Flex and grid are enough.
- Name boards by screen: `cart`, `delivery`, `payment`. Order them by the flow.
- After a note, change only what it asks for. Do not restyle the rest of the board.
