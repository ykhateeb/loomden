# Renderer

The React UI of the window. Paths below start at `src/renderer/src/`.

## State and actions

- `store.ts` holds all state. Read it in a component with `useStore((s) => …)`, and change it with `set()`.
- Components call the `actions` object (`actions.ts`). Only `actions.ts` files and `agent-messages.ts` use `call()` from `port.ts`.
- An action that can fail catches the error and gives it to `report`, which shows it as a toast. For other messages, use `notice()`.
- `window.tenon` is the host API from main (`#preload`). Use it for native dialogs and the shell.

## UI

- Use the components in `ui/` (`Button`, `Modal`, `Menu`, `Card`, `Icon`, and the others) before you write new markup.
- `ui/theme.css` removes the default Tailwind colors. Use only the theme tokens, for example `bg-panel`, `text-muted`, and `border-line`.
- Join class names with `cx()` from `ui/base.tsx`. It knows the theme tokens, so a later class replaces an earlier class of the same kind.
- If you add a shared component, put it in `ui/` and show it in `ui/Gallery.tsx`. Look at it with `npm run gallery`.
