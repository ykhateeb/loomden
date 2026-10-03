import { useEffect, useRef, useState } from "react";
import { DIALOG_CANCELLED, type ImportItem, type ImportScan } from "#protocol";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button, cx, Kbd, Spinner } from "#renderer/ui/base";
import { Checkbox } from "#renderer/ui/controls";
import { Icon } from "#renderer/ui/Icon";
import { Modal, ModalIcon } from "#renderer/ui/Modal";

const SEEN = "tenon.importOffered";

/** Board 5c and 5d: bring settings, providers, trust, resources and packages over from terminal pi. */
export function ImportDialog() {
  const work = useStore((s) => s.packageWork);
  const [scan, setScan] = useState<ImportScan>();
  const [picked, setPicked] = useState<Set<ImportItem>>(new Set());
  const [running, setRunning] = useState(false);
  const results = useStore((s) => s.importResults);
  // The result screen shows after the first import that the user confirmed.
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string>();
  const close = () => actions.setImporting(false);
  const importButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    actions.scanImport().then((s) => {
      setScan(s);
      setPicked(new Set(s.items.filter((i) => i.count > 0 && !i.done).map((i) => i.id)));
      requestAnimationFrame(() => importButton.current?.focus()); // it was disabled until now, so it could not take the first focus
    }, (e: Error) => setError(e.message));
  }, []);

  // A retry runs only what did not finish, and keeps the results of the rest.
  const start = async (only?: ImportItem[]) => {
    setRunning(true);
    setError(undefined);
    try {
      await actions.runImport(only ?? [...picked]);
      setImported(true);
    } catch (e) {
      const cancelled = (e as Error).message.includes(DIALOG_CANCELLED);
      if (!cancelled) setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  if (imported && scan) {
    const done = results.filter((r) => r.status === "done").length;
    const failedIds = results.filter((r) => r.status !== "done").map((r) => r.id);
    const failed = failedIds.length > 0;
    return (
      <Modal
        title="Import from pi"
        aside={<span className="text-sm text-muted">{done} of {results.length} done</span>}
        icon={<ModalIcon tone="accent"><Icon name="download" size={18} /></ModalIcon>}
        width={600}
        onClose={close}
        footer={
          <>
            {failed && <Button variant="ghost" onClick={() => start(failedIds)} disabled={running}>{running ? <Spinner size={12} /> : <Icon name="refresh" size={14} />}Retry failed<Kbd>R</Kbd></Button>}
            <span className="flex-1" />
            <Button variant="primary" autoFocus onClick={close}>Close<Kbd onFill>↵</Kbd></Button>
          </>
        }
        keys={failed ? { r: () => start(failedIds) } : undefined}
      >
        <ul className="flex flex-col gap-2">
          {scan.items.map((item) => {
            const r = results.find((x) => x.id === item.id);
            return (
              <li key={item.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5">
                  <span className={cx("flex", !r ? "text-dim" : r.status === "done" ? "text-ok" : r.status === "partial" ? "text-warn" : "text-danger")}>
                    <Icon name={!r ? "check" : r.status === "done" ? "check" : "alert"} size={15} />
                  </span>
                  <span className={r || item.done ? "text-fg" : "text-muted"}>{item.label}</span>
                  <span className="ml-auto text-sm text-muted">{r ? r.detail : item.done ? `${item.action.toLowerCase()} · ${item.detail}` : "not picked"}</span>
                </div>
                {r?.errors.map((e) => <span key={e} className="pl-7 font-mono text-xs text-danger">{e}</span>)}
                {r?.notes?.map((n) => <span key={n} className="pl-7 font-mono text-xs text-warn">{n}</span>)}
              </li>
            );
          })}
        </ul>
        {Object.keys(work).length > 0 && <span className="flex items-center gap-2 text-sm text-muted"><Spinner size={11} />{Object.keys(work).join(", ")}</span>}
        <span className="text-sm text-muted">Installed packages show in the Packages tab. Changes load after Reload or a new session.</span>
      </Modal>
    );
  }

  return (
    <Modal
      title="Import from pi"
      subtitle={<span className="font-mono">~/.pi/agent</span>}
      icon={<ModalIcon tone="accent"><Icon name="download" size={18} /></ModalIcon>}
      width={600}
      onClose={close}
      footer={
        <>
          <span className="text-xs text-muted">Later: Settings › Import from pi</span>
          <span className="flex-1" />
          <Button variant="ghost" onClick={close}>Not now<Kbd>esc</Kbd></Button>
          <Button ref={importButton} variant="primary" disabled={running || !picked.size} onClick={() => start()}>
            {running && <Spinner size={12} />}Import<Kbd onFill>↵</Kbd>
          </Button>
        </>
      }
    >
      <span>Tenon keeps its own pi folder. Pick what to bring over from terminal pi. Tenon reads <span className="font-mono">~/.pi</span> and never changes it, except the shared keys file.</span>
      {!scan && !error && <span className="flex items-center gap-2 text-muted"><Spinner size={11} />Reading ~/.pi/agent…</span>}
      {scan && !scan.found && <span className="text-muted">No terminal pi folder was found. There is nothing to import.</span>}
      {scan?.found && (
        <ul className="flex flex-col gap-1 rounded-lg border border-line bg-raised p-1.5">
          {scan.items.map((item) => (
            <li key={item.id}>
              <label className={cx("flex items-center gap-2.5 rounded-sm px-2 py-1.5", item.count && !item.done ? "cursor-pointer hover:bg-hover" : "")}>
                {item.done ? (
                  <span className="flex size-4 items-center justify-center text-ok"><Icon name="check" size={14} /></span>
                ) : (
                  <Checkbox label={item.label} on={picked.has(item.id)} onChange={(on) => setPicked((p) => { const n = new Set(p); on ? n.add(item.id) : n.delete(item.id); return n; })} />
                )}
                <span className={item.count ? "text-fg" : "text-muted"}>{item.label}</span>
                <span className="ml-auto text-sm text-muted">
                  <span className="text-sub">{item.action}</span> {item.detail}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <span className="text-sm text-muted">
        Keys and logins stay one file, so a new key shows in both apps. Packages install again for Tenon’s pi version. This can take a minute. Sessions stay in terminal pi.
      </span>
      {error && <span className="text-sm text-danger">{error}</span>}
    </Modal>
  );
}

/** Board 5c "on the first start": offer the import once, if terminal pi has something to bring. */
export function useFirstStartImport(connected: boolean) {
  useEffect(() => {
    if (!connected) return;
    try {
      if (localStorage.getItem(SEEN)) return;
    } catch {
      return; // no storage: do not offer on every start
    }
    actions.scanImport().then(
      (s) => {
        try {
          localStorage.setItem(SEEN, "1"); // only after a scan that worked: a failed one offers again next start
        } catch {
          // offered anyway
        }
        if (s.found && s.items.some((i) => i.count > 0 && !i.done)) actions.setImporting(true);
      },
      () => {},
    );
  }, [connected]);
}
