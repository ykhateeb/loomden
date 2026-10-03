import { useEffect } from "react";
import { ApprovalDialog } from "./approvals/ApprovalDialog";
import { SearchDialog } from "./sessions/SearchDialog";
import { TrustDialog } from "./sessions/TrustDialog";
import { actions } from "./actions";
import { useStore } from "./store";
import { TitleBar } from "./TitleBar";
import { LinkButton } from "./ui/base";
import { Icon } from "./ui/Icon";
import { isTypingTarget } from "./ui/keys";
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

  // ⌘K opens the search (board 1a) and ⌘N a new session (board 1.1), from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⇧C: the design canvas of the open session, when you are not typing.
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "c" && !isTypingTarget(e.target)) {
        return void (active && (e.preventDefault(), actions.canvas(active)));
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k") actions.setSearching(true);
      else if (key === "n") actions.newSession();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

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
            icon={<span className={n.level === "info" ? "text-ok" : n.level === "warning" ? "text-warn" : "text-danger"}><Icon name={n.level === "info" ? "check" : "alert"} /></span>}
          >
            {n.message}
            {n.action && <LinkButton className="ml-1.5 text-sm" onClick={n.action.run}>{n.action.label}</LinkButton>}
          </Toast>
        ))}
      </div>
    </div>
  );
}
