import { useEffect } from "react";
import { homePath } from "#renderer/chat/format";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Segmented } from "#renderer/ui/controls";
import { Icon } from "#renderer/ui/Icon";
import { Callout, Card, Table, Td, Th, Tr } from "#renderer/ui/surfaces";

/** Settings › Project trust (the Packages "Change" link goes here). */
export function TrustPage() {
  const trust = useStore((s) => s.packages?.trust);
  useEffect(() => void actions.loadPackages(), []);

  return (
    <main className="flex min-h-0 flex-col gap-4 overflow-auto px-7 py-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[22px] font-[650]">Project trust</h1>
        <span className="text-muted">A project’s own .pi files (settings, extensions, skills, prompts, packages) load only when you trust it.</span>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <thead><tr><Th>Project</Th><Th>Folder</Th><Th right>Decision</Th></tr></thead>
          <tbody>
            {trust?.map((t) => (
              <Tr key={t.cwd}>
                <Td><span className="flex items-center gap-2 font-medium text-fg"><Icon name="folder" size={13} />{t.name}</span></Td>
                <Td className="font-mono text-xs">{homePath(t.cwd)}</Td>
                <Td right>
                  {t.from && <span className="mr-3 text-xs text-muted" title={t.from}>from {homePath(t.from)}</span>}
                  <Segmented
                    label={`Trust for ${t.name}`}
                    value={t.trusted === true ? "yes" : t.trusted === false ? "no" : "ask"}
                    // "Ask" removes only this project's own decision: a parent folder's decision still applies.
                    onChange={(v) => actions.setTrust(t.cwd, v === "yes" ? true : v === "no" ? false : null)}
                    options={[{ value: "yes", label: "Trusted" }, { value: "no", label: "Not trusted" }, { value: "ask", label: "Ask" }]}
                  />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Callout icon={<Icon name="alert" />}>Extensions run code on your computer. Trust only folders you know. Trust does not limit pi’s tools. They can still read and change your files.</Callout>
    </main>
  );
}
