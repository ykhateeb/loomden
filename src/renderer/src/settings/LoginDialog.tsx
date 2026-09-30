import { useEffect, useState } from "react";
import { actions, useStore } from "#renderer/store";
import { Button, Kbd, Pill, Spinner } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { Modal, ModalIcon } from "#renderer/ui/Modal";

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/** Board 5b: a subscription login. The browser does the login; this waits and gives the link or the code. */
export function LoginDialog() {
  const login = useStore((s) => s.login);
  const provider = useStore((s) => s.modelsPage?.providers.find((p) => p.id === s.login?.providerId));
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // A key login only asks for the key (a password dialog); this shows for a browser or device login.
  if (!login || (login.method === "api_key" && !login.url && !login.code)) return null;
  const name = provider?.name ?? login.providerId;
  const link = login.url ?? login.code?.verificationUri;
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)));

  return (
    <Modal
      title={`Log in to ${name}`}
      aside={<Pill tone="dim">subscription</Pill>}
      icon={<ModalIcon tone="accent"><Icon name="key" size={18} /></ModalIcon>}
      onClose={actions.cancelLogin}
      keys={link ? { o: () => window.loomden.openExternal(link) } : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={actions.cancelLogin}>Cancel<Kbd>esc</Kbd></Button>
          <span className="flex-1" />
          {link && <Button onClick={() => window.loomden.openExternal(link)}><Icon name="external" size={14} />Open browser again<Kbd>O</Kbd></Button>}
        </>
      }
    >
      <div className="flex items-center gap-2.5 text-fg">
        <Spinner />
        <b className="font-semibold">{login.code ? "Waiting for the code…" : link ? "Waiting for the browser…" : login.message ?? "Starting the login…"}</b>
        <span className="font-mono text-muted">{clock(now - login.startedAt)}</span>
      </div>
      {login.code ? (
        <>
          <span>Open the page below and enter this code:</span>
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-line2 bg-code px-4 py-2 font-mono text-[22px] font-semibold tracking-[4px] text-fg">{login.code.userCode}</span>
            <Button small variant="ghost" onClick={() => copy(login.code!.userCode)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
        </>
      ) : (
        link && <span>Loomden opened your browser. Log in there with your subscription account.</span>
      )}
      {link && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">If the browser did not open, copy the link:</span>
          <div className="flex items-center gap-2 rounded-md border border-line bg-code py-1.5 pr-1.5 pl-3 font-mono text-xs text-sub">
            <span className="min-w-0 flex-1 truncate" title={link}>{link}</span>
            <Button small variant="ghost" className="h-6 px-2 text-xs" onClick={() => copy(link)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
        </div>
      )}
      {login.message && link && <span className="text-sm text-muted">{login.message}</span>}
      <span className="text-sm text-muted">The login is shared with terminal pi (<span className="font-mono">~/.pi/agent/auth.json</span>).</span>
    </Modal>
  );
}
