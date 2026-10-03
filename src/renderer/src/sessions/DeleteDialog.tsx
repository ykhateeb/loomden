import type { SessionRow } from "#protocol";
import { folderName } from "#renderer/chat/format";
import { actions } from "#renderer/actions";
import { Button, Kbd } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { Modal, ModalIcon } from "#renderer/ui/Modal";
import { agoText } from "./time";

/** Board 2e: the session file goes to the Trash. */
export function DeleteDialog({ session, onClose }: { session: SessionRow; onClose: () => void }) {
  const remove = () => {
    onClose();
    actions.deleteSession(session.path);
  };

  return (
    <Modal
      title="Delete this session?"
      icon={<ModalIcon tone="danger"><Icon name="trash" size={18} /></ModalIcon>}
      onClose={onClose}
      keys={{ d: remove }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel<Kbd>esc</Kbd></Button>
          <span className="flex-1" />
          <Button variant="dangerFill" autoFocus onClick={remove}>
            <Icon name="trash" size={14} />Delete<Kbd onFill>D</Kbd>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-raised px-3 py-2.5">
        <b className="font-semibold text-fg">{session.title}</b>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="flex items-center gap-1"><Icon name="folder" size={12} />{folderName(session.cwd)}</span>
          {session.messageCount} messages · last used {agoText(session.modified)}
        </span>
      </div>
      <span>The session file goes to the Trash. You can get it back from there.</span>
    </Modal>
  );
}
