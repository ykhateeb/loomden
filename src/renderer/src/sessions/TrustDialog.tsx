import type { TrustAnswer, UIRequest } from "../../../protocol";
import { actions } from "../store";
import { Button, Kbd } from "../ui/base";
import { Icon } from "../ui/Icon";
import { Modal, ModalIcon } from "../ui/Modal";
import { Callout } from "../ui/surfaces";

/** Board 1 (tweak): a project folder with its own .pi files asks before they load. */
export function TrustDialog({ request }: { request: Extract<UIRequest, { method: "trust" }> }) {
  const reply = (value: TrustAnswer | undefined) => actions.answer(request.id, value);

  return (
    <Modal
      title="Trust this project?"
      subtitle={<span className="font-mono">{request.cwd.replace(/^\/Users\/[^/]+/, "~")}</span>}
      icon={<ModalIcon tone="warn"><Icon name="shield" size={18} /></ModalIcon>}
      width={560}
      onClose={() => reply(undefined)}
      keys={{ n: () => reply("once"), t: () => reply("trust") }}
      footer={
        <>
          <Button variant="ghost" onClick={() => reply(undefined)}>Cancel<Kbd>esc</Kbd></Button>
          <span className="flex-1" />
          <Button onClick={() => reply("once")}>Open without project files<Kbd>N</Kbd></Button>
          <Button variant="primary" autoFocus onClick={() => reply("trust")}>Trust<Kbd onFill>T</Kbd></Button>
        </>
      }
    >
      <span>This folder has its own pi files. pi only loads them if you trust the project.</span>
      {request.files.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-line bg-raised px-3 py-2.5 font-mono text-sm">
          {request.files.map((f) => (
            <li key={f.name} className="flex items-center gap-2 text-fg">
              <span className="text-muted"><Icon name={f.name.endsWith("/") ? "folder" : "file"} size={13} /></span>
              {f.name}
              {f.detail && <span className="ml-auto font-sans text-xs text-muted">{f.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      <Callout icon={<Icon name="warning" />}>
        Extensions run code on your computer. Trust only folders you know. Trust does not limit pi’s tools. They can still read and change your files.
      </Callout>
    </Modal>
  );
}
