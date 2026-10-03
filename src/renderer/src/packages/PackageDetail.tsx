import type { InstalledPackage } from "#protocol";
import { folderName, homePath } from "#renderer/chat/format";
import { ago } from "#renderer/sessions/time";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button, Chip, Kbd, Label, Pill } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { Callout, Card, CardBody } from "#renderer/ui/surfaces";

/** One installed package: its actions, where it comes from, and what it adds. */
export function PackageDetail({ pkg }: { pkg: InstalledPackage }) {
  const busy = useStore((s) => !!s.packageWork[pkg.source]);

  return (
    <Card className="flex flex-col">
      <div className="flex items-center gap-3 px-3.5 pt-3.5">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-bg text-accent"><Icon name="box" size={18} /></span>
        <div className="flex min-w-0 flex-col">
          <b className="truncate text-lg font-[650]">{pkg.name}</b>
          <span className="text-xs text-muted">{pkg.scope === "global" ? "Global · every project" : `${pkg.cwd && folderName(pkg.cwd)} · this project`}</span>
        </div>
        <span className="flex-1" />
        <Button variant="danger" disabled={busy} onClick={() => actions.changePackage({ action: "remove", source: pkg.source, cwd: pkg.cwd })}><Icon name="trash" size={14} />Remove<Kbd>D</Kbd></Button>
        <Button variant="ghost" onClick={actions.reloadPackages} title="Open sessions read their extensions, skills, prompts and themes again"><Icon name="refresh" size={14} />Reload<Kbd>R</Kbd></Button>
        {pkg.installed ? (
          <Button variant="primary" disabled={busy || pkg.kind === "local"} title={pkg.kind === "local" ? "A local folder has nothing to update" : undefined} onClick={() => actions.changePackage({ action: "update", source: pkg.source, cwd: pkg.cwd })}>
            Update<Kbd onFill>U</Kbd>
          </Button>
        ) : (
          <Button variant="primary" disabled={busy} title="It is in settings but not installed" onClick={() => actions.changePackage({ action: "install", source: pkg.source, cwd: pkg.cwd })}>
            <Icon name="import" size={14} />Install
          </Button>
        )}
      </div>
      <CardBody className="flex flex-col gap-4 pt-4">
        <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">Version</dt>
          <dd className="text-sub">
            <span className="font-mono">{pkg.kind === "local" ? "local folder" : (pkg.version ?? "latest")}</span>
            {pkg.installedAt ? ` · installed ${ago(pkg.installedAt)}` : <Pill tone="warn" className="ml-2 h-5 text-label">not installed</Pill>}
          </dd>
          <dt className="text-muted">Source</dt>
          <dd className="truncate text-sub">{pkg.where}</dd>
          <dt className="text-muted">Saved in</dt>
          <dd className="truncate font-mono text-xs text-sub">{pkg.scope === "global" ? "~/.tenon/agent/settings.json" : `${pkg.cwd && homePath(pkg.cwd)}/.pi/settings.json`}</dd>
        </dl>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 xl:grid-cols-4">
          {(
            [
              ["Extensions", pkg.resources.extensions, (n: string) => n],
              ["Skills", pkg.resources.skills, (n: string) => n],
              ["Prompt templates", pkg.resources.prompts, (n: string) => `/${n}`],
              ["Themes", pkg.resources.themes, (n: string) => n],
            ] as const
          ).map(([title, names, show]) => (
            <div key={title} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2"><Label>{title}</Label><span className="text-xs text-muted">{names.length}</span></div>
              {names.length ? names.map((n) => <span key={n} className="truncate font-mono text-sm text-fg">{show(n)}</span>) : <span className="font-mono text-sm text-dim">none</span>}
            </div>
          ))}
        </div>
        <Callout icon={<Icon name="alert" />}>
          Extensions run code on your computer with your own permissions.
          <span className="block text-muted">Changes load after <Chip>/reload</Chip> or a new session.</span>
        </Callout>
      </CardBody>
    </Card>
  );
}
