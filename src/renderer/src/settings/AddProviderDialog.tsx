import { useState } from "react";
import type { FoundModel } from "#protocol";
import { actions } from "#renderer/store";
import { Button, Kbd, Spinner } from "#renderer/ui/base";
import { Checkbox, Segmented } from "#renderer/ui/controls";
import { TextField } from "#renderer/ui/Field";
import { Icon } from "#renderer/ui/Icon";
import { Modal, ModalIcon } from "#renderer/ui/Modal";

const APIS = ["openai-completions", "openai-responses", "anthropic-messages"];
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Board 5a: a server pi calls with one of these APIs, saved in Loomden's models.json. */
export function AddProviderDialog() {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:1234/v1");
  const [api, setApi] = useState(APIS[0]);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<FoundModel[]>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const close = () => actions.setAddingProvider(false);

  const find = async () => {
    setFinding(true);
    setError(undefined);
    try {
      const found = await actions.findModels(baseUrl.trim(), api, apiKey.trim() || undefined);
      setModels(found);
      setPicked(new Set(found.filter((m) => !m.embeddings).map((m) => m.id))); // embedding models cannot chat
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFinding(false);
    }
  };

  const chosen = [...(models ?? []).filter((m) => picked.has(m.id)).map((m) => ({ id: m.id, contextWindow: m.contextWindow })), ...manual.split(",").map((id) => id.trim()).filter(Boolean).map((id) => ({ id }))];
  const save = async () => {
    if (saving || !name.trim() || !chosen.length) return; // Enter in the form takes the same checks as the button
    setSaving(true);
    setError(undefined);
    try {
      await actions.addProvider({ name: name.trim(), baseUrl: baseUrl.trim(), api, apiKey: apiKey.trim() || undefined, models: chosen });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add a custom provider"
      subtitle={<>A server pi calls with one of these APIs · saved in <span className="font-mono">~/.loomden/agent/models.json</span></>}
      icon={<ModalIcon tone="accent"><Icon name="server" size={18} /></ModalIcon>}
      width={640}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" disabled={finding || !baseUrl.trim()} onClick={find}>{finding ? <Spinner size={12} /> : <Icon name="search" size={14} />}Find models</Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={close}>Cancel<Kbd>esc</Kbd></Button>
          <Button variant="primary" disabled={saving || !name.trim() || !chosen.length} onClick={save}>Add provider<Kbd onFill>↵</Kbd></Button>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), save())}>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Name" autoFocus placeholder="lm-studio" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">API</span>
          <Segmented label="API" value={api} onChange={setApi} options={APIS.map((a) => ({ value: a, label: <span className="font-mono text-xs">{a}</span> }))} />
        </div>
        <TextField label="API key" type="password" placeholder="Optional for a local server" value={apiKey} onChange={(e) => setApiKey(e.target.value)} hint="Saved in models.json (only readable by you)." />
        <button type="submit" hidden />
      </form>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-xs font-medium text-muted">
          Models{models && <span>{models.length} found</span>}
        </span>
        {models?.length ? (
          <div className="flex max-h-44 flex-col gap-1 overflow-auto rounded-lg border border-line bg-raised p-2">
            {models.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-1 hover:bg-hover">
                <Checkbox label={m.id} on={picked.has(m.id)} onChange={(on) => setPicked((p) => { const n = new Set(p); on ? n.add(m.id) : n.delete(m.id); return n; })} />
                <span className="font-mono text-sm text-fg">{m.id}</span>
                <span className="ml-auto text-xs text-muted">{m.embeddings ? "embeddings · not for chat" : m.contextWindow ? `context ${k(m.contextWindow)}` : ""}</span>
              </label>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted">Press “Find models” to ask the server, or type model ids below.</span>
        )}
        <TextField label="More model ids (comma-separated)" placeholder="qwen3-coder-30b" value={manual} onChange={(e) => setManual(e.target.value)} />
      </div>
      {error && <span className="text-sm text-danger">{error}</span>}
    </Modal>
  );
}
