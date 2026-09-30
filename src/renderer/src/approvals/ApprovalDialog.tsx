import { useState } from "react";
import type { UIRequest } from "#protocol";
import { folderName } from "#renderer/chat/format";
import { actions, useStore } from "#renderer/store";
import { Button, Kbd } from "#renderer/ui/base";
import { Modal } from "#renderer/ui/Modal";

/** An extension asks the user (for example permission-gate before bash). The session waits for this answer. */
export function ApprovalDialog({ request }: { request: Exclude<UIRequest, { method: "trust" }> }) {
  const session = useStore((s) => (request.key ? s.live[request.key] : undefined));
  const [value, setValue] = useState(request.method === "editor" ? (request.placeholder ?? "") : "");
  const reply = (v: unknown) => actions.answer(request.id, v);
  const typed = request.method === "input" || request.method === "editor";

  return (
    <Modal
      title={request.title}
      subtitle={session && `${session.title} · ${folderName(session.cwd)}`}
      width={560}
      onClose={() => reply(undefined)}
      footer={
        <>
          <Button variant="ghost" onClick={() => reply(undefined)}>
            {request.method === "confirm" ? "Deny" : "Cancel"}<Kbd>esc</Kbd>
          </Button>
          <span className="flex-1" />
          {request.method === "confirm" && <Button variant="primary" autoFocus onClick={() => reply(true)}>Allow</Button>}
          {typed && <Button variant="primary" onClick={() => reply(value)}>OK</Button>}
        </>
      }
    >
      {request.method === "confirm" && (
        <div className="rounded-md border border-line bg-code px-3 py-2.5 font-mono text-sm whitespace-pre-wrap text-fg">{request.message}</div>
      )}
      {request.method === "select" &&
        request.options.map((o, i) => (
          <Button key={o} autoFocus={i === 0} onClick={() => reply(o)}>{o}</Button>
        ))}
      {typed && request.method === "input" && request.secret && (
        <input
          type="password"
          autoFocus
          aria-label={request.title}
          value={value}
          placeholder={request.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && reply(value)}
          className="h-9 rounded-md border border-line2 bg-field px-3 font-mono text-body text-fg outline-none focus:border-accent focus:shadow-focus"
        />
      )}
      {typed && !(request.method === "input" && request.secret) && (
        <textarea
          autoFocus
          rows={request.method === "editor" ? 8 : 1}
          value={value}
          placeholder={request.method === "input" ? request.placeholder : undefined}
          onChange={(e) => setValue(e.target.value)}
          className="resize-y rounded-md border border-line2 bg-field p-2.5 text-body text-fg outline-none focus:border-accent focus:shadow-focus"
        />
      )}
    </Modal>
  );
}
