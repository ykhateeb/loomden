import { actions, useStore } from "../store";
import { Label } from "../ui/base";
import { Icon, type IconName } from "../ui/Icon";
import { ListItem } from "../ui/surfaces";
import { ModelsPage } from "./ModelsPage";
import { TrustPage } from "./TrustPage";

type Page = "models" | "trust";

/** Board 5: the settings pages. Only the pages the design shows are here. */
export function Settings() {
  const page = useStore((s) => s.settingsPage);
  const setPage = (p: Page) => actions.openSettings(p);
  const trust = useStore((s) => s.packages?.trust.length);

  const item = (id: Page, icon: IconName, label: string, meta?: React.ReactNode) => (
    <ListItem active={page === id} onClick={() => setPage(id)} meta={meta}>
      <span className="text-muted"><Icon name={icon} size={14} /></span>
      {label}
    </ListItem>
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-1 border-r border-line bg-side px-3 py-3.5">
        <Label className="px-2.5 pt-1 pb-1">Agent</Label>
        {item("models", "cpu", "Models & providers")}
        <Label className="px-2.5 pt-3 pb-1">Customize</Label>
        <ListItem onClick={() => actions.setTab("packages")} meta="Packages →">
          <span className="text-muted"><Icon name="bolt" size={14} /></span>Extensions
        </ListItem>
        {item("trust", "shield", "Project trust", trust)}
        <div className="mx-1 my-1.5 h-px bg-line" />
        <ListItem onClick={() => actions.setImporting(true)}>
          <span className="text-muted"><Icon name="download" size={14} /></span>Import from pi
        </ListItem>
        <div className="mt-auto flex items-center gap-2.5 border-t border-line px-2 pt-3">
          <span className="text-muted"><Icon name="package" size={16} /></span>
          <div className="flex flex-col">
            <b className="text-sm font-semibold">Tau 0.1</b>
            <span className="text-xs text-muted">Unofficial app for pi</span>
          </div>
        </div>
      </aside>
      {page === "models" ? <ModelsPage /> : <TrustPage />}
    </div>
  );
}
