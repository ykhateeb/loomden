import { useState } from "react";
import type { InstalledPackage } from "#protocol";
import { useStore } from "#renderer/store";
import { Label, Pill, Spinner } from "#renderer/ui/base";
import { Segmented } from "#renderer/ui/controls";
import { SearchInput } from "#renderer/ui/Field";
import { Icon } from "#renderer/ui/Icon";
import { ListItem } from "#renderer/ui/surfaces";

type Show = "all" | "global" | "projects";

export const keyOf = (p: InstalledPackage) => `${p.cwd ?? ""}|${p.source}`;

/** The left column: the installed packages, global first, then each project. */
export function InstalledList({ count, current, onPick }: { count: number; current?: InstalledPackage; onPick: (key: string) => void }) {
  const packages = useStore((s) => s.packages);
  const work = useStore((s) => s.packageWork);
  const [show, setShow] = useState<Show>("all");
  const [filter, setFilter] = useState("");
  const q = filter.toLowerCase();
  const match = (p: InstalledPackage) => !q || p.name.toLowerCase().includes(q) || p.source.toLowerCase().includes(q);

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
          <ListItem key={keyOf(p)} active={p === current} onClick={() => onPick(keyOf(p))} meta={work[p.source] ? <Spinner size={10} /> : <span className="font-mono">{p.version ?? p.kind}</span>}>
            <span className="text-muted"><Icon name="box" size={14} /></span>
            <span className="truncate">{p.name}</span>
            {!p.installed && <Pill tone="warn" className="h-[18px] text-[10.5px]">missing</Pill>}
          </ListItem>
        ))}
      </section>
    );
  };

  return (
    <aside className="flex min-h-0 flex-col gap-3 border-r border-line bg-side p-3.5">
      <div className="flex items-center">
        <Label className="flex-1">Installed</Label>
        <span className="text-xs text-muted">{count} packages</span>
      </div>
      <Segmented label="Show" value={show} onChange={setShow} options={[{ value: "all", label: "All" }, { value: "global", label: "Global" }, { value: "projects", label: "Projects" }]} />
      <nav aria-label="Installed packages" className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {!packages && <span className="flex items-center gap-2 px-2.5 text-sm text-muted"><Spinner size={11} />Reading packages…</span>}
        {packages && count === 0 && <span className="px-2.5 text-sm text-muted">No packages yet. Install one, or pick one from the gallery.</span>}
        {packages && show !== "projects" && group("Global", "every project", packages.global)}
        {packages && show !== "global" && packages.projects.map((p) => group(p.name, "this project", p.packages))}
      </nav>
      <SearchInput icon={<Icon name="search" />} aria-label="Filter packages" placeholder="Filter packages" value={filter} onChange={(e) => setFilter(e.target.value)} />
    </aside>
  );
}
