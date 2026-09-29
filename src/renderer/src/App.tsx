import { useEffect } from "react";
import { ApprovalDialog } from "./approvals/ApprovalDialog";
import { SearchDialog } from "./sessions/SearchDialog";
import { TrustDialog } from "./sessions/TrustDialog";
import { actions, useStore } from "./store";
import { TitleBar } from "./TitleBar";
import { Icon } from "./ui/Icon";
import { Toast } from "./ui/surfaces";
import { Packages } from "./packages/Packages";
import { AddProviderDialog } from "./settings/AddProviderDialog";
import { ImportDialog, useFirstStartImport } from "./settings/ImportDialog";
import { LoginDialog } from "./settings/LoginDialog";
import { Settings } from "./settings/Settings";
import { Workspace } from "./Workspace";


export function App() {
  const tab = useStore((s) => s.tab);
  const active = useStore((s) => s.active);
  const dialogs = useStore((s) => s.dialogs);
  const notices = useStore((s) => s.notices);
  const searching = useStore((s) => s.searching);
  const addingProvider = useStore((s) => s.addingProvider);
  const importing = useStore((s) => s.importing);
  useFirstStartImport(useStore((s) => s.agent === "ready"));

  // ⌘K opens the search from anywhere (board 1a).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        actions.setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Trust has no session yet, so it always shows. An extension dialog shows only with its session;
  // other sessions wait, and the title bar says "needs you".
  const trust = dialogs.find((d) => d.method === "trust");
  const ask = dialogs.find((d) => d.method !== "trust" && (!d.key || (tab === "sessions" && d.key === active)));

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg text-fg">
      <TitleBar />
      {tab === "sessions" && <Workspace />}
      {tab === "packages" && <Packages />}
      {tab === "settings" && <Settings />}
      {searching && <SearchDialog />}
      {addingProvider && <AddProviderDialog />}
      {importing && <ImportDialog />}
      <LoginDialog />
      {trust?.method === "trust" ? <TrustDialog key={trust.id} request={trust} /> : ask && ask.method !== "trust" && <ApprovalDialog key={ask.id} request={ask} />}
      <div className="fixed right-4 bottom-4 z-40 flex max-w-[420px] flex-col gap-2" role="status">
        {notices.map((n) => (
          <Toast
            key={n.id}
            level={n.level}
            icon={<span className={n.level === "info" ? "text-ok" : n.level === "warning" ? "text-warn" : "text-danger"}><Icon name={n.level === "info" ? "check" : "warning"} /></span>}
          >
            {n.message}
          </Toast>
        ))}
      </div>
    </div>
  );
}
