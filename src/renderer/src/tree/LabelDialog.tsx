import { useState } from "react";
import { Button, Kbd } from "#renderer/ui/base";
import { TextField } from "#renderer/ui/Field";
import { Icon } from "#renderer/ui/Icon";
import { Modal, ModalIcon } from "#renderer/ui/Modal";
import { prevented } from "#renderer/ui/keys";

/** Board 3a: L on a point in the tree. */
export function LabelDialog({ point, current, others, onSave, onClose }: {
  point: { name: string; text: string; time: string };
  current?: string;
  others: string[];
  onSave: (label: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(current ?? "");
  const save = () => (onSave(label), onClose());

  return (
    <Modal
      title="Label this point"
      subtitle="Labels show in the tree and in search"
      icon={<ModalIcon tone="accent"><Icon name="flag" size={18} /></ModalIcon>}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel<Kbd>esc</Kbd></Button>
          <span className="flex-1" />
          <Button variant="primary" onClick={save}>Save label<Kbd onFill>↵</Kbd></Button>
        </>
      }
    >
      <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-raised px-3 py-2.5">
        <span className="flex items-center gap-2"><b className="font-semibold text-fg">{point.name}</b><span className="text-xs text-muted">{point.time}</span></span>
        <span className="truncate text-sm">{point.text}</span>
      </div>
      <form onSubmit={prevented(save)}>
        <TextField
          label="Label"
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onFocus={(e) => e.target.select()}
          hint={<>{others.length > 0 && <>In this session: {others.join(" · ")} · </>}An empty label removes it.</>}
        />
      </form>
    </Modal>
  );
}
