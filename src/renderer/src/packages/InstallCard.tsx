import { useState } from "react";
import { folderName } from "#renderer/chat/format";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button, Kbd, pill, Spinner } from "#renderer/ui/base";
import { Segmented } from "#renderer/ui/controls";
import { Icon } from "#renderer/ui/Icon";
import { Menu, type MenuItem } from "#renderer/ui/Menu";
import { Card, CardBody, CardHeader } from "#renderer/ui/surfaces";

/** The "pi install" box, for every project or for one, and the package work in progress. */
export function InstallCard({ source, onSource }: { source: string; onSource: (source: string) => void }) {
  const work = useStore((s) => s.packageWork);
  const projects = useStore((s) => s.projects);
  const [forProject, setForProject] = useState<"global" | "project">("global");
  const [project, setProject] = useState<string>();
  const [projectMenu, setProjectMenu] = useState<{ x: number; y: number }>();
  const installCwd = forProject === "project" ? (project ?? projects[0]?.cwd) : undefined;
  const busy = !!work[source.trim()];

  const install = () => {
    const s = source.trim().replace(/^pi install\s+/, "");
    if (s) actions.changePackage({ action: "install", source: s, cwd: installCwd, onDone: () => onSource("") });
  };

  const projectItems: MenuItem[] = projects.map((p) => ({ id: p.cwd, label: p.name, icon: p.cwd === installCwd ? <Icon name="check" size={13} /> : <span className="w-[13px]" />, onSelect: () => setProject(p.cwd) }));

  return (
    <>
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
              <input aria-label="Package source" placeholder="npm:pi-lint-skills" value={source} onChange={(e) => onSource(e.target.value)} className="min-w-0 flex-1 bg-transparent text-fg outline-none" />
            </label>
            <Button variant="primary" type="submit" disabled={!source.trim() || busy}>
              {busy ? <Spinner size={12} /> : <Icon name="import" size={14} />}Install<Kbd onFill>↵</Kbd>
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
      {projectMenu && <Menu at={projectMenu} label="Project" items={projectItems} onClose={() => setProjectMenu(undefined)} />}
    </>
  );
}
