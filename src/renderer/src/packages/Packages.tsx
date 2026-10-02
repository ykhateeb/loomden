import { useEffect, useRef, useState } from "react";
import type { InstalledPackage } from "#protocol";
import { folderName } from "#renderer/chat/format";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button, cx, Kbd, Label, LinkButton, pill, Pill, Spinner } from "#renderer/ui/base";
import { Segmented } from "#renderer/ui/controls";
import { SearchInput } from "#renderer/ui/Field";
import { Icon } from "#renderer/ui/Icon";
import { checkMark, Menu, type MenuItem } from "#renderer/ui/Menu";
import { Card, CardBody, CardHeader, ListItem } from "#renderer/ui/surfaces";
import { hasModifier, isTyping, prevented } from "#renderer/ui/keys";
import { GalleryPanel } from "./GalleryPanel";
import { PackageDetail } from "./PackageDetail";

type Show = "all" | "global" | "projects";
/** How the trust card shows each decision: true, false, or null (not asked yet). */
const TRUST_VIEW: Record<string, { color: string; text: string }> = {
  true: { color: "text-ok", text: "✓ trusted" },
  false: { color: "text-warn", text: "✗ not trusted" },
  null: { color: "text-muted", text: "not asked yet" },
};
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
  const screen = useRef<HTMLDivElement>(null);

  useEffect(() => void actions.loadPackages(), []);

  const all = packages ? [...packages.global, ...packages.projects.flatMap((p) => p.packages)] : [];
  const current = all.find((p) => keyOf(p) === picked) ?? all[0];
  const q = filter.toLowerCase();
  const match = (p: InstalledPackage) => !q || p.name.toLowerCase().includes(q) || p.source.toLowerCase().includes(q);
  const installCwd = forProject === "project" ? (project ?? projects[0]?.cwd) : undefined;
  const busy = (p?: InstalledPackage) => !!p && !!work[p.source];
  const installing = !!work[source.trim()]; // the package in the field is being installed

  const install = async () => {
    const s = source.trim().replace(/^pi install\s+/, "");
    if (s) actions.changePackage({ action: "install", source: s, cwd: installCwd, onDone: () => setSource("") });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTyping(e.target) || hasModifier(e) || !current || busy(current)) return;
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

  const projectItems: MenuItem[] = projects.map((p) => ({ id: p.cwd, label: p.name, icon: checkMark(p.cwd === installCwd), onSelect: () => setProject(p.cwd) }));

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
            <form className="flex items-center gap-2" onSubmit={prevented(install)}>
              <label className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line2 bg-field px-3 font-mono text-body focus-within:border-accent focus-within:shadow-focus">
                <span className="text-ok">$</span>
                <span className="text-muted">pi install</span>
                <input aria-label="Package source" placeholder="npm:pi-lint-skills" value={source} onChange={(e) => setSource(e.target.value)} className="min-w-0 flex-1 bg-transparent text-fg outline-none" />
              </label>
              <Button variant="primary" type="submit" disabled={!source.trim() || installing}>
                {installing ? <Spinner size={12} /> : <Icon name="import" size={14} />}Install<Kbd onFill>↵</Kbd>
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

        {current && <PackageDetail pkg={current} busy={busy(current)} />}
      </main>

      <aside className="flex min-h-0 flex-col gap-3 border-l border-line bg-side p-3.5">
        <GalleryPanel onPick={setSource} />

        <Card>
          <CardHeader>Project trust<LinkButton className="ml-auto" onClick={() => actions.openSettings("trust")}>Change</LinkButton></CardHeader>
          <CardBody className="flex flex-col gap-1.5 text-sm">
            {packages?.trust.map((t) => (
              <div key={t.cwd} className="flex items-center gap-2">
                <span className="text-muted"><Icon name="folder" size={13} /></span>
                <span className="truncate text-sub">{t.name}</span>
                <span className={cx("ml-auto shrink-0", TRUST_VIEW[String(t.trusted)].color)}>{TRUST_VIEW[String(t.trusted)].text}</span>
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
