import { useEffect, useState } from "react";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { cx, LinkButton } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { isTypingTarget } from "#renderer/ui/keys";
import { Card, CardBody, CardHeader } from "#renderer/ui/surfaces";
import { GalleryCard } from "./GalleryCard";
import { InstallCard } from "./InstallCard";
import { InstalledList, keyOf } from "./InstalledList";
import { PackageDetail } from "./PackageDetail";
import { TRUST, trustChoice } from "./trust";

/** Board 4: install extensions, skills, prompts and themes — for every project or for one. */
export function Packages() {
  const packages = useStore((s) => s.packages);
  const work = useStore((s) => s.packageWork);
  const [picked, setPicked] = useState<string>();
  const [source, setSource] = useState("");

  useEffect(() => void actions.loadPackages(), []);

  const all = packages ? [...packages.global, ...packages.projects.flatMap((p) => p.packages)] : [];
  const current = all.find((p) => keyOf(p) === picked) ?? all[0];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || !current || work[current.source]) return;
    const k = e.key.toLowerCase();
    if (k === "d") actions.changePackage({ action: "remove", source: current.source, cwd: current.cwd });
    if (k === "r") actions.reloadPackages();
    if (k === "u" && current.kind !== "local" && current.installed) actions.changePackage({ action: "update", source: current.source, cwd: current.cwd });
  };

  return (
    <div tabIndex={-1} onKeyDown={onKeyDown} className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_340px] outline-none">
      <InstalledList count={all.length} current={current} onPick={setPicked} />

      <main className="flex min-h-0 flex-col gap-3.5 overflow-auto p-[22px] [&>*]:shrink-0">
        <InstallCard source={source} onSource={setSource} />
        {current && <PackageDetail pkg={current} />}
      </main>

      <aside className="flex min-h-0 flex-col gap-3 border-l border-line bg-side p-3.5">
        <GalleryCard onPick={setSource} />

        <Card>
          <CardHeader>Project trust<LinkButton className="ml-auto" onClick={() => actions.openSettings("trust")}>Change</LinkButton></CardHeader>
          <CardBody className="flex flex-col gap-1.5 text-sm">
            {packages?.trust.map((t) => (
              <div key={t.cwd} className="flex items-center gap-2">
                <span className="text-muted"><Icon name="folder" size={13} /></span>
                <span className="truncate text-sub">{t.name}</span>
                <span className={cx("ml-auto shrink-0", TRUST[trustChoice(t.trusted)].className)}>{TRUST[trustChoice(t.trusted)].status}</span>
              </div>
            ))}
            <span className="text-xs text-muted">Project packages load only in trusted projects.</span>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
