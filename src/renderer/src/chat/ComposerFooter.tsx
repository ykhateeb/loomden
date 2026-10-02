import { useState } from "react";
import type { LiveState, ModelChoice } from "#protocol";
import { actions } from "#renderer/actions";
import { Button, IconButton, pill } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { checkMark, Menu, type MenuState } from "#renderer/ui/Menu";

/** The height of a menu row: a menu opens above the box, as high as its rows. */
const MENU_ROW_PX = 34;

/** Board 2: the bar under the message box: model, thinking level, attach, stop, and send. */
export function ComposerFooter({ sessionKey, state, canSend, onSend, onAttach }: {
  sessionKey: string;
  state: LiveState;
  canSend: boolean;
  onSend: () => void;
  onAttach: () => void;
}) {
  const [menu, setMenu] = useState<MenuState>();

  const openModels = async (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const models: ModelChoice[] = await actions.models(sessionKey);
    setMenu({
      at: { x: r.left, y: r.top - Math.min(models.length * MENU_ROW_PX + 16, 360) - 8 },
      label: "Model",
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

  const openThinking = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({
      at: { x: r.left, y: r.top - state.thinkingLevels.length * MENU_ROW_PX - 24 },
      label: "Thinking",
      items: state.thinkingLevels.map((l) => ({ id: l, label: l, icon: checkMark(l === state.thinking), onSelect: () => actions.setThinking(sessionKey, l) })),
    });
  };

  return (
    <>
      <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
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
        <IconButton size={28} label="Attach files" onClick={onAttach}>
          <Icon name="clip" />
        </IconButton>
        <span className="flex-1" />
        {state.streaming && (
          <Button small variant="danger" onClick={() => actions.abort(sessionKey)}>
            <Icon name="stop" size={14} />Stop
          </Button>
        )}
        <Button small variant="primary" disabled={!canSend} onClick={onSend}>
          Send<Icon name="send" size={14} />
        </Button>
      </div>
      {menu && <Menu at={menu.at} label={menu.label} items={menu.items} width={menu.label === "Model" ? 300 : 180} onClose={() => setMenu(undefined)} />}
    </>
  );
}
