import { useState } from "react";
import type { SessionRow } from "#protocol";
import { folderName } from "#renderer/chat/format";
import { actions } from "#renderer/store";
import { Button, Kbd } from "#renderer/ui/base";
import { TextField } from "#renderer/ui/Field";
import { Modal } from "#renderer/ui/Modal";

/** Board 2d: right-click › Rename…, or R. */
export function RenameDialog({ session, onClose }: { session: SessionRow; onClose: () => void }) {
  const [name, setName] = useState(session.title);
  const save = () => {
    if (name.trim() && name.trim() !== session.title) actions.rename(session.path, name.trim());
    onClose();
  };

  return (
    <Modal
      title="Rename session"
      aside={<span className="text-xs text-muted">{folderName(session.cwd)}</span>}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel<Kbd>esc</Kbd></Button>
          <span className="flex-1" />
          <Button variant="primary" disabled={!name.trim()} onClick={save}>Rename<Kbd onFill>↵</Kbd></Button>
        </>
      }
    >
      <form onSubmit={(e) => (e.preventDefault(), save())}>
        <TextField label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
      </form>
    </Modal>
  );
}
