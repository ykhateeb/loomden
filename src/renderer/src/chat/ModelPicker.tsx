import { useState } from "react";
import type { LiveState, ModelChoice } from "#protocol";
import { actions } from "#renderer/actions";
import { pill } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { Menu, type MenuItem } from "#renderer/ui/Menu";
import { MENU_MAX_HEIGHT, menuAbove } from "./menu-position";

const MODEL_MENU_WIDTH = 300;
const THINKING_MENU_WIDTH = 180;

type OpenMenu = { at: { x: number; y: number }; items: MenuItem[]; label: string; width: number };

/** Board 2: the model and thinking-level buttons under the message box, and their menus. */
export function ModelPicker({ sessionKey, state }: { sessionKey: string; state: LiveState }) {
  const [menu, setMenu] = useState<OpenMenu>();

  const openModels = async (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const models: ModelChoice[] = await actions.models(sessionKey);
    setMenu({
      at: menuAbove(r, Math.max(models.length, 1)), // no models still shows one row
      label: "Model",
      width: MODEL_MENU_WIDTH,
      items: models.length
        ? models.map((m) => ({
            id: `${m.provider}/${m.id}`,
            label: m.id,
            meta: m.provider,
            icon: checkMark(m.id === state.model && m.provider === state.provider),
            onSelect: () => actions.setModel(sessionKey, m.provider, m.id),
          }))
        : [{ label: "No models: add a key in Settings", disabled: true, onSelect: () => {} }],
    });
  };

  const openThinking = (el: HTMLElement) =>
    setMenu({
      at: menuAbove(el.getBoundingClientRect(), state.thinkingLevels.length),
      label: "Thinking",
      width: THINKING_MENU_WIDTH,
      items: state.thinkingLevels.map((l) => ({ id: l, label: l, icon: checkMark(l === state.thinking), onSelect: () => actions.thinking(sessionKey, l) })),
    });

  return (
    <>
      <button className={pill("dim", "h-7 rounded-md hover:text-fg")} aria-haspopup="menu" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => openModels(e.currentTarget)}>
        <span className="text-accent"><Icon name="sparkle" size={13} /></span>
        {state.model ?? "No model"}
        <Icon name="chevronDown" size={12} />
      </button>
      {state.thinkingLevels.length > 0 && (
        <button className={pill("dim", "h-7 rounded-md hover:text-fg")} aria-haspopup="menu" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => openThinking(e.currentTarget)}>
          Thinking: {state.thinking}
          <Icon name="chevronDown" size={12} />
        </button>
      )}
      {menu && <Menu at={menu.at} label={menu.label} items={menu.items} width={menu.width} maxHeight={MENU_MAX_HEIGHT} onClose={() => setMenu(undefined)} />}
    </>
  );
}

function checkMark(on: boolean) {
  return on ? <Icon name="check" size={13} /> : <span className="w-[13px]" />;
}
