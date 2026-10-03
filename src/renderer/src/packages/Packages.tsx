import { useEffect, useRef, useState } from "react";
import type { GalleryItem, InstalledPackage } from "#protocol";
import { folderName, homePath } from "#renderer/chat/format";
import { ago } from "#renderer/sessions/time";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button, Chip, cx, Kbd, Label, LinkButton, pill, Pill, type PillTone, Spinner } from "#renderer/ui/base";
import { Segmented } from "#renderer/ui/controls";
import { SearchInput } from "#renderer/ui/Field";
import { Icon } from "#renderer/ui/Icon";
import { isTypingTarget } from "#renderer/ui/keys";
import { Menu, type MenuItem } from "#renderer/ui/Menu";
import { Callout, Card, CardBody, CardHeader, ListItem } from "#renderer/ui/surfaces";

type Show = "all" | "global" | "projects";
const galleryTones: Record<GalleryItem["kind"], PillTone> = { skills: "violet", extension: "orange", theme: "accent", prompts: "ok" };
const keyOf = (p: InstalledPackage) => `${p.cwd ?? ""}|${p.source}`;

/** Board 4: install extensions, skills, prompts and themes — for every project or for one. */
export function Packages() {
  const packages = useStore((s) => s.packages);
  const work = useStore((s) => s.packageWork);
  const projects = useStore((s) => s.projects);
  const [show, setShow] = useState<Show>("all");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string>();
  const [source, setSource] = useState("");
  const [forProject, setForProject] = useState<"global" | "project">("global");
  const [project, setProject] = useState<string>();
  const [projectMenu, setProjectMenu] = useState<{ x: number; y: number }>();
  const [gallery, setGallery] = useState<GalleryItem[]>();
  const [galleryError, setGalleryError] = useState<string>();
  const [galleryQuery, setGalleryQuery] = useState("");
  const screen = useRef<HTMLDivElement>(null);

  useEffect(() => void actions.loadPackages(), []);
  useEffect(() => {
    const t = setTimeout(() => {
      setGalleryError(undefined);
      actions.gallery(galleryQuery).then(setGallery, (e: Error) => (setGallery([]), setGalleryError(e.message)));
    }, 250);
    return () => clearTimeout(t);
  }, [galleryQuery]);

  const all = packages ? [...packages.global, ...packages.projects.flatMap((p) => p.packages)] : [];
  const current = all.find((p) => keyOf(p) === picked) ?? all[0];
  const q = filter.toLowerCase();
  const match = (p: InstalledPackage) => !q || p.name.toLowerCase().includes(q) || p.source.toLowerCase().includes(q);
  const installCwd = forProject === "project" ? (project ?? projects[0]?.cwd) : undefined;
  const busy = (p?: InstalledPackage) => !!p && !!work[p.source];

  const install = async () => {
    const s = source.trim().replace(/^pi install\s+/, "");
    if (s) actions.changePackage({ action: "install", source: s, cwd: installCwd, onDone: () => setSource("") });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || !current || busy(current)) return;
    const k = e.key.toLowerCase();
    if (k === "d") actions.changePackage({ action: "remove", source: current.source, cwd: current.cwd });
    if (k === "r") actions.reloadPackages();
    if (k === "u" && current.kind !== "local" && current.installed) actions.changePackage({ action: "update", source: current.source, cwd: current.cwd });
  };

  const group = (title: string, note: string, list: InstalledPackage[]) => {
    const rows = list.filter(match);
    if (!rows.length) return null;
    return (
      <section key={title} className="flex shrink-0 flex-col gap-0.5">
        <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 text-sm">
          <span className="text-muted"><Icon name={title === "Global" ? "gear" : "folder"} size={13} /></span>
          <b className="font-semibold">{title}</b>
          <span className="text-muted">{note}</span>
          <span className="ml-auto text-xs text-muted">{rows.length}</span>
        </div>
        {rows.map((p) => (
          <ListItem key={keyOf(p)} active={p === current} onClick={() => setPicked(keyOf(p))} meta={busy(p) ? <Spinner size={10} /> : <span className="font-mono">{p.version ?? p.kind}</span>}>
            <span className="text-muted"><Icon name="box" size={14} /></span>
            <span className="truncate">{p.name}</span>
            {!p.installed && <Pill tone="warn" className="h-[18px] text-[10.5px]">missing</Pill>}
          </ListItem>
        ))}
      </section>
    );
  };

  const projectItems: MenuItem[] = projects.map((p) => ({ id: p.cwd, label: p.name, icon: p.cwd === installCwd ? <Icon name="check" size={13} /> : <span className="w-[13px]" />, onSelect: () => setProject(p.cwd) }));

  return (
    <div ref={screen} tabIndex={-1} onKeyDown={onKeyDown} className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_340px] outline-none">
      <aside className="flex min-h-0 flex-col gap-3 border-r border-line bg-side p-3.5">
        <div className="flex items-center">
          <Label className="flex-1">Installed</Label>
          <span className="text-xs text-muted">{all.length} packages</span>
        </div>
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: "all", label: "All" }, { value: "global", label: "Global" }, { value: "projects", label: "Projects" }]} />
        <nav aria-label="Installed packages" className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {!packages && <span className="flex items-center gap-2 px-2.5 text-sm text-muted"><Spinner size={11} />Reading packages…</span>}
          {packages && all.length === 0 && <span className="px-2.5 text-sm text-muted">No packages yet. Install one, or pick one from the gallery.</span>}
          {packages && show !== "projects" && group("Global", "every project", packages.global)}
          {packages && show !== "global" && packages.projects.map((p) => group(p.name, "this project", p.packages))}
        </nav>
        <SearchInput icon={<Icon name="search" />} aria-label="Filter packages" placeholder="Filter packages" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </aside>

      <main className="flex min-h-0 flex-col gap-3.5 overflow-auto p-[22px] [&>*]:shrink-0">
        <Card>
          <CardHeader>
            Install a package
            <span className="ml-2 truncate text-xs font-normal text-muted">npm:name@version · git:github.com/user/repo@tag · ./local/path</span>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <form className="flex items-center gap-2" onSubmit={(e) => (e.preventDefault(), install())}>
              <label className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line2 bg-field px-3 font-mono text-body focus-within:border-accent focus-within:shadow-focus">
                <span className="text-ok">$</span>
                <span className="text-muted">pi install</span>
                <input aria-label="Package source" placeholder="npm:pi-lint-skills" value={source} onChange={(e) => setSource(e.target.value)} className="min-w-0 flex-1 bg-transparent text-fg outline-none" />
              </label>
              <Button variant="primary" type="submit" disabled={!source.trim() || busy({ source: source.trim() } as InstalledPackage)}>
                {busy({ source: source.trim() } as InstalledPackage) ? <Spinner size={12} /> : <Icon name="import" size={14} />}Install<Kbd onFill>↵</Kbd>
              </Button>
            </form>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">Install for</span>
              <Segmented label="Install for" value={forProject} onChange={setForProject} options={[{ value: "global", label: "Global · every project" }, { value: "project", label: "One project" }]} />
              {forProject === "project" && (
                <>
                  <button
                    className={pill("dim", "hover:text-fg")}
                    aria-haspopup="menu"
                    disabled={!projects.length}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setProjectMenu(projectMenu ? undefined : { x: r.left, y: r.bottom + 6 });
                    }}
                  >
                    <Icon name="folder" size={12} />
                    {installCwd ? folderName(installCwd) : "no project"}
                    <Icon name="chevronDown" size={12} />
                  </button>
                  <span className="font-mono text-xs text-muted">--local</span>
                </>
              )}
            </div>
            {Object.entries(work).map(([s, w]) => (
              <span key={s} className="flex items-center gap-2 text-sm text-sub">
                <Spinner size={11} />
                {w.action} <span className="font-mono">{s}</span>
                {w.message && <span className="truncate text-muted">· {w.message}</span>}
              </span>
            ))}
          </CardBody>
        </Card>

        {current && (
          <Card className="flex flex-col">
            <div className="flex items-center gap-3 px-3.5 pt-3.5">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-bg text-accent"><Icon name="box" size={18} /></span>
              <div className="flex min-w-0 flex-col">
                <b className="truncate text-lg font-[650]">{current.name}</b>
                <span className="text-xs text-muted">{current.scope === "global" ? "Global · every project" : `${current.cwd && folderName(current.cwd)} · this project`}</span>
              </div>
              <span className="flex-1" />
              <Button variant="danger" disabled={busy(current)} onClick={() => actions.changePackage({ action: "remove", source: current.source, cwd: current.cwd })}><Icon name="trash" size={14} />Remove<Kbd>D</Kbd></Button>
              <Button variant="ghost" onClick={actions.reloadPackages} title="Open sessions read their extensions, skills, prompts and themes again"><Icon name="refresh" size={14} />Reload<Kbd>R</Kbd></Button>
              {current.installed ? (
                <Button variant="primary" disabled={busy(current) || current.kind === "local"} title={current.kind === "local" ? "A local folder has nothing to update" : undefined} onClick={() => actions.changePackage({ action: "update", source: current.source, cwd: current.cwd })}>
                  Update<Kbd onFill>U</Kbd>
                </Button>
              ) : (
                <Button variant="primary" disabled={busy(current)} title="It is in settings but not installed" onClick={() => actions.changePackage({ action: "install", source: current.source, cwd: current.cwd })}>
                  <Icon name="import" size={14} />Install
                </Button>
              )}
            </div>
            <CardBody className="flex flex-col gap-4 pt-4">
              <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted">Version</dt>
                <dd className="text-sub">
                  <span className="font-mono">{current.kind === "local" ? "local folder" : (current.version ?? "latest")}</span>
                  {current.installedAt ? ` · installed ${ago(current.installedAt)}` : <Pill tone="warn" className="ml-2 h-5 text-label">not installed</Pill>}
                </dd>
                <dt className="text-muted">Source</dt>
                <dd className="truncate text-sub">{current.where}</dd>
                <dt className="text-muted">Saved in</dt>
                <dd className="truncate font-mono text-xs text-sub">{current.scope === "global" ? "~/.tenon/agent/settings.json" : `${current.cwd && homePath(current.cwd)}/.pi/settings.json`}</dd>
              </dl>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 xl:grid-cols-4">
                {(
                  [
                    ["Extensions", current.resources.extensions, (n: string) => n],
                    ["Skills", current.resources.skills, (n: string) => n],
                    ["Prompt templates", current.resources.prompts, (n: string) => `/${n}`],
                    ["Themes", current.resources.themes, (n: string) => n],
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
        )}
      </main>

      <aside className="flex min-h-0 flex-col gap-3 border-l border-line bg-side p-3.5">
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader>Gallery<span className="ml-auto text-xs font-normal text-muted">npm · pi-package</span></CardHeader>
          <CardBody className="flex min-h-0 flex-1 flex-col gap-3">
            <SearchInput icon={<Icon name="search" />} aria-label="Search the gallery" placeholder="Search the gallery" value={galleryQuery} onChange={(e) => setGalleryQuery(e.target.value)} />
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto [&>*]:shrink-0">
              {!gallery && <span className="flex items-center gap-2 text-sm text-muted"><Spinner size={11} />Searching npm…</span>}
              {galleryError && <span className="text-sm text-danger">{galleryError}</span>}
              {gallery?.length === 0 && !galleryError && <span className="text-sm text-muted">Nothing found</span>}
              {gallery?.map((g) => (
                <button
                  key={g.name}
                  className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                  title="Put it in the install box"
                  onClick={() => setSource(`npm:${g.name}`)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <b className="truncate font-semibold">{g.name}</b>
                    <Pill tone={galleryTones[g.kind]} className="h-5 text-label">{g.kind}</Pill>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted">{g.description}</span>
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">Packages on npm with the <Chip>pi-package</Chip> keyword.</span>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Project trust<LinkButton className="ml-auto" onClick={() => actions.openSettings("trust")}>Change</LinkButton></CardHeader>
          <CardBody className="flex flex-col gap-1.5 text-sm">
            {packages?.trust.map((t) => (
              <div key={t.cwd} className="flex items-center gap-2">
                <span className="text-muted"><Icon name="folder" size={13} /></span>
                <span className="truncate text-sub">{t.name}</span>
                <span className={cx("ml-auto shrink-0", t.trusted === true ? "text-ok" : t.trusted === false ? "text-warn" : "text-muted")}>
                  {t.trusted === true ? "✓ trusted" : t.trusted === false ? "✗ not trusted" : "not asked yet"}
                </span>
              </div>
            ))}
            <span className="text-xs text-muted">Project packages load only in trusted projects.</span>
          </CardBody>
        </Card>
      </aside>

      {projectMenu && <Menu at={projectMenu} label="Project" items={projectItems} onClose={() => setProjectMenu(undefined)} />}
    </div>
  );
}
